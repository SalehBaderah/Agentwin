"""Versioned, configuration-driven digital representation templates."""

SCHEMA_VERSION = 3
RELATIONSHIPS = {
    'measures': ('Measures', 'physical'), 'controls': ('Controls', 'control'),
    'telemetry': ('Sends data to', 'data'), 'connected': ('Connected to', 'physical'),
    'located_in': ('Located in', 'context'), 'powers': ('Supplies power to', 'power'),
}

def component(cid, name, ctype, category, description, *, group=None, bindings=None, capabilities=None, config=None, visual=None):
    return {'id': cid, 'name': name, 'label': name, 'type': ctype, 'category': category, 'kind': category,
            'description': description, 'group': group, 'bindings': bindings or [], 'capabilities': capabilities or [],
            'configuration': config or {}, 'visual': visual or {}}

def relation(source, target, kind, label=None):
    default_label, category = RELATIONSHIPS.get(kind, (kind.replace('_', ' ').title(), 'context'))
    return {'id': f'{source}-{kind}-{target}', 'source': source, 'target': target, 'kind': kind,
            'label': label or default_label, 'category': category}

def metric(label, unit, component_id, *, data_type='number', precision=2, freshness=None, calibrated=True):
    return {'unit': unit, 'label': label, 'component': component_id, 'component_id': component_id,
            'data_type': data_type, 'precision': precision, 'freshness_seconds': freshness,
            'calibrated': calibrated, 'source': 'telemetry'}

def definition(template, mapping, inserted=False, cable='SMA connection'):
    field, unit = mapping['field'], mapping['unit']
    if template in ('generic', 'temperature', 'water'):
        if template == 'temperature':
            field, unit, label, sensor_type, asset_id, asset_name, asset_type = 'temperature_c', '°C', 'Temperature', 'temperature_sensor', 'room', 'Monitored room', 'room'
        elif template == 'water':
            field, unit, label, sensor_type, asset_id, asset_name, asset_type = 'water_level_cm', 'cm', 'Water level', 'water_level_sensor', 'tank', 'Water tank', 'tank'
        else:
            label, sensor_type, asset_id, asset_name, asset_type = 'Sensor reading', 'custom_sensor', 'asset', 'Monitored asset', 'unknown_asset'
        return {
            'schema_version': SCHEMA_VERSION,
            'fields': {field: metric(label, unit, 'sensor')}, 'primary_field': field,
            'components': [
                component(asset_id, asset_name, asset_type, 'asset', 'Physical context associated with the registered measurement.', group='Monitored area'),
                component('sensor', label + ' sensor', sensor_type, 'sensor', 'Registered sensor. Values resolve through its configured data binding.', group='Monitored area', bindings=[field]),
                component('board', 'Edge device', 'edge_controller', 'controller', 'Registered controller or edge device.', capabilities=['reports_telemetry']),
                component('backend', 'Agentwin', 'operations_service', 'software', 'Stores project state, evidence, and scoped agent context.', group='Platform'),
            ],
            'edges': [relation('sensor', asset_id, 'measures'), relation('sensor', 'board', 'connected'), relation('board', 'backend', 'telemetry')],
            'groups': [{'id': 'monitored-area', 'name': 'Monitored area'}, {'id': 'platform', 'name': 'Platform'}],
        }

    components = [
        component('antenna', 'Antenna', 'rf_antenna', 'passive', 'Inventory only. Antenna band does not establish detector coverage.', group='RF measurement', config={'role': 'RF input'}),
        component('sma', 'SMA connection', 'rf_cable', 'passive', cable, group='RF measurement', config={'arrangement': cable}),
        component('attenuator', '10 dB attenuator', 'rf_attenuator', 'passive', 'Passive, manually inserted measurement-path component.', group='RF measurement', config={'inserted': inserted, 'nominal_attenuation_db': 10}),
        component('detector', 'AD8313 detector', 'rf_detector', 'sensor', 'Logarithmic detector output; no spectrum or root-cause diagnosis.', group='RF measurement', bindings=['rf_detector_v']),
        component('board', 'Arduino UNO R4 WiFi', 'edge_controller', 'controller', 'Reads the detector output and reports telemetry.', group='Edge', bindings=['rf_adc_raw', 'wifi_connected', 'wifi_rssi_dbm'], capabilities=['reports_telemetry'], config={'adc_bits': 12, 'reference_v_nominal': 5.0, 'analog_pin': 'A0'}),
        component('led', 'Test LED', 'indicator_led', 'actuator', 'External LED controlled through Arduino digital pin D7.', group='Edge', bindings=['led_on', 'last_command_id'], capabilities=['action:set_led'], config={'digital_pin': 'D7', 'active_level': 'HIGH', 'series_resistor_ohms': 470}),
        component('gateway', 'USB / Wi-Fi connector', 'telemetry_gateway', 'gateway', 'Transports registered device telemetry to the backend.', group='Transport', capabilities=['reports_availability']),
        component('backend', 'Agentwin backend', 'operations_service', 'software', 'Validates, stores, and publishes project state.', group='Platform'),
        component('browser', 'Web application', 'operator_interface', 'software', 'Displays current project state and evidence.', group='Platform'),
    ]
    chain = ['antenna', 'sma'] + (['attenuator'] if inserted else []) + ['detector', 'board']
    edges = [relation(a, b, 'connected', 'RF / analog') for a, b in zip(chain, chain[1:])]
    edges += [relation('board', 'led', 'controls')]
    edges += [relation(a, b, 'telemetry') for a, b in [('board', 'gateway'), ('gateway', 'backend'), ('backend', 'browser')]]
    return {'schema_version': SCHEMA_VERSION, 'fields': {
        'rf_adc_raw': metric('Raw ADC', 'counts', 'board', precision=0),
        'rf_detector_v': metric('Detector output', 'V', 'detector', precision=4, calibrated=False),
        'wifi_connected': metric('Arduino Wi-Fi', '', 'board', data_type='boolean', precision=0),
        'wifi_rssi_dbm': metric('Arduino Wi-Fi RSSI', 'dBm', 'board', precision=0),
        'led_on': metric('LED state', '', 'led', data_type='boolean', precision=0),
        'last_command_id': metric('Last command', '', 'led', data_type='categorical', precision=0),
    }, 'primary_field': 'rf_detector_v', 'components': components, 'edges': edges,
       'groups': [{'id': 'rf-measurement', 'name': 'RF measurement'}, {'id': 'edge', 'name': 'Edge'}, {'id': 'transport', 'name': 'Transport'}, {'id': 'platform', 'name': 'Platform'}]}

def migrate_graph(graph, freshness_seconds=8, template=None):
    """Upgrade stored v1 graphs without changing component or metric IDs."""
    if graph.get('schema_version') == SCHEMA_VERSION:
        return graph, False
    migrated = dict(graph)
    migrated['schema_version'], migrated['groups'] = SCHEMA_VERSION, migrated.get('groups', [])
    migrated['components'] = [{**c, 'name': c.get('name', c.get('label', c['id'])),
        'label': c.get('label', c.get('name', c['id'])), 'type': c.get('type', c.get('kind', 'generic')),
        'category': c.get('category', c.get('kind', 'generic')), 'group': c.get('group'),
        'bindings': c.get('bindings', []), 'capabilities': c.get('capabilities', []),
        'configuration': c.get('configuration', {}), 'visual': c.get('visual', {})} for c in migrated.get('components', [])]
    for key, value in migrated.get('fields', {}).items():
        value.setdefault('component_id', value.get('component')); value.setdefault('component', value.get('component_id'))
        value.setdefault('data_type', 'boolean' if key.endswith('_connected') else 'number')
        value.setdefault('precision', 0 if key.endswith(('_raw', '_dbm')) else 2)
        value.setdefault('freshness_seconds', freshness_seconds); value.setdefault('calibrated', True); value.setdefault('source', 'telemetry')
        owner = next((c for c in migrated['components'] if c['id'] == value['component_id']), None)
        if owner and key not in owner['bindings']: owner['bindings'].append(key)
    migrated['edges'] = [{**e, 'id': e.get('id', f"{e['source']}-{e.get('kind', 'connected')}-{e['target']}"),
        'label': e.get('label', RELATIONSHIPS.get(e.get('kind'), (e.get('kind', 'Connected'), 'context'))[0]),
        'category': e.get('category', RELATIONSHIPS.get(e.get('kind'), ('', 'context'))[1])} for e in migrated.get('edges', [])]
    if template == 'connectivity' and not any(c['id'] == 'led' for c in migrated['components']):
        migrated['components'].append(component('led', 'Test LED', 'indicator_led', 'actuator', 'External LED controlled through Arduino digital pin D7.', group='Edge', bindings=['led_on', 'last_command_id'], capabilities=['action:set_led'], config={'digital_pin': 'D7', 'active_level': 'HIGH', 'series_resistor_ohms': 470}))
        migrated['fields']['led_on'] = metric('LED state', '', 'led', data_type='boolean', precision=0, freshness=freshness_seconds)
        migrated['fields']['last_command_id'] = metric('Last command', '', 'led', data_type='categorical', precision=0, freshness=freshness_seconds)
        migrated['edges'].append(relation('board', 'led', 'controls'))
    return migrated, True
