"""Explicit operator commands and optional drafts; no model-selected dispatch."""
import json
import math
import re
import time

from .store import uid

PROPOSAL_TTL = 120


def control_contract(store, pid, sid, component_id, action, value):
    if store.session(pid, sid)['mode'] != 'live':
        raise ValueError('Physical controls require the Live session')
    project = store.project(pid)
    component = next((item for item in project['graph']['components'] if item['id'] == component_id), None)
    control = next((item for item in (component or {}).get('controls', []) if item['action'] == action), None)
    if not control or f'action:{action}' not in component['capabilities']:
        raise ValueError('No implemented control is configured for this component')
    parameter = control.get('parameters', {}).get('value', {})
    kind = parameter.get('type')
    valid = {'boolean': type(value) is bool, 'number': type(value) is int or type(value) is float and math.isfinite(value),
             'integer': type(value) is int, 'string': isinstance(value, str)}
    if kind not in valid or not valid[kind]:
        raise ValueError('Value does not match the declared control parameter type')
    if len(json.dumps(value, ensure_ascii=True)) > 256:
        raise ValueError('Control value exceeds the supported command size')
    if kind in ('number', 'integer') and ((parameter.get('minimum') is not None and value < parameter['minimum']) or (parameter.get('maximum') is not None and value > parameter['maximum'])):
        raise ValueError('Value is outside the declared control range')
    if kind == 'string' and len(value) > min(parameter.get('maxLength', 256), 256):
        raise ValueError('Control text exceeds its allowed length')
    allowed = parameter.get('allowed_values', parameter.get('enum'))
    if allowed is not None and not any(value == item and (type(value) is type(item) or kind in ('number', 'integer') and type(item) in (int, float)) for item in allowed):
        raise ValueError('Value is not allowed for this capability')
    field = project['graph']['fields'].get(control['expected']['field'])
    if not field:
        raise ValueError('Control verification field is not configured')
    device_id = field.get('device_id') or project['device_id']
    device = next((item for item in project['devices'] if item['id'] == device_id), None)
    if not device:
        raise ValueError('Control device is not registered to this project')
    command_field = project['graph']['fields'].get(control['expected'].get('command_field', 'last_command_id'))
    if not command_field or command_field.get('data_type') != 'categorical' or command_field.get('device_id') != device_id:
        raise ValueError('A matching device command acknowledgement field is required')
    capability_id = control.get('capability_id')
    if capability_id and not any(item.get('id') == capability_id and item.get('implemented') is True for item in project['graph'].get('capabilities', [])):
        raise ValueError('This capability is not implemented')
    # Bind the review to its configured hardware and verification contract.
    contract = {'component_id': component_id, 'device_id': device_id,
                'configuration': component.get('configuration', {}), 'control': control,
                'field': field, 'command_field': command_field, 'device': device}
    return component, control, device, contract


def control_text(question):
    text = question.strip().rstrip('.?!').strip()
    text = re.sub(r'^(?:please\s+|(?:can|could|would) you\s+|win[, :]\s*)', '', text, flags=re.I)
    return re.sub(r'^please\s+', '', text, flags=re.I)


def preview_requested(question):
    return bool(re.match(r'^(?:propose|prepare|draft)\b', control_text(question), flags=re.I))


def opaque_operator_input(question):
    """Bare IDs, hashes and numbers cannot authorize a hardware operation."""
    tokens = re.findall(r'[\w-]+', question, flags=re.UNICODE)
    return not tokens or all(
        not any(char.isalpha() for char in token)
        or bool(re.fullmatch(r'[a-fA-F0-9-]{16,}', token))
        or bool(re.fullmatch(r'(?=.*\d)[\w-]{20,}', token))
        for token in tokens
    )


def non_immediate_request(question):
    text = control_text(question)
    return bool(re.search(r"\b(if|when|whenever|unless|until|after|before|while|every|automatically|then|and|not|don't|never|tomorrow|later|schedule)\b", text, flags=re.I)
                or re.match(r'^(?:what|why|how|which|is|are|was|were|does|did|explain|describe|show|tell)\b', text, flags=re.I)
                or text.startswith(('"', "'", '“', '‘')))


def control_intent(question):
    """Bounded immediate requests only; no inferred goals, conditions or automation."""
    text = control_text(question)
    if non_immediate_request(question):
        return None
    text = re.sub(r'^(?:propose|prepare|draft)(?: a)?(?: command| proposal)?(?: to)?\s+', '', text, flags=re.I)
    for pattern, target_group, value_group in (
        (r'^(?:turn|switch)\s+(on|off|of)\s+(?:the\s+)?(.+)$', 2, 1),
        (r'^(?:turn|switch)\s+(?:the\s+)?(.+?)\s+(on|off|of)$', 1, 2),
        (r'^set\s+(?:the\s+)?(.+?)\s+to\s+(on|off|of)$', 1, 2),
        # A small, explicit shorthand correction; never fuzzy-match IDs or targets.
        (r'^(?:the\s+)?(.+?)\s+(on|off|of)$', 1, 2),
    ):
        match = re.fullmatch(pattern, text, flags=re.I)
        if match:
            return match.group(target_group).strip(), match.group(value_group).lower() == 'on'
    match = re.fullmatch(r'^set\s+(?:the\s+)?(.+?)\s+to\s+(.+)$', text, flags=re.I)
    if match:
        raw = match.group(2).strip()
        try:
            value = json.loads(raw)
        except json.JSONDecodeError:
            value = raw
        if type(value) in (bool, int, float, str):
            return match.group(1).strip(), value
    return None


def propose_control(store, pid, sid, component_id, action, value):
    component, control, device, contract = control_contract(store, pid, sid, component_id, action, value)
    now = time.time()
    details = {'component_id': component_id, 'device_id': device['id'],
               'label': component.get('name') or component.get('label') or component_id,
               'control_label': control.get('label') or action.replace('_', ' '),
               'action': action, 'value': value, 'expires_at': now + PROPOSAL_TTL,
               'contract': contract}
    with store.lock:
        existing = store.rows("SELECT a.id FROM actions a JOIN action_proposals p ON p.action_id=a.id WHERE a.project=? AND a.session=? AND a.target=? AND a.action=? AND a.status='awaiting_confirmation' AND p.expires>? ORDER BY a.created DESC LIMIT 1",
                              (pid, sid, component_id, f'{action}:{json.dumps(value)}', now))
        if existing:
            action_id = existing[0]['id']
            saved = store.rows('SELECT details FROM action_proposals WHERE action_id=?', (action_id,))[0]
            if json.loads(saved['details'])['contract'] == contract:
                return proposal_view(action_id, 'awaiting_confirmation', json.loads(saved['details']))
        action_id = uid()
        store.db.execute('INSERT INTO actions VALUES (?,?,?,?,?,?,?)', (action_id, pid, sid, now, f'{action}:{json.dumps(value)}', component_id, 'awaiting_confirmation'))
        store.db.execute('INSERT INTO action_proposals VALUES (?,?,?)', (action_id, json.dumps(details), details['expires_at']))
        store.db.commit()
    return proposal_view(action_id, 'awaiting_confirmation', details)


def proposal_view(action_id, status, details):
    return {'id': action_id, 'status': status, **{key: value for key, value in details.items() if key != 'contract'}}


def pending_proposal(store, pid, sid, action_id):
    store.session(pid, sid)
    rows = store.rows('SELECT a.*, p.details, p.expires FROM actions a JOIN action_proposals p ON p.action_id=a.id WHERE a.id=? AND a.project=? AND a.session=?', (action_id, pid, sid))
    if not rows:
        raise ValueError('Control proposal not found in this project and session')
    row = rows[0]
    if row['status'] != 'awaiting_confirmation':
        raise ValueError('This proposal has already been handled')
    if time.time() >= row['expires']:
        store.execute("UPDATE actions SET status='expired' WHERE id=? AND status='awaiting_confirmation'", (action_id,))
        raise ValueError('This proposal expired; ask Win for a new proposal')
    return row, json.loads(row['details'])


def control_answer(store, pid, sid, question, component_id=None, control_request=None, dispatch=None, fallback_unmatched=False, draft=False):
    intent = control_intent(question)
    if intent is None and control_request is None:
        return None
    project = store.project(pid)
    candidates = []
    if control_request is not None:
        value = control_request['value']
        for component in project['graph']['components']:
            if component['id'] == control_request['component_id'] and (component_id is None or component['id'] == component_id):
                candidates.extend((component, control) for control in component.get('controls', []) if control['action'] == control_request['action'])
    else:
        target, value = intent
        for component in project['graph']['components']:
            aliases = {component['id'].casefold(), str(component.get('name', '')).casefold(), str(component.get('label', '')).casefold()}
            # Singular shorthand is allowed only for an actual matching component category.
            shorthand = target.casefold() in ('led', 'light') and 'led' in str(component.get('name', '')).casefold()
            if (target.casefold() in aliases or shorthand) and (component_id is None or component['id'] == component_id):
                kinds = {'boolean'} if type(value) is bool else {'number', 'integer'} if type(value) in (int, float) else {'string'}
                candidates.extend((component, control) for control in component.get('controls', []) if control.get('parameters', {}).get('value', {}).get('type') in kinds)
    base = {'available': True, 'source': 'controller', 'evidence': [], 'evidence_ids': []}
    if len(candidates) != 1:
        if fallback_unmatched:
            return None
        return {**base, 'finding': 'No command was sent. Choose one configured physical control.' if candidates else 'No matching physical control is configured in this project.',
                'uncertainty': 'Only explicitly configured hardware controls can be requested.',
                'next_step': 'Use the Controls tab or clarify the component and value in chat.'}
    proposal = None
    preview = draft or preview_requested(question) or dispatch is None
    try:
        component, control = candidates[0]
        # The explicit operator message or Send command click is authorization.
        # Keep draft creation and dispatch atomic against concurrent requests.
        with store.lock:
            proposal = propose_control(store, pid, sid, component['id'], control['action'], value)
            if not preview:
                result = dispatch(pid, sid, proposal['id'])
                proposal['status'] = result['status']
    except ValueError as error:
        if proposal and not preview:
            store.execute("UPDATE actions SET status='failed' WHERE id=? AND status='awaiting_confirmation'", (proposal['id'],))
            proposal['status'] = 'failed'
        return {**base, **({'control_proposal': proposal} if proposal else {}), 'finding': 'No command was sent.', 'uncertainty': str(error), 'next_step': 'Select the Live session and check the configured device connection and pending commands.'}
    return {**base, 'control_proposal': proposal,
            'finding': f"{'Prepared a draft' if preview else 'Sent'}: {proposal['control_label']} for {proposal['label']} — {('On' if value else 'Off') if type(value) is bool else value}.",
            'uncertainty': 'Nothing has been sent to the device.' if preview else 'Waiting for the device to report the expected state and matching command ID.',
            'next_step': 'Confirm the draft within two minutes if you want to send it.' if preview else 'Win will show completion when matching telemetry arrives; physical output is not independently verified.'}
