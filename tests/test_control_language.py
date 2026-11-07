import asyncio
import json
import os
import re
import time
from types import SimpleNamespace

import pytest

from backend.agent import answer
from backend.models import ProjectCreate
from backend.runtime import Runtime
from backend.store import Store


@pytest.fixture
def language_setup(tmp_path, monkeypatch):
    monkeypatch.setenv('LLM_PROVIDER', 'lmstudio')
    store = Store(str(tmp_path / 'language.db'))
    project = store.create_project(ProjectCreate(name='Indicator board', template='led', device_id='indicator-01', connector='mqtt'))
    sid = store.session(project['id'], mode='live')['id']
    runtime = Runtime(store)
    sent = []
    def publish(topic, payload, qos, retain):
        sent.append(json.loads(payload))
        return SimpleNamespace(rc=0)
    runtime.client = SimpleNamespace(publish=publish)
    runtime.mqtt_connected = True
    yield store, project, sid, runtime, sent
    store.db.close()


def model_client(intent, index=None, value=None, mutate=None, captured=None, quotes=None):
    class Completions:
        async def create(self, **kwargs):
            if captured is not None: captured.update(kwargs)
            if mutate: mutate()
            schema = kwargs['response_format']['json_schema']['name']
            question = json.loads(kwargs['messages'][1]['content']).get('CURRENT_OPERATOR_MESSAGE', '') if schema == 'device_control_intent' else ''
            words = re.findall(r'\w+', question)
            target, operation = quotes or (words[-1] if words else '', words[0] if words else '')
            content = {'intent': intent, 'control_index': index, 'value': value,
                'target_text': target if intent in ('command', 'draft') else None,
                'operation_text': operation if intent in ('command', 'draft') else None} if schema == 'device_control_intent' else {
                'finding': 'Observed configured state.', 'uncertainty': 'No physical action requested.', 'next_step': 'Continue monitoring.', 'evidence_ids': []}
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(content)))])
    return SimpleNamespace(chat=SimpleNamespace(completions=Completions()))


@pytest.mark.parametrize('question,value', [('Please light up the indicator', True), ('Make the indicator illuminate', True), ('Enable the board indicator', True), ('I want the indicator lit', True), ('Keep the indicator dark', False), ('Disable the indicator', False), ('أضئ المؤشر', True), ('Turn it off', False), ('Make it dark', False)])
def test_paraphrases_resolve_via_model_to_registered_controls(language_setup, question, value):
    store, project, sid, runtime, sent = language_setup
    captured = {}
    result = asyncio.run(answer(store, project['id'], sid, question, client=model_client('command', 0, value, captured=captured), control_dispatch=runtime.confirm_control_proposal))
    assert result['control_proposal']['status'] == 'requested'
    assert len(sent) == 1 and sent[0]['action'] == 'set_led' and sent[0]['value'] is value
    package = json.loads(captured['messages'][1]['content'])
    assert package['CURRENT_OPERATOR_MESSAGE'] == question
    assert package['CONTROLS'][0]['component_id'] == 'led'
    assert 'tools' not in captured


def test_read_only_project_is_described_to_model_and_cannot_gain_an_led(language_setup):
    store, _, _, runtime, sent = language_setup
    project = store.create_project(ProjectCreate(name='RF readings', template='connectivity', device_id='rf-01', connector='mqtt'))
    sid = store.session(project['id'], mode='live')['id']
    captured = {}
    result = asyncio.run(answer(store, project['id'], sid, 'Please illuminate the indicator', client=model_client('unsupported', captured=captured), control_dispatch=runtime.confirm_control_proposal))
    assert result['finding'].startswith('No command was sent.')
    package = json.loads(captured['messages'][1]['content'])
    assert package['CONTROLS'] == []
    assert any(component['category'] == 'sensor' for component in package['COMPONENTS'])
    assert sent == []
    # Even a model that invents an actuator cannot select from an empty set.
    invalid = asyncio.run(answer(store, project['id'], sid, 'Illuminate it', client=model_client('command', 0, True), control_dispatch=runtime.confirm_control_proposal))
    assert invalid['available'] is False and sent == []


@pytest.mark.parametrize('intent', ['observe', 'clarify', 'unsupported', 'draft'])
def test_non_execution_intents_never_dispatch(language_setup, intent):
    store, project, sid, runtime, sent = language_setup
    result = asyncio.run(answer(store, project['id'], sid, 'Consider the indicator', client=model_client(intent, 0 if intent == 'draft' else None, True if intent == 'draft' else None), control_dispatch=runtime.confirm_control_proposal))
    assert sent == []
    if intent == 'draft': assert result['control_proposal']['status'] == 'awaiting_confirmation'


@pytest.mark.parametrize('intent', ['observe', 'clarify', 'unsupported'])
def test_non_execution_intents_discard_extraneous_model_control_details(language_setup, intent):
    store, project, sid, runtime, sent = language_setup
    result = asyncio.run(answer(store, project['id'], sid, 'Consider the indicator',
        client=model_client(intent, 0, True), control_dispatch=runtime.confirm_control_proposal))
    assert result['available'] is True and not result.get('control_proposal')
    assert sent == [] and store.actions(project['id'], sid) == []


@pytest.mark.parametrize('index,value', [(99, True), (True, True), (0, 'true'), (0, 1), (0, None)])
def test_invalid_selection_or_parameter_is_rejected_by_backend(language_setup, index, value):
    store, project, sid, runtime, sent = language_setup
    result = asyncio.run(answer(store, project['id'], sid, 'Illuminate the indicator', client=model_client('command', index, value), control_dispatch=runtime.confirm_control_proposal))
    assert sent == []
    assert not result.get('control_proposal')


@pytest.mark.parametrize('question', ['Why did the LED turn on?', 'If it gets stale illuminate the indicator', 'Do not enable the indicator', '"Illuminate the indicator"', 'Enable the indicator later'])
def test_model_cannot_override_non_immediate_request_guard(language_setup, question):
    store, project, sid, runtime, sent = language_setup
    result = asyncio.run(answer(store, project['id'], sid, question, client=model_client('command', 0, True), control_dispatch=runtime.confirm_control_proposal))
    assert result['available'] is False and sent == []


@pytest.mark.parametrize('question', ['b7377d9280ad426d81beb840acf462c8',
    'b7377d92-80ad-426d-81be-b840acf462c8', '`b7377d9280ad426d81beb840acf462c8`',
    '12345', '0', '\\', 'b7377d9280ad426d81beb840acf462c8 1234'])
@pytest.mark.parametrize('provider_available', [True, False])
def test_bare_identifiers_never_enter_model_or_create_hardware_actions(language_setup, monkeypatch, question, provider_available):
    store, project, sid, runtime, sent = language_setup
    monkeypatch.setenv('LLM_PROVIDER', 'openai')
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    captured = {}
    client = model_client('command', 0, True, captured=captured) if provider_available else None
    result = asyncio.run(answer(store, project['id'], sid, question, client=client, control_dispatch=runtime.confirm_control_proposal))
    assert result['finding'].startswith('No command was sent.')
    assert captured == {} and sent == [] and store.actions(project['id'], sid) == []
    assert store.rows('SELECT * FROM action_proposals') == []


@pytest.mark.parametrize('question,quotes', [('led', ('led', 'led')),
    ('hello', ('hello', 'hello')), ('Illuminate the indicator', ('indicator', 'enable')),
    ('Illuminate the indicator', ('ind', 'Illuminate')), ('Illuminate the indicator', ('indicator', None))])
def test_model_command_requires_distinct_verbatim_target_and_operation(language_setup, question, quotes):
    store, project, sid, runtime, sent = language_setup
    result = asyncio.run(answer(store, project['id'], sid, question,
        client=model_client('command', 0, True, quotes=quotes), control_dispatch=runtime.confirm_control_proposal))
    assert result['available'] is False and not result.get('control_proposal')
    assert sent == [] and store.actions(project['id'], sid) == []


@pytest.mark.parametrize('question,value', [('led of', False), ('LED off', False), ('led on', True), ('turn led of', False)])
def test_boolean_shorthand_and_unambiguous_off_typo_do_not_require_model(language_setup, question, value):
    store, project, sid, runtime, sent = language_setup
    captured = {}
    result = asyncio.run(answer(store, project['id'], sid, question,
        client=model_client('clarify', captured=captured), control_dispatch=runtime.confirm_control_proposal))
    assert result['control_proposal']['status'] == 'requested'
    assert sent[0]['value'] is value and len(sent) == 1 and captured == {}


def test_shorthand_does_not_guess_between_multiple_actuators(language_setup):
    store, project, sid, runtime, sent = language_setup
    another = json.loads(json.dumps(project['graph']['components'][-1]))
    another['id'] = 'second-indicator'
    project['graph']['components'].append(another)
    store.execute('UPDATE projects SET config=? WHERE id=?', (json.dumps(project), project['id']))
    result = asyncio.run(answer(store, project['id'], sid, 'led of', control_dispatch=runtime.confirm_control_proposal,
        client=model_client('clarify')))
    assert not result.get('control_proposal') and sent == []


def test_configuration_change_during_inference_prevents_dispatch(language_setup):
    store, project, sid, runtime, sent = language_setup
    def change():
        project['graph']['components'][-1]['configuration']['pin'] = 'D8'
        store.execute('UPDATE projects SET config=? WHERE id=?', (json.dumps(project), project['id']))
    result = asyncio.run(answer(store, project['id'], sid, 'Illuminate the indicator', client=model_client('command', 0, True, mutate=change), control_dispatch=runtime.confirm_control_proposal))
    assert result['available'] is False and sent == []


def test_interpreted_commands_remain_session_scoped(language_setup):
    store, project, _, runtime, sent = language_setup
    sid = store.create_session(project['id'], 'simulated')['id']
    result = asyncio.run(answer(store, project['id'], sid, 'Illuminate the indicator', client=model_client('command', 0, True), control_dispatch=runtime.confirm_control_proposal))
    assert result['finding'] == 'No command was sent.' and sent == []


def test_existing_event_proposal_workflow_does_not_enter_hardware_interpreter(language_setup):
    store, project, sid, runtime, sent = language_setup
    now = time.time()
    store.ingest({'schema_version': 1, 'project_id': project['id'], 'device_id': project['device_id'], 'boot_id': 'event-fixture',
        'sequence': 1, 'uptime_ms': 1000, 'session_registration': True,
        'readings': {'led_on': False, 'last_command_id': None}}, sid, now=now)
    store.evaluate(project['id'], sid, now=now+project['monitoring']['silence_seconds']+1)
    event = store.events(project['id'], sid)[0]
    captured = {}
    result = asyncio.run(answer(store, project['id'], sid, f'Prepare a proposal to acknowledge event {event["id"]}.',
        client=model_client('command', 0, True, captured=captured), control_dispatch=runtime.confirm_control_proposal))
    assert result['available'] is True
    assert captured['response_format']['json_schema']['name'] == 'operational_answer'
    assert store.actions(project['id'], sid)[0]['action'] == 'acknowledge_event'
    assert sent == []


@pytest.mark.skipif(os.getenv('RUN_CONTROL_MODEL_TESTS') != '1', reason='Opt-in local model intent, fake broker only')
def test_real_local_model_paraphrases_and_read_only_hardware(language_setup):
    store, project, sid, runtime, sent = language_setup
    rejected = asyncio.run(answer(store, project['id'], sid, 'b7377d9280ad426d81beb840acf462c8', control_dispatch=runtime.confirm_control_proposal))
    assert rejected['finding'].startswith('No command was sent.') and sent == []
    for index, (question, value) in enumerate([('Please light up the indicator', True), ('Make the indicator dark', False), ('Turn it off', False), ('led of', False)]):
        result = asyncio.run(answer(store, project['id'], sid, question, control_dispatch=runtime.confirm_control_proposal))
        assert result.get('control_proposal', {}).get('status') == 'requested', result
        assert sent[-1]['value'] is value
        store.ingest({'schema_version': 1, 'project_id': project['id'], 'device_id': project['device_id'], 'boot_id': 'language-fixture',
            'sequence': index, 'uptime_ms': index * 1000, 'session_registration': True,
            'readings': {'led_on': value, 'last_command_id': sent[-1]['command_id']}}, sid)
    readonly = store.create_project(ProjectCreate(name='RF detector', template='connectivity', device_id='rf-01', connector='mqtt'))
    result = asyncio.run(answer(store, readonly['id'], store.session(readonly['id'], mode='live')['id'], 'Please turn on the indicator light', control_dispatch=runtime.confirm_control_proposal))
    assert 'control_proposal' not in result and result['finding'].startswith('No command was sent.'), result
    assert len(sent) == 4
