import asyncio, json, time
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from backend.main import create_app
from backend.models import DeviceCreate, ProjectCreate
from backend.runtime import Runtime, sample
from backend.store import Store
from backend.templates import definition
from gateway.serial_gateway import validate_command, validate_line

@pytest.fixture
def store(tmp_path):
    value = Store(str(tmp_path/'test.db')); value.seed(); yield value; value.db.close()

def packet(project, sequence=0, boot='boot-1', readings=None):
    return {'schema_version': 1, 'project_id': project['id'], 'device_id': project['device_id'], 'boot_id': boot, 'sequence': sequence, 'uptime_ms': sequence * 1000, 'readings': readings or {project['graph']['primary_field']: 24.0}}

def test_multiple_projects_persist_and_ingest_independently(store):
    led = store.project('smart-connectivity')
    temperature = store.create_project(ProjectCreate(name='Room', template='temperature', device_id='temp-01', connector='mqtt'))
    store.register_device(temperature['id'], DeviceCreate(device_id='temp-02', connector='usb', serial_port='COM9'))
    assert {device['id'] for device in store.project(temperature['id'])['devices']} == {'temp-01', 'temp-02'}
    led_live, temp_live = store.session(led['id'], mode='live')['id'], store.session(temperature['id'], mode='live')['id']
    assert store.ingest(packet(led, readings={'led_on': False, 'last_command_id': None}), led_live)['accepted']
    assert store.ingest(packet(temperature, readings={'temperature_c': 22.5}), temp_live)['accepted']
    assert store.state(led['id'], led_live)['latest']['readings']['led_on'] is False
    assert store.state(temperature['id'], temp_live)['latest']['readings']['temperature_c'] == 22.5
    reopened = Store(store.rows('PRAGMA database_list')[0]['file']); reopened.seed()
    assert {project['id'] for project in reopened.projects()} >= {led['id'], temperature['id']}; reopened.db.close()

def test_templates_bind_project_specific_fields():
    led = definition('led', device_id='uno-r4-01', connector='usb')
    temp = definition('temperature', device_id='temp-01', connector='mqtt')
    generic = definition('generic', {'field': 'humidity', 'unit': '%'}, device_id='sensor-01')
    assert led['fields']['led_on']['data_type'] == 'boolean'
    assert temp['fields']['temperature_c']['unit'] == '°C'
    assert generic['fields']['humidity']['component_id'] == 'sensor'

def test_action_requires_matching_device_reported_state(store):
    project, runtime = store.project('smart-connectivity'), Runtime(store)
    sid = store.session(project['id'], mode='live')['id']
    store.execute('INSERT OR REPLACE INTO gateways VALUES (?,?,?,?)', (project['id'], project['device_id'], time.time(), 1))
    class Published: rc = 0
    class Client:
        def publish(self, topic, payload, qos, retain):
            assert topic == 'agentwin/smart-connectivity/uno-r4-01/command'; return Published()
    runtime.client, runtime.mqtt_connected = Client(), True
    action = runtime.component_action(project['id'], sid, 'led', 'set_led', True)
    assert store.ingest(packet(project, readings={'led_on': False, 'last_command_id': action['id']}), sid)['accepted']
    assert store.rows('SELECT status FROM actions WHERE id=?', (action['id'],))[0]['status'] == 'requested'
    assert store.ingest(packet(project, 1, readings={'led_on': True, 'last_command_id': 'unrelated-command'}), sid)['accepted']
    assert store.rows('SELECT status FROM actions WHERE id=?', (action['id'],))[0]['status'] == 'requested'
    assert store.ingest(packet(project, 2, readings={'led_on': True, 'last_command_id': action['id']}), sid)['accepted']
    assert store.rows('SELECT status FROM actions WHERE id=?', (action['id'],))[0]['status'] == 'completed'

def test_commands_and_telemetry_are_scoped(store):
    project = store.project('smart-connectivity'); text = json.dumps(packet(project, readings={'led_on': False, 'last_command_id': None}))
    assert json.loads(validate_line(text, project['id'], project['device_id']))['project_id'] == project['id']
    with pytest.raises(ValueError): validate_line(text, 'other-project', project['device_id'])
    command = {'schema_version': 1, 'command_id': 'action-1', 'action': 'set_led', 'component_id': 'led', 'value': True}
    assert json.loads(validate_command(json.dumps(command)))['value'] is True

def test_http_onboarding_and_project_sessions(tmp_path):
    app = create_app(str(tmp_path/'http.db'), background=False)
    with TestClient(app) as client:
        created = client.post('/api/projects', json={'name': 'Water tank', 'template': 'water', 'device_id': 'tank-01', 'connector': 'mqtt', 'mapping': {'field': 'ignored', 'unit': 'ignored'}})
        assert created.status_code == 201
        pid = created.json()['id']; state = client.get(f'/api/projects/{pid}').json()
        assert state['project']['graph']['primary_field'] == 'water_level_cm'
        added = client.post(f'/api/projects/{pid}/devices', json={'device_id': 'tank-02', 'connector': 'usb', 'serial_port': 'COM8'})
        assert added.status_code == 201
        assert {device['id'] for device in added.json()['devices']} == {'tank-01', 'tank-02'}
        simulated = client.post(f'/api/projects/{pid}/sessions', json={'mode': 'simulated'})
        assert simulated.status_code == 201
        assert client.get('/api/projects').json()[0]['project']['id'] == 'smart-connectivity'
