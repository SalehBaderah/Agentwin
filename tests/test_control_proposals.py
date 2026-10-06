import asyncio
import json
import time
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from backend.agent import answer
from backend.control_proposals import control_answer, control_intent, propose_control
from backend.main import create_app
from backend.models import ProjectCreate
from backend.runtime import Runtime
from backend.store import Store
from gateway.serial_gateway import validate_command


class Broker:
    def __init__(self, rc=0): self.sent, self.rc = [], rc
    def publish(self, topic, payload, qos, retain):
        self.sent.append((topic, json.loads(payload), qos, retain))
        return SimpleNamespace(rc=self.rc)
    def disconnect(self): pass
    def loop_stop(self): pass


@pytest.fixture
def setup(tmp_path):
    store = Store(str(tmp_path / 'controls.db'))
    project = store.create_project(ProjectCreate(name='New system', template='led', device_id='board-01', connector='usb'))
    sid = store.session(project['id'], mode='live')['id']
    runtime = Runtime(store)
    runtime.client, runtime.mqtt_connected = Broker(), True
    store.execute('INSERT INTO gateways VALUES (?,?,?,?)', (project['id'], project['device_id'], time.time(), 1))
    yield store, project, sid, runtime
    store.db.close()


def packet(project, sequence, state, command_id):
    return {'schema_version': 1, 'project_id': project['id'], 'device_id': project['device_id'], 'boot_id': 'boot',
            'sequence': sequence, 'uptime_ms': sequence * 1000, 'session_registration': True,
            'readings': {'led_on': state, 'last_command_id': command_id}}


@pytest.mark.parametrize('text', ['Turn the LED on', 'Please switch on the LED?', 'Propose turning it on', 'Set led to 40'])
def test_intent_does_not_dispatch(text, setup):
    store, project, sid, runtime = setup
    control_answer(store, project['id'], sid, text)
    assert runtime.client.sent == []
    assert store.rows('SELECT * FROM action_expectations') == []


@pytest.mark.parametrize('text', ['Do not turn LED on', 'Turn LED on if temperature is high', 'When stale turn LED off', 'Explain "turn LED on"', 'Turn LED on and off', 'Turn LED on every minute'])
def test_negated_conditional_explanatory_and_scheduled_requests_are_not_actions(text):
    assert control_intent(text) is None


def test_proposals_are_persistent_deduplicated_and_have_no_expectation(setup):
    store, project, sid, runtime = setup
    first = propose_control(store, project['id'], sid, 'led', 'set_led', True)
    again = propose_control(store, project['id'], sid, 'led', 'set_led', True)
    assert first['id'] == again['id']
    assert first['status'] == 'awaiting_confirmation'
    assert runtime.client.sent == []
    assert store.rows('SELECT * FROM action_expectations') == []
    state = store.state(project['id'], sid)
    assert state['actions'][0]['proposal']['device_id'] == project['device_id']
    assert 'contract' not in state['actions'][0]['proposal']
    reopened = Store(store.rows('PRAGMA database_list')[0]['file'])
    assert reopened.actions(project['id'], sid)[0]['proposal']['id'] == first['id']
    reopened.db.close()


def test_confirmation_sends_once_and_only_matching_telemetry_completes(setup):
    store, project, sid, runtime = setup
    proposal = propose_control(store, project['id'], sid, 'led', 'set_led', True)
    result = runtime.confirm_control_proposal(project['id'], sid, proposal['id'])
    assert result['id'] == proposal['id'] and result['status'] == 'requested'
    assert len(runtime.client.sent) == 1
    topic, message, qos, retain = runtime.client.sent[0]
    assert topic == f"agentwin/{project['id']}/{project['device_id']}/command" and qos == 1 and not retain
    assert message['command_id'] == proposal['id'] and message['value'] is True
    with pytest.raises(ValueError, match='already been handled'):
        runtime.confirm_control_proposal(project['id'], sid, proposal['id'])
    assert len(runtime.client.sent) == 1
    store.ingest(packet(project, 1, False, proposal['id']), sid)
    assert store.actions(project['id'], sid)[0]['status'] == 'requested'
    store.ingest(packet(project, 2, True, 'other-command'), sid)
    assert store.actions(project['id'], sid)[0]['status'] == 'requested'
    store.ingest(packet(project, 3, True, proposal['id']), sid)
    assert store.actions(project['id'], sid)[0]['status'] == 'completed'


def test_concurrent_confirmation_claims_a_proposal_once(setup):
    store, project, sid, runtime = setup
    proposal = propose_control(store, project['id'], sid, 'led', 'set_led', False)
    def confirm():
        try: return runtime.confirm_control_proposal(project['id'], sid, proposal['id'])['status']
        except ValueError: return 'rejected'
    with ThreadPoolExecutor(2) as pool:
        assert sorted(pool.map(lambda _: confirm(), range(2))) == ['rejected', 'requested']
    assert len(runtime.client.sent) == 1


def test_cancel_expiry_scope_and_connection_checks_never_publish(setup):
    store, project, sid, runtime = setup
    proposal = propose_control(store, project['id'], sid, 'led', 'set_led', True)
    other = store.create_project(ProjectCreate(name='Other system', template='led', device_id='other', connector='mqtt'))
    other_sid = store.session(other['id'], mode='live')['id']
    with pytest.raises(ValueError): runtime.confirm_control_proposal(other['id'], other_sid, proposal['id'])
    simulated = store.session(project['id'], mode='simulated')['id']
    with pytest.raises(ValueError): runtime.confirm_control_proposal(project['id'], simulated, proposal['id'])
    with pytest.raises(ValueError, match='Live'): propose_control(store, project['id'], simulated, 'led', 'set_led', True)
    store.execute("UPDATE sessions SET mode='replay' WHERE id=?", (simulated,))
    with pytest.raises(ValueError, match='Live'): propose_control(store, project['id'], simulated, 'led', 'set_led', True)
    runtime.mqtt_connected = False
    with pytest.raises(ValueError, match='broker'): runtime.confirm_control_proposal(project['id'], sid, proposal['id'])
    runtime.mqtt_connected = True
    store.execute('UPDATE gateways SET online=0')
    with pytest.raises(ValueError, match='gateway'): runtime.confirm_control_proposal(project['id'], sid, proposal['id'])
    runtime.cancel_control_proposal(project['id'], sid, proposal['id'])
    with pytest.raises(ValueError): runtime.confirm_control_proposal(project['id'], sid, proposal['id'])
    expired = propose_control(store, project['id'], sid, 'led', 'set_led', False)
    store.execute('UPDATE action_proposals SET expires=? WHERE action_id=?', (time.time()-1, expired['id']))
    with pytest.raises(ValueError, match='expired'): runtime.confirm_control_proposal(project['id'], sid, expired['id'])
    assert store.actions(project['id'], sid)[0]['status'] == 'expired'
    assert runtime.client.sent == []


def test_configuration_changes_invalidate_the_review(setup):
    store, project, sid, runtime = setup
    proposal = propose_control(store, project['id'], sid, 'led', 'set_led', True)
    project['graph']['components'][-1]['configuration']['pin'] = 'D8'
    store.execute('UPDATE projects SET config=? WHERE id=?', (json.dumps(project), project['id']))
    with pytest.raises(ValueError, match='configuration changed'):
        runtime.confirm_control_proposal(project['id'], sid, proposal['id'])
    assert runtime.client.sent == []
    assert store.actions(project['id'], sid)[0]['status'] == 'invalidated'


@pytest.mark.parametrize('kind,value,action', [('integer', 42, 'set_speed'), ('number', 0.5, 'set_level'), ('string', 'manual', 'set_mode')])
def test_future_capabilities_are_generic_and_validate_parameters(setup, kind, value, action):
    store, project, sid, runtime = setup
    component = project['graph']['components'][-1]
    component.update(id='future-device-control', name='Future actuator', capabilities=[f'action:{action}'])
    parameter = {'type': kind, **({'minimum': 0, 'maximum': 100} if kind != 'string' else {'allowed_values': ['manual', 'auto']})}
    control = component['controls'][0]
    control.update(action=action, label='Future setting', parameters={'value': parameter}, capability_id=f'future.{action}')
    capability = project['graph']['capabilities'][0]
    capability.update(id=control['capability_id'], component_id=component['id'], command=action, parameters=control['parameters'])
    project['graph']['fields']['led_on']['data_type'] = 'categorical' if kind == 'string' else 'number'
    store.execute('UPDATE projects SET config=? WHERE id=?', (json.dumps(project), project['id']))
    request = {'component_id': component['id'], 'action': action, 'value': value}
    response = control_answer(store, project['id'], sid, 'Prepare this setting', control_request=request)
    assert response['control_proposal']['action'] == action
    natural = control_answer(store, project['id'], sid, f'Set future-device-control to {json.dumps(value)}')
    assert natural['control_proposal']['id'] == response['control_proposal']['id']
    assert runtime.client.sent == []
    runtime.confirm_control_proposal(project['id'], sid, response['control_proposal']['id'])
    assert runtime.client.sent[0][1]['action'] == action and runtime.client.sent[0][1]['value'] == value
    forwarded = validate_command(json.dumps(runtime.client.sent[0][1]), project['id'], project['device_id'])
    assert json.loads(forwarded)['value'] == value
    store.ingest(packet(project, 1, value, response['control_proposal']['id']), sid)
    assert store.actions(project['id'], sid)[0]['status'] == 'completed'
    invalid = -1 if kind != 'string' else 'unsupported'
    with pytest.raises(ValueError): propose_control(store, project['id'], sid, component['id'], action, invalid)


def test_provider_unavailable_can_only_prepare_and_readonly_cannot_control(setup, monkeypatch):
    store, project, sid, runtime = setup
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    monkeypatch.setenv('LLM_PROVIDER', 'openai')
    response = asyncio.run(answer(store, project['id'], sid, 'Turn the LED on'))
    assert response['source'] == 'controller' and response['control_proposal']['value'] is True
    assert runtime.client.sent == []
    readonly = store.create_project(ProjectCreate(name='Detector', template='connectivity', device_id='detector', connector='mqtt'))
    result = control_answer(store, readonly['id'], store.session(readonly['id'], mode='live')['id'], 'Turn the LED on')
    assert 'control_proposal' not in result
    with pytest.raises(ValueError): propose_control(store, project['id'], sid, 'led', 'set_led', 1)


def test_pending_timeout_and_publish_failure_keep_truthful_status(setup):
    store, project, sid, runtime = setup
    first = propose_control(store, project['id'], sid, 'led', 'set_led', True)
    second = propose_control(store, project['id'], sid, 'led', 'set_led', False)
    runtime.confirm_control_proposal(project['id'], sid, first['id'])
    with pytest.raises(ValueError, match='already pending'):
        runtime.confirm_control_proposal(project['id'], sid, second['id'])
    assert len(runtime.client.sent) == 1
    store.execute('UPDATE action_expectations SET deadline=? WHERE action_id=?', (time.time()-1, first['id']))
    store.evaluate(project['id'], sid)
    assert next(row for row in store.actions(project['id'], sid) if row['id'] == first['id'])['status'] == 'timed_out'
    runtime.client.rc = 4
    with pytest.raises(ValueError, match='published'):
        runtime.confirm_control_proposal(project['id'], sid, second['id'])
    store.ingest(packet(project, 1, False, second['id']), sid)
    assert store.actions(project['id'], sid)[0]['status'] == 'failed'


def test_deleted_capability_invalidates_confirmation_and_project_delete_cleans_up(setup):
    store, project, sid, runtime = setup
    proposal = propose_control(store, project['id'], sid, 'led', 'set_led', True)
    project['graph']['components'][-1]['controls'] = []
    store.execute('UPDATE projects SET config=? WHERE id=?', (json.dumps(project), project['id']))
    with pytest.raises(ValueError, match='configuration changed'):
        runtime.confirm_control_proposal(project['id'], sid, proposal['id'])
    assert store.actions(project['id'], sid)[0]['status'] == 'invalidated'
    store.delete_project(project['id'])
    assert store.rows('SELECT * FROM action_proposals') == []
    assert runtime.client.sent == []


@pytest.mark.parametrize('changes', [{'value': {}}, {'value': [1]}, {'value': None}, {'value': float('nan')}, {'value': float('inf')}, {'value': 'x'*257}, {'action': 'arbitrary command'}, {'shell': 'echo unsafe'}, {'schema_version': True}])
def test_gateway_rejects_invalid_generic_envelopes(changes):
    envelope = {'schema_version': 1, 'project_id': 'project', 'device_id': 'device', 'command_id': 'request', 'component_id': 'actuator', 'action': 'set_level', 'value': 0.5}
    with pytest.raises(ValueError): validate_command(json.dumps({**envelope, **changes}), 'project', 'device')


def test_http_prepare_confirm_cancel_do_not_accept_model_scope_overrides(tmp_path):
    app = create_app(str(tmp_path / 'http-controls.db'), background=False)
    with TestClient(app) as client:
        project = client.post('/api/projects', json={'name': 'LED', 'template': 'led', 'device_id': 'uno', 'connector': 'mqtt'}).json()
        pid, store = project['id'], app.state.store
        sid = store.session(pid, mode='live')['id']
        app.state.runtime.client, app.state.runtime.mqtt_connected = Broker(), True
        base = f'/api/projects/{pid}/sessions/{sid}'
        prepared = client.post(base+'/agent', json={'question': 'Prepare to turn LED on'})
        assert prepared.status_code == 200
        action_id = prepared.json()['control_proposal']['id']
        assert app.state.runtime.client.sent == []
        rejected = client.post(base+'/agent', json={'question': 'Prepare', 'control_request': {'component_id': 'led', 'action': 'set_led', 'value': True, 'project_id': 'other'}})
        assert rejected.status_code == 422
        assert client.post(base+f'/actions/{action_id}/confirm').status_code == 202
        assert len(app.state.runtime.client.sent) == 1
        assert client.post(base+f'/actions/{action_id}/confirm').status_code == 400
        second = client.post(base+'/agent', json={'question': 'Draft turn LED off'}).json()['control_proposal']['id']
        assert client.post(base+f'/actions/{second}/cancel').json()['status'] == 'cancelled'
        assert len(app.state.runtime.client.sent) == 1


@pytest.mark.parametrize('question', ['Turn on the LED', 'Turn the LED off', 'Please switch on the LED', 'Can you turn LED off?'])
def test_direct_operator_requests_dispatch_without_second_confirmation(setup, question):
    store, project, sid, runtime = setup
    response = asyncio.run(answer(store, project['id'], sid, question, control_dispatch=runtime.confirm_control_proposal))
    command = response['control_proposal']
    assert command['status'] == 'requested'
    assert len(runtime.client.sent) == 1
    assert runtime.client.sent[0][1]['command_id'] == command['id']
    assert store.actions(project['id'], sid)[0]['status'] == 'requested'
    with pytest.raises(ValueError): runtime.confirm_control_proposal(project['id'], sid, command['id'])
    store.ingest(packet(project, 1, command['value'], 'wrong-command'), sid)
    assert store.actions(project['id'], sid)[0]['status'] == 'requested'
    store.ingest(packet(project, 2, command['value'], command['id']), sid)
    assert store.actions(project['id'], sid)[0]['status'] == 'completed'


@pytest.mark.parametrize('question', ['Draft turn LED on', 'Propose to turn the LED on', 'Please prepare a command to turn LED off'])
def test_explicit_drafts_never_dispatch_even_with_runtime(setup, question):
    store, project, sid, runtime = setup
    result = control_answer(store, project['id'], sid, question, dispatch=runtime.confirm_control_proposal)
    assert result['control_proposal']['status'] == 'awaiting_confirmation'
    assert runtime.client.sent == []


def test_direct_requests_fail_without_leaving_a_sendable_draft(setup):
    store, project, sid, runtime = setup
    runtime.mqtt_connected = False
    result = control_answer(store, project['id'], sid, 'Turn LED on', dispatch=runtime.confirm_control_proposal)
    assert result['finding'] == 'No command was sent.'
    assert result['control_proposal']['status'] == 'failed'
    assert store.actions(project['id'], sid)[0]['status'] == 'failed'
    assert runtime.client.sent == []
    runtime.mqtt_connected = True
    result = control_answer(store, project['id'], sid, 'Turn LED on', dispatch=runtime.confirm_control_proposal)
    assert result['control_proposal']['status'] == 'requested'
    duplicate = control_answer(store, project['id'], sid, 'Turn LED on', dispatch=runtime.confirm_control_proposal)
    assert duplicate['control_proposal']['status'] == 'failed'
    assert len(runtime.client.sent) == 1


def test_direct_controls_are_live_only_and_unknown_or_ambiguous_requests_never_dispatch(setup):
    store, project, sid, runtime = setup
    simulated = store.create_session(project['id'], 'simulated')['id']
    result = control_answer(store, project['id'], simulated, 'Turn LED on', dispatch=runtime.confirm_control_proposal)
    assert 'control_proposal' not in result
    store.execute("UPDATE sessions SET mode='replay' WHERE id=?", (simulated,))
    result = control_answer(store, project['id'], simulated, 'Turn LED on', dispatch=runtime.confirm_control_proposal)
    assert 'control_proposal' not in result
    assert control_answer(store, project['id'], sid, 'Turn pump on', dispatch=runtime.confirm_control_proposal)['finding'].startswith('No matching')
    for question in ('Do not turn LED on', 'Turn LED on if stale', 'Explain turn LED on'):
        assert control_answer(store, project['id'], sid, question, dispatch=runtime.confirm_control_proposal) is None
    another = json.loads(json.dumps(project['graph']['components'][-1]))
    another['id'] = 'another-led'
    project['graph']['components'].append(another)
    store.execute('UPDATE projects SET config=? WHERE id=?', (json.dumps(project), project['id']))
    result = control_answer(store, project['id'], sid, 'Turn LED on', dispatch=runtime.confirm_control_proposal)
    assert 'control_proposal' not in result
    assert runtime.client.sent == []


def test_agent_http_direct_chat_sends_immediately_without_a_model(tmp_path, monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    monkeypatch.setenv('LLM_PROVIDER', 'openai')
    app = create_app(str(tmp_path / 'direct-http.db'), background=False)
    with TestClient(app) as client:
        project = client.post('/api/projects', json={'name': 'Future system', 'template': 'led', 'device_id': 'future', 'connector': 'mqtt'}).json()
        store, runtime = app.state.store, app.state.runtime
        runtime.client, runtime.mqtt_connected = Broker(), True
        sid = store.session(project['id'], mode='live')['id']
        base = f'/api/projects/{project["id"]}/sessions/{sid}'
        rejected = client.post(base+'/agent', json={'question': 'b7377d9280ad426d81beb840acf462c8'}).json()
        assert rejected['finding'].startswith('No command was sent.')
        assert store.actions(project['id'], sid) == [] and runtime.client.sent == []
        result = client.post(base+'/agent', json={'question': 'Turn on the LED'}).json()
        assert result['control_proposal']['status'] == 'requested'
        assert len(runtime.client.sent) == 1
        action_id = result['control_proposal']['id']
        store.ingest(packet(project, 1, True, action_id), sid)
        assert store.actions(project['id'], sid)[0]['status'] == 'completed'
        component = project['graph']['components'][-1]
        component['capabilities'] = ['action:set_level']
        component['controls'][0].update(action='set_level', parameters={'value': {'type': 'number', 'minimum': 0, 'maximum': 1}})
        project['graph']['capabilities'][0]['command'] = 'set_level'
        project['graph']['fields']['led_on']['data_type'] = 'number'
        store.execute('UPDATE projects SET config=? WHERE id=?', (json.dumps(project), project['id']))
        result = client.post(base+'/agent', json={'question': 'Send Level', 'control_request': {'component_id': 'led', 'action': 'set_level', 'value': 0.5}}).json()
        assert result['control_proposal']['status'] == 'requested'
        assert runtime.client.sent[-1][1]['value'] == 0.5
