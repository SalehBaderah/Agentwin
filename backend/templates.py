"""Composable, versioned project definitions built from a supported catalog."""

SCHEMA_VERSION = 6
RELATIONSHIPS = {'measures': ('Measures', 'physical'), 'controls': ('Controls', 'control'), 'telemetry': ('Reports through', 'data'), 'connected': ('Connected to', 'physical'), 'powers': ('Supplies power to', 'power')}
CATALOG = {
    'controller': {'category': 'controller', 'type': 'edge_controller', 'firmware': 'board-specific'},
    'led': {'category': 'actuator', 'type': 'indicator_led', 'field_type': 'boolean', 'field': 'led_on', 'firmware': 'set_led handler required'},
    'temperature': {'category': 'sensor', 'type': 'temperature_sensor', 'field_type': 'number', 'field': 'temperature_c', 'unit': '°C', 'firmware': 'sensor driver required'},
    'humidity': {'category': 'sensor', 'type': 'humidity_sensor', 'field_type': 'number', 'field': 'humidity_percent', 'unit': '%', 'firmware': 'sensor driver required'},
    'analog': {'category': 'sensor', 'type': 'analog_input', 'field_type': 'number', 'field': 'analog_raw', 'unit': 'count', 'firmware': 'analogRead required; raw value only'},
    'readonly': {'category': 'generic', 'type': 'generic_component', 'field_type': 'number', 'field': 'sensor_value', 'unit': 'value', 'firmware': 'field publisher required'},
}

def component(cid, name, ctype, category, description, *, group=None, bindings=None, capabilities=None, config=None, controls=None):
    return {'id': cid, 'name': name, 'label': name, 'type': ctype, 'category': category, 'kind': category, 'description': description, 'group': group, 'bindings': bindings or [], 'capabilities': capabilities or [], 'configuration': config or {}, 'controls': controls or [], 'visual': {}}

def relation(source, target, kind, label=None):
    default, category = RELATIONSHIPS.get(kind, (kind.replace('_', ' ').title(), 'context'))
    return {'id': f'{source}-{kind}-{target}', 'source': source, 'target': target, 'kind': kind, 'label': label or default, 'category': category}

def metric(label, unit, component_id, *, data_type='number', precision=2, freshness=None, source='telemetry', device_id=None, nullable=True):
    return {'unit': unit, 'label': label, 'component': component_id, 'component_id': component_id, 'device_id': device_id, 'data_type': data_type, 'precision': precision, 'freshness_seconds': freshness, 'calibrated': False, 'source': source, 'nullable': nullable}

def composed_definition(devices, configured_components, freshness_seconds=8):
    fields, nodes, edges, capabilities = {}, [], [], []
    for device in devices:
        did = device['id']; controller_id, transport_id = f'controller-{did}', f'transport-{did}'
        nodes.extend([
            component(controller_id, device.get('label') or did, 'edge_controller', 'controller', 'Registered physical board or data source.', group='Devices', config={'device_id': did, 'connector': device['connector'], 'board_support': 'operator-declared'}),
            component(transport_id, f"{device['connector'].upper()} connector", 'telemetry_gateway', 'gateway', 'Active configured telemetry route.', group='Transport', config={'device_id': did, 'connector': device['connector']}),
        ]); edges.append(relation(controller_id, transport_id, 'telemetry'))
    for item in configured_components:
        kind = item['component_type']; spec = CATALOG[kind]; cid = item['component_id']; did = item['device_id']
        if kind == 'controller': continue
        field_key = item.get('field_key') or spec.get('field'); bindings, controls, capability_refs = [], [], []
        if field_key:
            data_type = item.get('field_type') or spec.get('field_type', 'number'); unit = item.get('unit') if item.get('unit') is not None else spec.get('unit', '')
            fields[field_key] = metric(item['label'], unit, cid, data_type=data_type, precision=item.get('precision', 2), freshness=item.get('freshness_seconds') or freshness_seconds, device_id=did); bindings.append(field_key)
        if kind == 'led':
            ack = f'{cid}_last_command_id' if cid != 'led' else 'last_command_id'; fields[ack] = metric('Acknowledged command', '', cid, data_type='categorical', precision=0, freshness=None, device_id=did); bindings.append(ack)
            capability = {'id': f'{cid}.set_led', 'component_id': cid, 'device_id': did, 'command': 'set_led', 'parameters': {'value': {'type': 'boolean', 'allowed_values': [True, False]}}, 'confirmation_required': True, 'expected': {'field': field_key, 'command_field': ack, 'parameter': 'value'}, 'timeout_seconds': 12, 'implemented': True}
            capabilities.append(capability); capability_refs.append('action:set_led'); controls.append({'action': 'set_led', 'label': 'Set LED', 'parameters': capability['parameters'], 'expected': {'field': field_key, 'command_field': ack}, 'timeout_seconds': 12, 'capability_id': capability['id']})
        nodes.append(component(cid, item['label'], spec['type'], spec['category'], 'Configuration-defined supported component.', group='Components', bindings=bindings, capabilities=capability_refs, config={'device_id': did, 'pin': item.get('pin'), 'firmware_requirement': spec['firmware']}, controls=controls)); edges.append(relation(cid, f'controller-{did}', 'connected'))
    return {'schema_version': SCHEMA_VERSION, 'primary_field': next(iter(fields), ''), 'fields': fields, 'components': nodes, 'edges': edges, 'capabilities': capabilities, 'groups': [{'id': 'components', 'name': 'Components'}, {'id': 'devices', 'name': 'Devices'}, {'id': 'transport', 'name': 'Transport'}]}

def starting_components(template, mapping, device_id, freshness_seconds=8):
    presets = {
        'led': [('led', 'led', 'External LED', 'D7', 'led_on', 'boolean', '', 0)],
        'temperature': [('temperature', 'temperature', 'Temperature', None, 'temperature_c', 'number', '°C', 2)],
        'water': [('water-level', 'readonly', 'Water level', None, 'water_level_cm', 'number', 'cm', 2)],
        'connectivity': [('rf-detector', 'analog', 'Detector output', 'A0', 'rf_detector_v', 'number', 'V', 4), ('wifi', 'readonly', 'Wi-Fi RSSI', None, 'wifi_rssi_dbm', 'number', 'dBm', 0)],
        'generic': [('sensor', 'readonly', 'Sensor reading', None, mapping['field'], 'number', mapping['unit'], 2)],
    }
    return [{'component_id': cid, 'component_type': kind, 'label': label, 'device_id': device_id, 'pin': pin, 'field_key': field, 'field_type': dtype, 'unit': unit, 'precision': precision, 'freshness_seconds': freshness_seconds} for cid, kind, label, pin, field, dtype, unit, precision in presets.get(template, presets['generic'])]

def definition(template='generic', mapping=None, inserted=False, cable='Configured connection', device_id='device-01', connector='usb', devices=None, components=None, freshness_seconds=8):
    mapping = mapping or {'field': 'sensor_value', 'unit': 'value'}; device_list = devices or [{'id': device_id, 'connector': connector, 'serial_port': None, 'baud_rate': 115200}]; configured = components or starting_components(template, mapping, device_id, freshness_seconds)
    return composed_definition(device_list, configured, freshness_seconds)

def migrate_graph(graph, freshness_seconds=8, template=None, device_id='device-01', connector='usb', mapping=None, devices=None, components=None):
    if graph.get('schema_version') == SCHEMA_VERSION: return graph, False
    return definition(template or 'generic', mapping, device_id=device_id, connector=connector, devices=devices, components=components, freshness_seconds=freshness_seconds), True
