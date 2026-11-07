"""Local hardware recipes and read-only, per-device firmware exports.

Only explicitly listed public source files are exported. Live project state,
credentials, session state and the original firmware directories are never edited.
"""
import io
import json
import re
from functools import lru_cache
from pathlib import Path
from string import Template
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
TEMPLATES = ROOT / 'firmware' / 'templates'
LEGACY = ('generic', 'led', 'temperature', 'water', 'connectivity')


def confined(root, relative):
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()): raise ValueError('Template path leaves its source directory')
    return path


@lru_cache(maxsize=1)
def registry():
    from .models import ComponentCreate
    result = {}
    for path in sorted(TEMPLATES.glob('*.json')):
        spec = json.loads(path.read_text(encoding='utf-8'))
        tid = spec['id']
        if not re.fullmatch(r'[a-z][a-z0-9_]{0,63}', tid) or tid in result or tid in LEGACY:
            raise ValueError('Invalid or duplicate hardware template ID')
        if spec['version'] < 1 or spec['defaults']['connector'] not in ('usb', 'mqtt'):
            raise ValueError('Invalid hardware template defaults')
        if not re.fullmatch(r'[A-Za-z0-9_]+', spec['source']): raise ValueError('Invalid sketch directory')
        source = confined(ROOT / 'firmware' / 'projects', spec['source'])
        if f"{spec['source']}.ino" not in spec['files']: raise ValueError('Missing sketch entry point')
        for filename in spec['files']:
            file = confined(source, filename)
            if not file.is_file() or file.name in ('secrets.h', 'project_config.h') or file.suffix not in ('.ino', '.h', '.cpp', '.yaml', '.md'):
                raise ValueError('Invalid template source file')
        confined(TEMPLATES, spec['config_template']).read_text(encoding='utf-8')
        for library in spec['libraries']:
            if not re.fullmatch(r'[A-Za-z0-9_]+', library): raise ValueError('Invalid library name')
            confined(ROOT / 'firmware' / 'libraries', library)
        fields, ids = set(), set()
        for component in spec['components']:
            ComponentCreate(**component, device_id=spec['defaults']['device_id'])
            if component['field_key'] in fields or component['component_id'] in ids: raise ValueError('Duplicate template component/field')
            fields.add(component['field_key']); ids.add(component['component_id'])
        result[tid] = spec
    return result


def get_template(template_id):
    spec = registry().get(template_id)
    if not spec: raise ValueError('Unknown hardware template')
    return spec


def template_catalog():
    """Existing manual presets stay available; hardware presets come from manifests."""
    from .templates import starting_components
    catalog = [{**spec, 'hardware': True} for spec in registry().values()]
    names = {'generic': 'Custom sensor configuration', 'led': 'Custom LED configuration', 'temperature': 'Custom temperature configuration', 'water': 'Custom water level configuration', 'connectivity': 'Custom connectivity / RF configuration'}
    for tid in LEGACY:
        components = starting_components(tid, {'field': 'sensor_value', 'unit': 'value'}, 'device-01')
        catalog.append({'id': tid, 'version': 1, 'name': names[tid], 'hardware': False,
                        'description': 'Editable component defaults. Supply matching firmware yourself.',
                        'defaults': {'device_id': 'device-01', 'connector': 'usb', 'baud_rate': 115200, 'interval_seconds': 1, 'freshness_seconds': 8},
                        'components': [{k: v for k, v in item.items() if k not in ('device_id', 'freshness_seconds')} for item in components], 'notes': []})
    return catalog


def firmware_check(project, device_id, template_id):
    spec = get_template(template_id)
    device = next((d for d in project['devices'] if d['id'] == device_id), None)
    if not device: raise ValueError('Device is not registered to this project')
    fields = {k: v for k, v in project['graph']['fields'].items() if v.get('device_id') == device_id}
    errors = []
    if device['connector'] != spec['defaults']['connector']:
        errors.append(f"This firmware requires {spec['defaults']['connector'].upper()} transport.")
    # Older UNO projects sometimes stored the default 115200 despite running at 38400.
    # Report the mismatch; exports use the actual template baud and never rewrite that project.
    warnings = list(spec['notes'])
    if device['connector'] == 'usb' and device.get('baud_rate', 115200) != spec['defaults']['baud_rate']:
        warnings.append(f"Saved baud is {device.get('baud_rate', 115200)}. This firmware and its generated gateway use {spec['defaults']['baud_rate']} baud.")
    expected = set()
    led_id, ack_field = '', ''
    for item in spec['components']:
        key = item['field_key']; expected.add(key)
        field = fields.get(key)
        if not field:
            errors.append(f"Missing field: {key}."); continue
        if field['data_type'] != item['field_type'] or field['unit'] != item['unit']:
            errors.append(f"{key} must be {item['field_type']} with unit {item['unit'] or '(none)' }.")
        component = next((c for c in project['graph']['components'] if c['id'] == field['component_id']), None)
        if not component or component['configuration'].get('device_id') != device_id:
            errors.append(f"{key} has no matching device component."); continue
        if component['configuration'].get('pin') != item['pin']:
            errors.append(f"{key} requires configured pin {item['pin'] or '(none)' }.")
        if item['component_type'] == 'led':
            control = next((c for c in project['graph'].get('capabilities', []) if c['component_id'] == component['id'] and c['command'] == 'set_led'), None)
            if not control or control['expected']['field'] != key:
                errors.append('LED requires its existing telemetry-confirmed set_led capability.')
            else:
                led_id = component['id']; ack_field = control['expected']['command_field']; expected.add(ack_field)
                if ack_field not in fields or fields[ack_field]['data_type'] != 'categorical': errors.append('Missing command acknowledgement field.')
    extra = set(fields) - expected
    if extra: errors.append('This firmware does not publish configured fields: ' + ', '.join(sorted(extra)) + '.')
    for value in (project['id'], device_id, led_id, ack_field):
        if value and not re.fullmatch(r'[a-z][a-z0-9_-]{0,79}', value): errors.append('Unsafe firmware identity or field name.')
    return {'template_id': template_id, 'version': spec['version'], 'name': spec['name'], 'board': spec['board'], 'compatible': not errors,
            'errors': errors, 'warnings': warnings, 'device_id': device_id, 'connector': device['connector'],
            'baud_rate': spec['defaults']['baud_rate'], 'fqbn': spec['fqbn'], 'visual_profile': spec.get('visual_profile', 'generic'),
            'led_component_id': led_id, 'ack_field': ack_field}


def firmware_package(project, device_id, template_id):
    spec = get_template(template_id); check = firmware_check(project, device_id, template_id)
    if not check['compatible']: raise ValueError('Firmware configuration mismatch: ' + ' '.join(check['errors']))
    source = ROOT / 'firmware' / 'projects' / spec['source']
    sketch = 'firmware/projects/' + spec['source']
    base = f"agentwin/{project['id']}/{device_id}"
    device = next(d for d in project['devices'] if d['id'] == device_id)
    setup = {**check, 'project_id': project['id'], 'serial_port': device.get('serial_port'), 'sketch': sketch,
             'interval_seconds': project['interval_seconds'], 'freshness_seconds': project['freshness_seconds'],
             'topics': {key: base + '/' + key for key in ('telemetry', 'status', 'command')},
             'fields': {k: v for k, v in project['graph']['fields'].items() if v.get('device_id') == device_id}}
    header = Template((TEMPLATES / spec['config_template']).read_text(encoding='utf-8')).substitute(
        project_id=project['id'], device_id=device_id, interval_ms=project['interval_seconds'] * 1000,
        led_component_id=check['led_component_id'], ack_field=check['ack_field'])
    output = io.BytesIO()
    with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
        for name in spec['files']:
            if name != 'secrets.example.h': archive.writestr(sketch + '/' + name, confined(source, name).read_bytes())
        archive.writestr(sketch + '/project_config.h', header)
        if device['connector'] == 'mqtt':
            # Only the checked-in example is used. Never read local secrets.h.
            example = (source / 'secrets.example.h').read_text(encoding='utf-8')
            example = re.sub(r'#define MQTT_USER .*', '#define MQTT_USER "' + device_id + '"', example)
            archive.writestr(sketch + '/secrets.example.h', example)
        for library in spec['libraries']:
            libroot = ROOT / 'firmware' / 'libraries' / library
            for file in sorted(libroot.rglob('*')):
                if file.is_file() and not file.is_symlink() and file.suffix in ('.h', '.cpp', '.properties'):
                    archive.writestr('firmware/libraries/' + library + '/' + file.relative_to(libroot).as_posix(), file.read_bytes())
        archive.writestr('setup.json', json.dumps(setup, indent=2) + '\n')
        archive.writestr('build.ps1', BUILD_SCRIPT)
        archive.writestr('upload.ps1', UPLOAD_SCRIPT)
        if device['connector'] == 'usb': archive.writestr('start-gateway.ps1', GATEWAY_SCRIPT)
        account = device_id if device['connector'] == 'mqtt' else 'agentwin-backend'
        archive.writestr('broker-acl.txt', f'# Review and merge into the existing ACL; do not replace other accounts.\nuser {account}\ntopic write {base}/telemetry\ntopic write {base}/status\ntopic read {base}/command\n')
        archive.writestr('README.md', package_readme(spec, setup))
    return output.getvalue(), f"{project['id']}-{device_id}-firmware.zip"


BUILD_SCRIPT = '''param([string]$ArduinoCli = "arduino-cli")
$ErrorActionPreference = "Stop"
$setup = Get-Content -LiteralPath (Join-Path $PSScriptRoot "setup.json") -Raw | ConvertFrom-Json
$sketch = Join-Path $PSScriptRoot $setup.sketch
if ($setup.connector -eq "mqtt" -and -not (Test-Path -LiteralPath (Join-Path $sketch "secrets.h"))) {
    throw "Copy secrets.example.h to secrets.h in the sketch folder and fill your local Wi-Fi and broker credentials before building."
}
$libraries = Join-Path $PSScriptRoot "firmware/libraries"
& $ArduinoCli compile --fqbn $setup.fqbn --libraries $libraries --output-dir (Join-Path $PSScriptRoot "build") $sketch
if ($LASTEXITCODE -ne 0) { throw "Firmware compilation failed." }
'''
UPLOAD_SCRIPT = '''param([Parameter(Mandatory=$true)][string]$Port, [string]$ArduinoCli = "arduino-cli")
$ErrorActionPreference = "Stop"
$setup = Get-Content -LiteralPath (Join-Path $PSScriptRoot "setup.json") -Raw | ConvertFrom-Json
Write-Host "Uploading $($setup.project_id) / $($setup.device_id) to $Port ($($setup.fqbn)). Close Serial Monitor and its gateway first."
& $ArduinoCli upload --port $Port --fqbn $setup.fqbn --input-dir (Join-Path $PSScriptRoot "build") (Join-Path $PSScriptRoot $setup.sketch)
if ($LASTEXITCODE -ne 0) { throw "Firmware upload failed." }
'''
GATEWAY_SCRIPT = '''param([Parameter(Mandatory=$true)][string]$AgentwinRoot, [string]$Port)
$ErrorActionPreference = "Stop"
$setup = Get-Content -LiteralPath (Join-Path $PSScriptRoot "setup.json") -Raw | ConvertFrom-Json
if (-not $Port) { $Port = $setup.serial_port }
if (-not $Port) { throw "Supply -Port with the connected board's COM port." }
Push-Location -LiteralPath $AgentwinRoot
try {
    & (Join-Path $AgentwinRoot ".venv/Scripts/python.exe") -m gateway.serial_gateway --port $Port --baud $setup.baud_rate --project $setup.project_id --device $setup.device_id
    if ($LASTEXITCODE -ne 0) { throw "USB gateway exited with an error." }
} finally { Pop-Location }
'''


def package_readme(spec, setup):
    mqtt = setup['connector'] == 'mqtt'
    return f'''# {spec['name']} — generated device package

Template version: {spec['version']}
Project: `{setup['project_id']}`
Device: `{setup['device_id']}`
Board: {spec['board']}

This package contains a separate copy of the existing firmware, its shared libraries,
and generated IDs/timing. The platform project and original firmware were not edited.
Review `setup.json` and `broker-acl.txt`. Merge ACL rules into the existing broker
configuration and reload/restart it. Backend telemetry/status subscriptions and
command publishing permissions must also remain present.

{'Copy `secrets.example.h` to `secrets.h` inside the sketch folder and fill Wi-Fi, the reachable broker LAN IP, and device-account credentials locally. Create the broker account separately. Never commit or share secrets.h.' if mqtt else 'The firmware and gateway use 38400 baud. Close Serial Monitor and stop the gateway before uploading.'}

Install the board core and dependencies listed in the included `sketch.yaml`;
shared Agentwin libraries are bundled. In PowerShell from this package folder:

```powershell
.\\build.ps1
.\\upload.ps1 -Port COM_PORT
```

Both scripts accept `-ArduinoCli` with the installed arduino-cli executable path.
Uploading changes the selected physical board; choose its port explicitly.
{'No serial gateway is needed: this device publishes directly over Wi-Fi MQTT.' if mqtt else 'Then run `.\\start-gateway.ps1 -AgentwinRoot E:\\path\\to\\Agentwin -Port COM_PORT`.'}

## Verify on hardware

- Confirm wiring and supply from the included hardware README.
- Open this project in Agentwin and verify increasing Live telemetry.
- Verify the fields and units against setup.json and the expected reporting interval.
- Disconnect and reconnect; verify stale state and subsequent recovery.
- {'This template is read-only.' if mqtt else 'Verify LED commands complete only after matching-state telemetry and command acknowledgement.'}

''' + '\n'.join('- ' + note for note in setup['warnings']) + '\n'
