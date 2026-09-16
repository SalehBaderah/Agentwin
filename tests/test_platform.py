import asyncio
import json
import time

import pytest
from fastapi.testclient import TestClient

from backend.agent import answer, run_tool
from backend.main import create_app
from backend.runtime import Runtime
from backend.store import Store
from backend.templates import definition
from gateway.serial_gateway import validate_command, validate_line


@pytest.fixture
def store(tmp_path):
    result = Store(str(tmp_path / 'test.db'))
    result.seed()
    yield result
    result.db.close()


def session(store):
    return store.session('smart-connectivity', mode='live')['id']


def packet(seq=0, boot='boot-1', led_on=False, command_id=None):
    return {
        'schema_version': 1, 'project_id': 'smart-connectivity', 'device_id': 'uno-r4-01',
        'boot_id': boot, 'sequence': seq, 'uptime_ms': seq * 1000,
        'readings': {'led_on': led_on, 'last_command_id': command_id},
    }


def test_only_led_project_and_live_session(store):
    projects = store.projects()
    assert [project['id'] for project in projects] == ['smart-connectivity']
    state = store.state('smart-connectivity')
    assert state['project']['name'] == 'UNO R4 LED'
    assert [item['mode'] for item in state['sessions']] == ['live']
    assert set(state['project']['graph']['fields']) == {'led_on', 'last_command_id'}
    assert [item['id'] for item in state['project']['graph']['components'][:4]] == ['board', 'resistor', 'led', 'ground']
    with pytest.raises(ValueError, match='Only the live'):
        store.create_session('smart-connectivity', 'simulated')


def test_telemetry_validation_deduplication_and_reboot(store):
    sid = session(store)
    start = time.time()
    assert store.ingest(packet(), sid, now=start)['accepted']
    assert not store.ingest(packet(), sid, now=start + 1)['accepted']
    assert not store.ingest(packet(1), sid, retained=True)['accepted']
    assert store.ingest(packet(0, 'boot-2'), sid, now=start + 2)['accepted']
    unknown = packet(1, 'boot-2')
    unknown['readings']['rf_detector_v'] = 1.2
    with pytest.raises(ValueError, match='Unknown field'):
        store.ingest(unknown, sid)
    wrong_type = packet(1, 'boot-2')
    wrong_type['readings']['led_on'] = 1
    with pytest.raises(ValueError, match='boolean'):
        store.ingest(wrong_type, sid)


def test_led_action_requires_live_gateway_and_matching_state(store):
    runtime = Runtime(store)
    live = session(store)
    with pytest.raises(ValueError, match='gateway'):
        runtime.component_action('smart-connectivity', live, 'led', 'set_led', True)
    store.execute('INSERT OR REPLACE INTO gateways VALUES (?,?,?)', ('smart-connectivity', time.time(), 1))

    class Published:
        rc = 0

    class Client:
        def publish(self, topic, payload, qos, retain):
            assert topic == 'agentwin/smart-connectivity/uno-r4-01/command'
            assert json.loads(payload)['value'] is True
            return Published()

    runtime.client, runtime.mqtt_connected = Client(), True
    requested = runtime.component_action('smart-connectivity', live, 'led', 'set_led', True)
    assert store.ingest(packet(0, led_on=False, command_id=requested['id']), live)['accepted']
    assert store.rows('SELECT status FROM actions WHERE id=?', (requested['id'],))[0]['status'] == 'requested'
    assert store.ingest(packet(1, led_on=True, command_id=requested['id']), live)['accepted']
    assert store.rows('SELECT status FROM actions WHERE id=?', (requested['id'],))[0]['status'] == 'completed'


def test_gateway_boundaries(store):
    text = json.dumps(packet())
    assert json.loads(validate_line(text, 'smart-connectivity', 'uno-r4-01'))['readings']['led_on'] is False
    with pytest.raises(ValueError):
        validate_line(text, 'other-project', 'uno-r4-01')
    command = {'schema_version': 1, 'command_id': 'action-1', 'action': 'set_led', 'component_id': 'led', 'value': True}
    assert json.loads(validate_command(json.dumps(command)))['value'] is True
    command['action'] = 'arbitrary'
    with pytest.raises(ValueError):
        validate_command(json.dumps(command))


def test_twin_wiring_and_agent_scope(store, monkeypatch):
    graph = definition()
    pairs = {(edge['source'], edge['target']) for edge in graph['edges']}
    assert {('board', 'resistor'), ('resistor', 'led'), ('led', 'ground')} <= pairs
    assert next(component for component in graph['components'] if component['id'] == 'led')['capabilities'] == ['action:set_led']
    sid = session(store)
    assert run_tool(store, 'smart-connectivity', sid, 'get_project_state', {'id': None})['session']['mode'] == 'live'
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    result = asyncio.run(answer(store, 'smart-connectivity', sid, 'What is the LED state?'))
    assert result['available'] is False


def test_http_exposes_one_live_project_and_no_creation_or_simulation(tmp_path):
    app = create_app(str(tmp_path / 'http.db'), background=False)
    with TestClient(app) as client:
        projects = client.get('/api/projects').json()
        assert len(projects) == 1
        state = projects[0]
        assert state['project']['id'] == 'smart-connectivity'
        assert state['session']['mode'] == 'live'
        assert client.post('/api/projects', json={'name': 'other'}).status_code == 405
        assert client.post(f"/api/projects/smart-connectivity/sessions/{state['session']['id']}/scenario", json={'scenario': 'normal'}).status_code == 405
        with client.websocket_connect('/api/ws') as websocket:
            assert websocket.receive_json()['type'] == 'snapshot'
