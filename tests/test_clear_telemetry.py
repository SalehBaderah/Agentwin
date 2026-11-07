"""Clearing older samples preserves session scope, current state and replay guards."""
import time

from fastapi.testclient import TestClient

from backend.main import create_app
from backend.models import ProjectCreate


def packet(project, sequence, *, device=None, boot='boot-1'):
    device = device or project['device_id']
    fields = {key: float(sequence) for key, spec in project['graph']['fields'].items() if spec.get('device_id') == device}
    return {
        'schema_version': 1, 'project_id': project['id'], 'device_id': device,
        'boot_id': boot, 'sequence': sequence, 'uptime_ms': sequence * 1000,
        'session_registration': True, 'readings': fields,
    }


def test_clear_history_keeps_latest_per_device_and_other_sessions(tmp_path):
    app = create_app(str(tmp_path / 'clear.db'), background=False)
    store = app.state.store
    request = ProjectCreate(
        name='Two sensors', connector='mqtt', device_id='sensor-a',
        devices=[{'device_id': 'sensor-b', 'connector': 'mqtt'}],
        components=[
            {'component_id': 'a', 'component_type': 'temperature', 'label': 'A', 'device_id': 'sensor-a', 'field_key': 'temp_a'},
            {'component_id': 'b', 'component_type': 'temperature', 'label': 'B', 'device_id': 'sensor-b', 'field_key': 'temp_b'},
        ],
    )
    project = store.create_project(request)
    live = store.session(project['id'], mode='live')['id']
    simulated = store.session(project['id'], mode='simulated')['id']
    other = store.create_project(ProjectCreate(name='Other project', template='temperature', connector='mqtt'))
    other_live = store.session(other['id'])['id']
    observed = time.time() - 40
    for sequence in range(3):
        for device in ('sensor-a', 'sensor-b'):
            assert store.ingest(packet(project, sequence, device=device), live, now=observed + sequence)['accepted']
    store.ingest(packet(project, 0), simulated)
    store.ingest(packet(other, 0), other_live)
    store.evaluate(project['id'], live)
    events = store.events(project['id'], live)
    assert events
    store.acknowledge(project['id'], live, events[0]['id'])
    before = store.state(project['id'], live)
    with TestClient(app) as client:
        route = f'/api/projects/{project["id"]}/sessions/{live}/readings/clear-history'
        assert client.get(route).status_code != 200  # GET must never clear data.
        response = client.post(route)
        assert response.status_code == 200
        assert response.json() == {'deleted': 4, 'kept': 2}
        after = store.state(project['id'], live)
        assert {row['device']: row['seq'] for row in after['readings']} == {'sensor-a': 2, 'sensor-b': 2}
        assert after['project'] == before['project']
        assert after['field_status'] == before['field_status']
        assert after['status'] == before['status'] == 'stale'
        assert after['events'] == before['events']
        assert after['actions'] == before['actions']
        assert len(store.history(project['id'], simulated)) == 1
        assert len(store.history(other['id'], other_live)) == 1
        assert client.post(route).json() == {'deleted': 0, 'kept': 2}
        assert not store.ingest(packet(project, 2), live)['accepted']
        assert store.ingest(packet(project, 3), live)['accepted']


def test_clear_does_not_revive_retired_boots_or_cross_project_boundaries(tmp_path):
    app = create_app(str(tmp_path / 'scope.db'), background=False)
    store = app.state.store
    project = store.create_project(ProjectCreate(name='Sensor', template='temperature', connector='mqtt'))
    other = store.create_project(ProjectCreate(name='Other', template='temperature', connector='mqtt'))
    sid = store.session(project['id'])['id']
    for boot in ('old', 'new'):
        for sequence in range(2):
            assert store.ingest(packet(project, sequence, boot=boot), sid)['accepted']
    with TestClient(app) as client:
        wrong_route = f'/api/projects/{other["id"]}/sessions/{sid}/readings/clear-history'
        assert client.post(wrong_route).status_code == 400
        assert len(store.history(project['id'], sid)) == 4
        route = f'/api/projects/{project["id"]}/sessions/{sid}/readings/clear-history'
        assert client.post(route).json() == {'deleted': 3, 'kept': 1}
        assert store.ingest(packet(project, 9, boot='old'), sid)['reason'] == 'retired device session'
        assert store.ingest(packet(project, 1, boot='new'), sid)['reason'] == 'duplicate or out of order'
        assert store.ingest(packet(project, 2, boot='new'), sid)['accepted']
