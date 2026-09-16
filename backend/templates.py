"""Digital Twin definition for the single physical LED project."""

SCHEMA_VERSION = 4
RELATIONSHIPS = {
    'connected': ('Wired to', 'physical'),
    'controls': ('Drives', 'control'),
    'telemetry': ('Reports through', 'data'),
    'returns': ('Returns to', 'power'),
}


def component(cid, name, ctype, category, description, *, group=None, bindings=None, capabilities=None, config=None):
    return {
        'id': cid, 'name': name, 'label': name, 'type': ctype, 'category': category, 'kind': category,
        'description': description, 'group': group, 'bindings': bindings or [], 'capabilities': capabilities or [],
        'configuration': config or {}, 'visual': {},
    }


def relation(source, target, kind, label=None):
    default_label, category = RELATIONSHIPS[kind]
    return {
        'id': f'{source}-{kind}-{target}', 'source': source, 'target': target, 'kind': kind,
        'label': label or default_label, 'category': category,
    }


def metric(label, component_id, data_type):
    return {
        'unit': '', 'label': label, 'component': component_id, 'component_id': component_id,
        'data_type': data_type, 'precision': 0, 'freshness_seconds': None,
        'calibrated': True, 'source': 'hardware telemetry',
    }


def definition(*_args, **_kwargs):
    """Return the real UNO R4 D7 LED wiring and its live transport path."""
    return {
        'schema_version': SCHEMA_VERSION,
        'fields': {
            'led_on': metric('Reported LED state', 'led', 'boolean'),
            'last_command_id': metric('Acknowledged command', 'led', 'categorical'),
        },
        'primary_field': 'led_on',
        'components': [
            component('board', 'Arduino UNO R4 WiFi', 'edge_controller', 'controller',
                      'Physical controller connected by USB. Digital pin D7 drives the external LED circuit.',
                      group='Hardware', config={'device_id': 'uno-r4-01', 'output_pin': 'D7'}),
            component('resistor', '470 Ω resistor', 'resistor', 'passive',
                      'Required series resistor between D7 and the LED anode.', group='Hardware',
                      config={'resistance_ohms': 470}),
            component('led', 'External LED', 'indicator_led', 'actuator',
                      'Physical LED: long leg (anode) toward the resistor; short leg (cathode) toward GND.',
                      group='Hardware', bindings=['led_on', 'last_command_id'], capabilities=['action:set_led'],
                      config={'digital_pin': 'D7', 'active_level': 'HIGH'}),
            component('ground', 'UNO R4 GND', 'ground', 'power',
                      'The LED cathode returns to an Arduino GND pin.', group='Hardware'),
            component('gateway', 'USB serial gateway', 'telemetry_gateway', 'gateway',
                      'Forwards MQTT commands to the board and returns board telemetry.', group='Transport',
                      capabilities=['reports_availability'], config={'baud': 115200}),
            component('backend', 'Agentwin', 'operations_service', 'software',
                      'Publishes LED commands and completes them only after matching hardware telemetry.',
                      group='Application'),
        ],
        'edges': [
            relation('board', 'resistor', 'controls', 'D7 output'),
            relation('resistor', 'led', 'connected', 'Series connection'),
            relation('led', 'ground', 'returns', 'Cathode to GND'),
            relation('backend', 'gateway', 'telemetry', 'MQTT command / telemetry'),
            relation('gateway', 'board', 'telemetry', 'USB serial'),
        ],
        'groups': [
            {'id': 'hardware', 'name': 'Hardware'},
            {'id': 'transport', 'name': 'Transport'},
            {'id': 'application', 'name': 'Application'},
        ],
    }


def migrate_graph(graph, freshness_seconds=8, template=None):
    desired = definition()
    return (graph, False) if graph == desired else (desired, True)
