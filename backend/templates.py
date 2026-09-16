"""Versioned, configuration-driven Digital Twin project templates."""

SCHEMA_VERSION = 5
RELATIONSHIPS = {
    'measures': ('Measures', 'physical'), 'controls': ('Controls', 'control'),
    'telemetry': ('Reports through', 'data'), 'connected': ('Connected to', 'physical'),
    'located_in': ('Located in', 'context'), 'powers': ('Supplies power to', 'power'),
}

def component(cid, name, ctype, category, description, *, group=None, bindings=None, capabilities=None, config=None, controls=None):
    return {'id': cid, 'name': name, 'label': name, 'type': ctype, 'category': category, 'kind': category,
            'description': description, 'group': group, 'bindings': bindings or [], 'capabilities': capabilities or [],
            'configuration': config or {}, 'controls': controls or [], 'visual': {}}

def relation(source, target, kind, label=None):
    default, category = RELATIONSHIPS.get(kind, (kind.replace('_', ' ').title(), 'context'))
    return {'id': f'{source}-{kind}-{target}', 'source': source, 'target': target, 'kind': kind,
            'label': label or default, 'category': category}

def metric(label, unit, component_id, *, data_type='number', precision=2, freshness=None, source='telemetry', device_id=None):
    return {'unit': unit, 'label': label, 'component': component_id, 'component_id': component_id,
            'device_id': device_id, 'data_type': data_type, 'precision': precision,
            'freshness_seconds': freshness, 'calibrated': True, 'source': source}

def led_definition(mapping, device_id, connector, **_):
    return {'schema_version': SCHEMA_VERSION, 'primary_field': 'led_on', 'fields': {
        'led_on': metric('Reported LED state', '', 'led', data_type='boolean', precision=0, device_id=device_id),
        'last_command_id': metric('Acknowledged command', '', 'led', data_type='categorical', precision=0, device_id=device_id),
    }, 'components': [
        component('board', 'Arduino UNO R4 WiFi', 'edge_controller', 'controller', 'Runs registered control firmware.', group='Device', config={'device_id': device_id, 'connector': connector}),
        component('resistor', '470 Ω resistor', 'resistor', 'passive', 'Series current limiter for the LED circuit.', group='Circuit', config={'resistance_ohms': 470}),
        component('led', 'External LED', 'indicator_led', 'actuator', 'Reported state is confirmed by firmware telemetry.', group='Circuit', bindings=['led_on', 'last_command_id'], capabilities=['action:set_led'], config={'digital_pin': 'D7'}, controls=[{'action': 'set_led', 'label': 'Set LED', 'parameters': {'value': {'type': 'boolean'}}, 'expected': {'field': 'led_on'}, 'timeout_seconds': 12}]),
        component('ground', 'Ground', 'ground', 'power', 'LED return path.', group='Circuit'),
        component('transport', 'Device connector', 'telemetry_gateway', 'gateway', 'Configured USB gateway or direct Wi-Fi MQTT route.', group='Transport'),
    ], 'edges': [relation('board', 'resistor', 'controls', 'D7 output'), relation('resistor', 'led', 'connected', 'Series path'), relation('led', 'ground', 'powers', 'Return'), relation('board', 'transport', 'telemetry')],
       'groups': [{'id': 'device', 'name': 'Device'}, {'id': 'circuit', 'name': 'Circuit'}, {'id': 'transport', 'name': 'Transport'}]}

def sensor_definition(template, mapping, device_id, connector, **_):
    presets = {'temperature': ('temperature_c', '°C', 'Temperature', 'temperature_sensor', 'Room'), 'water': ('water_level_cm', 'cm', 'Water level', 'water_level_sensor', 'Tank'), 'generic': (mapping['field'], mapping['unit'], 'Sensor reading', 'generic_sensor', 'Monitored asset')}
    field, unit, label, sensor_type, asset_name = presets[template]
    return {'schema_version': SCHEMA_VERSION, 'primary_field': field, 'fields': {field: metric(label, unit, 'sensor', freshness=8, device_id=device_id)}, 'components': [
        component('asset', asset_name, 'physical_asset', 'asset', 'Physical context for the measurement.', group='System'),
        component('sensor', f'{label} sensor', sensor_type, 'sensor', 'Reports the configured telemetry field.', group='System', bindings=[field]),
        component('board', 'Registered device', 'edge_controller', 'controller', 'Reports telemetry through the configured connector.', group='Device', config={'device_id': device_id, 'connector': connector}),
        component('transport', 'Device connector', 'telemetry_gateway', 'gateway', 'Configured transport route.', group='Transport'),
    ], 'edges': [relation('sensor', 'asset', 'measures'), relation('sensor', 'board', 'connected'), relation('board', 'transport', 'telemetry')], 'groups': [{'id': 'system', 'name': 'System'}, {'id': 'device', 'name': 'Device'}, {'id': 'transport', 'name': 'Transport'}]}

def connectivity_definition(mapping, device_id, connector, inserted=False, cable='SMA connection'):
    return {'schema_version': SCHEMA_VERSION, 'primary_field': 'rf_detector_v', 'fields': {'rf_detector_v': metric('Detector output', 'V', 'detector', precision=4, device_id=device_id), 'wifi_rssi_dbm': metric('Wi-Fi RSSI', 'dBm', 'board', precision=0, device_id=device_id)}, 'components': [
        component('antenna', 'Antenna', 'rf_antenna', 'passive', 'Configured RF input inventory.', group='RF path'), component('cable', 'RF cable', 'rf_cable', 'passive', cable, group='RF path'),
        component('detector', 'RF detector', 'rf_detector', 'sensor', 'Reports only configured detector output.', group='RF path', bindings=['rf_detector_v']), component('board', 'Registered device', 'edge_controller', 'controller', 'Reports configured readings.', group='Device', bindings=['wifi_rssi_dbm'], config={'device_id': device_id, 'connector': connector}), component('transport', 'Device connector', 'telemetry_gateway', 'gateway', 'Configured transport route.', group='Transport')],
       'edges': [relation('antenna', 'cable', 'connected'), relation('cable', 'detector', 'connected'), relation('detector', 'board', 'connected'), relation('board', 'transport', 'telemetry')], 'groups': [{'id': 'rf', 'name': 'RF path'}, {'id': 'device', 'name': 'Device'}, {'id': 'transport', 'name': 'Transport'}]}

def definition(template='generic', mapping=None, inserted=False, cable='SMA connection', device_id='device-01', connector='usb'):
    mapping = mapping or {'field': 'sensor_value', 'unit': 'value'}
    if template == 'led': return led_definition(mapping, device_id, connector)
    if template == 'connectivity': return connectivity_definition(mapping, device_id, connector, inserted, cable)
    return sensor_definition(template if template in ('generic', 'temperature', 'water') else 'generic', mapping, device_id, connector)

def migrate_graph(graph, freshness_seconds=8, template=None, device_id='device-01', connector='usb', mapping=None):
    if graph.get('schema_version') == SCHEMA_VERSION: return graph, False
    if template in ('led', 'generic', 'temperature', 'water', 'connectivity'):
        return definition(template, mapping, device_id=device_id, connector=connector), True
    return graph, False
