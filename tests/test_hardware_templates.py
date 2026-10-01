import copy
import io
import json
from pathlib import Path
from zipfile import ZipFile

import pytest
from fastapi.testclient import TestClient
from backend.main import create_app
from backend.models import ProjectCreate
from backend.store import Store
from backend import hardware_templates as templates


@pytest.fixture
def store(tmp_path):
    value = Store(str(tmp_path / 'templates.db'))
    yield value
    value.db.close()


@pytest.mark.parametrize('tid,connector,baud,field_count', [
    ('arduino_uno_d13_led', 'usb', 38400, 2), ('r4_rf_jamming_detector', 'mqtt', 115200, 5),
])
def test_hardware_defaults_are_complete_and_persisted(store, tid, connector, baud, field_count):
    project = store.create_project(ProjectCreate(name='Hardware', template=tid, device_id='custom-board'))
    assert project['devices'][0]['baud_rate'] == baud
    assert project['connector'] == connector
    assert len(project['graph']['fields']) == field_count
    assert all(field['device_id'] == 'custom-board' for field in project['graph']['fields'].values())
    assert store.project(project['id'])['firmware_template_version'] == 1
    assert templates.firmware_check(project, 'custom-board', tid)['compatible']
    assert store.state(project['id'])['latest'] is None
    controller = next(node for node in project['graph']['components'] if node['category'] == 'controller')
    assert controller['visual']['model'] == templates.get_template(tid)['visual_profile']
    assert controller['configuration']['artwork_source'] == 'hardware-template'
    assert controller['configuration']['fqbn'] == templates.get_template(tid)['fqbn']


@pytest.mark.parametrize('tid', ['arduino_uno_d13_led', 'r4_rf_jamming_detector'])
def test_packages_have_matching_contract_and_public_sources_only(store, tid):
    request = ProjectCreate(name='Hardware', template=tid, device_id='custom-board', interval_seconds=2)
    project = store.create_project(request)
    before = copy.deepcopy(store.project(project['id']))
    original_header = (templates.ROOT / 'firmware/projects' / templates.get_template(tid)['source'] / 'project_config.h').read_bytes()
    body, filename = templates.firmware_package(project, 'custom-board', tid)
    assert filename.endswith('-custom-board-firmware.zip')
    with ZipFile(io.BytesIO(body)) as package:
        assert len(package.namelist()) == len(set(package.namelist()))
        assert not any(Path(name).name in ('secrets.h', '.env', 'passwords') for name in package.namelist())
        setup = json.loads(package.read('setup.json'))
        header = package.read(setup['sketch'] + '/project_config.h').decode()
        assert f'"{project["id"]}"' in header and '"custom-board"' in header
        assert '= 2000;' in header
        assert setup['fields'] == project['graph']['fields']
        assert setup['visual_profile'] == templates.get_template(tid)['visual_profile']
        assert f"agentwin/{project['id']}/custom-board/telemetry" in package.read('broker-acl.txt').decode()
        assert package.read('build.ps1') and package.read('upload.ps1')
        if tid == 'arduino_uno_d13_led':
            assert 'SERIAL_BAUD = 38400' in header
            assert 'start-gateway.ps1' in package.namelist()
            assert 'LED_PIN = LED_BUILTIN' in header
        else:
            assert 'MODEL_SAMPLE_INTERVAL_MS = 100' in header and 'ADC_REFERENCE_V = 3.3f' in header
            assert 'start-gateway.ps1' not in package.namelist()
            assert b'#define MQTT_USER "custom-board"' in package.read(setup['sketch'] + '/secrets.example.h')
            source = templates.ROOT / 'firmware/projects' / templates.get_template(tid)['source']
            assert package.read(setup['sketch'] + '/RF_jamming.ino') == (source / 'RF_jamming.ino').read_bytes()
    assert store.project(project['id']) == before
    assert original_header == (templates.ROOT / 'firmware/projects' / templates.get_template(tid)['source'] / 'project_config.h').read_bytes()


def test_legacy_project_can_export_without_migration_and_baud_is_explained(store):
    request = ProjectCreate(name='Existing LED', template='led')
    request.components = ProjectCreate(name='Hardware', template='arduino_uno_d13_led').components
    request.device_id = 'uno-d13-01'
    project = store.create_project(request)
    check = templates.firmware_check(project, project['device_id'], 'arduino_uno_d13_led')
    assert check['compatible'] and any('Saved baud' in message for message in check['warnings'])
    templates.firmware_package(project, project['device_id'], 'arduino_uno_d13_led')
    assert store.project(project['id'])['devices'][0]['baud_rate'] == 115200
    assert store.project(project['id'])['template'] == 'led'
    assert all(not node['visual'] for node in project['graph']['components'])


@pytest.mark.parametrize('change', ['pin', 'type', 'unit', 'extra', 'connector', 'missing'])
def test_exports_refuse_incompatible_contracts(store, change):
    project = store.create_project(ProjectCreate(name='LED', template='arduino_uno_d13_led'))
    if change == 'pin': project['graph']['components'][-1]['configuration']['pin'] = 'D7'
    if change == 'type': project['graph']['fields']['led_on']['data_type'] = 'number'
    if change == 'unit': project['graph']['fields']['led_on']['unit'] = 'V'
    if change == 'extra': project['graph']['fields']['extra'] = {**project['graph']['fields']['led_on']}
    if change == 'connector': project['devices'][0]['connector'] = 'mqtt'
    if change == 'missing': del project['graph']['fields']['last_command_id']
    assert not templates.firmware_check(project, project['device_id'], project['template'])['compatible']
    with pytest.raises(ValueError, match='configuration mismatch'):
        templates.firmware_package(project, project['device_id'], project['template'])


def test_invalid_hardware_creation_is_atomic(store):
    request = ProjectCreate(name='LED', template='arduino_uno_d13_led')
    request.components[0].pin = 'D7'
    with pytest.raises(ValueError, match='D13'): store.create_project(request)
    assert store.projects() == [] and store.rows('SELECT * FROM sessions') == []
    with pytest.raises(ValueError, match='Unknown hardware template'):
        ProjectCreate(name='Unknown', template='unsupported_recipe')
    for invalid in (None, {}, [], 1):
        with pytest.raises(ValueError): ProjectCreate(name='Invalid', template=invalid)


def test_manifest_registration_requires_no_frontend_or_literal_changes(tmp_path, monkeypatch):
    root = tmp_path / 'registry'; root.mkdir()
    spec = copy.deepcopy(templates.get_template('arduino_uno_d13_led'))
    spec['id'] = 'another_uno_recipe'; spec['name'] = 'Another UNO recipe'
    (root / 'another_uno_recipe.json').write_text(json.dumps(spec))
    (root / spec['config_template']).write_bytes((templates.TEMPLATES / spec['config_template']).read_bytes())
    monkeypatch.setattr(templates, 'TEMPLATES', root)
    templates.registry.cache_clear()
    try:
        assert templates.template_catalog()[0]['id'] == spec['id']
        assert ProjectCreate(name='New recipe', template=spec['id']).components[0].pin == 'D13'
    finally: templates.registry.cache_clear()


@pytest.mark.parametrize('profile', ['future-board-profile', None])
def test_visual_profile_metadata_is_extensible_and_optional(store, monkeypatch, profile):
    spec = copy.deepcopy(templates.get_template('arduino_uno_d13_led'))
    if profile is None: spec.pop('visual_profile')
    else: spec['visual_profile'] = profile
    monkeypatch.setattr(templates, 'registry', lambda: {spec['id']: spec})
    project = store.create_project(ProjectCreate(name='Visual metadata', template=spec['id']))
    controller = next(node for node in project['graph']['components'] if node['category'] == 'controller')
    assert controller['visual']['model'] == (profile or 'generic')
    assert templates.firmware_check(project, project['device_id'], spec['id'])['visual_profile'] == (profile or 'generic')


@pytest.mark.parametrize('profile', ['future-board-profile', None])
def test_visual_profile_metadata_is_extensible_and_optional(store, monkeypatch, profile):
    spec = copy.deepcopy(templates.get_template('arduino_uno_d13_led'))
    if profile is None: spec.pop('visual_profile')
    else: spec['visual_profile'] = profile
    monkeypatch.setattr(templates, 'registry', lambda: {spec['id']: spec})
    project = store.create_project(ProjectCreate(name='Visual metadata', template=spec['id']))
    controller = next(node for node in project['graph']['components'] if node['category'] == 'controller')
    assert controller['visual']['model'] == (profile or 'generic')
    assert templates.firmware_check(project, project['device_id'], spec['id'])['visual_profile'] == (profile or 'generic')


def test_http_catalog_checks_and_downloads_are_project_scoped(tmp_path):
    app = create_app(str(tmp_path / 'api.db'), background=False)
    with TestClient(app) as client:
        catalog = client.get('/api/project-templates').json()
        assert len([item for item in catalog if item['hardware']]) == 2
        response = client.post('/api/projects', json={'name': 'New UNO', 'template': 'arduino_uno_d13_led', 'device_id': 'new-uno'})
        assert response.status_code == 201
        project = response.json(); endpoint = f"/api/projects/{project['id']}/devices/new-uno"
        assert client.get(endpoint + '/setup').json()['baud_rate'] == 38400
        assert client.get(endpoint + '/firmware-check?template_id=arduino_uno_d13_led').json()['compatible']
        assert not client.get(endpoint + '/firmware-check?template_id=r4_rf_jamming_detector').json()['compatible']
        zip_response = client.get(endpoint + '/firmware.zip?template_id=arduino_uno_d13_led')
        assert zip_response.status_code == 200 and zip_response.headers['content-type'] == 'application/zip'
        assert zip_response.headers['cache-control'] == 'no-store'
        assert client.get(endpoint + '/firmware.zip?template_id=r4_rf_jamming_detector').status_code == 400
        assert client.get(endpoint.replace('new-uno', 'another-device') + '/firmware.zip?template_id=arduino_uno_d13_led').status_code == 400
