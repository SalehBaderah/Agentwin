"""Demo data: creates sample projects and runs virtual MQTT devices for them.

Virtual devices publish through the broker like real boards, so the full live path
(ingestion, charts, silence/threshold alerts, LED commands, summaries) can be tested
without hardware. Every demo project name starts with "Demo" so it is easy to spot
and remove (--reset deletes them first).
"""
import argparse, json, math, os, random, threading, time, uuid
import httpx
from paho.mqtt import client as mqtt

def number(cid, kind, label, device, field, unit, precision=2, pin=None):
    return {'component_id': cid, 'component_type': kind, 'label': label, 'device_id': device, 'pin': pin, 'field_key': field, 'field_type': 'number', 'unit': unit, 'precision': precision}

PROJECTS = [
    {
        'name': 'Demo Greenhouse Climate', 'template': 'temperature', 'device_id': 'gh-node-01', 'connector': 'mqtt',
        'freshness_seconds': 8, 'interval_seconds': 2, 'cable_description': 'Virtual Wi-Fi node publishing to the local broker',
        'components': [
            number('air-temp', 'temperature', 'Air temperature', 'gh-node-01', 'temperature_c', '°C'),
            number('air-humidity', 'humidity', 'Relative humidity', 'gh-node-01', 'humidity_percent', '%', 1),
            number('soil-moisture', 'analog', 'Soil moisture', 'gh-node-01', 'soil_moisture_raw', 'count', 0, 'A0'),
            {'component_id': 'led', 'component_type': 'led', 'label': 'Grow light', 'device_id': 'gh-node-01', 'pin': 'D7', 'field_key': 'led_on', 'field_type': 'boolean', 'unit': '', 'precision': 0},
        ],
        'monitoring': {'silence_seconds': 20, 'summary_interval_minutes': 5, 'threshold_rules': [
            {'field_key': 'temperature_c', 'direction': 'above', 'limit': 32.0},
            {'field_key': 'humidity_percent', 'direction': 'below', 'limit': 40.0},
        ]},
    },
    {
        'name': 'Demo Water Tanks', 'template': 'water', 'device_id': 'tank-a', 'connector': 'mqtt',
        'devices': [{'device_id': 'tank-b', 'connector': 'mqtt'}],
        'freshness_seconds': 10, 'interval_seconds': 2, 'cable_description': 'Two virtual ultrasonic level sensors',
        'components': [
            number('tank-a-level', 'readonly', 'Tank A level', 'tank-a', 'tank_a_level_cm', 'cm', 1),
            number('tank-b-level', 'readonly', 'Tank B level', 'tank-b', 'tank_b_level_cm', 'cm', 1),
            number('pump-current', 'analog', 'Pump current', 'tank-b', 'pump_current_a', 'A', 2),
        ],
        'monitoring': {'silence_seconds': 20, 'summary_interval_minutes': 5, 'threshold_rules': [
            {'field_key': 'tank_a_level_cm', 'direction': 'below', 'limit': 25.0},
            {'field_key': 'pump_current_a', 'direction': 'above', 'limit': 4.5},
        ]},
    },
    {
        'name': 'Demo RF Connectivity Lab', 'template': 'connectivity', 'device_id': 'rf-probe-01', 'connector': 'mqtt',
        'freshness_seconds': 8, 'interval_seconds': 1, 'cable_description': 'Virtual AD8313 detector on a Wi-Fi board',
        'components': [
            number('rf-detector', 'analog', 'Detector output', 'rf-probe-01', 'rf_detector_v', 'V', 4, 'A5'),
            number('wifi', 'readonly', 'Wi-Fi RSSI', 'rf-probe-01', 'wifi_rssi_dbm', 'dBm', 0),
        ],
        'monitoring': {'silence_seconds': 15, 'summary_interval_minutes': 5, 'threshold_rules': [
            {'field_key': 'rf_detector_v', 'direction': 'above', 'limit': 1.6},
        ]},
    },
]

# Each generator gets seconds since start (t) and returns readings. Cycles are chosen so
# every alert type opens and closes within a few minutes of watching.
def greenhouse(t, state):
    heat = 7 * max(0, math.sin(2 * math.pi * t / 300)) ** 4  # heat wave peaking every 5 min
    return {'temperature_c': round(26 + 2 * math.sin(t / 40) + heat + random.gauss(0, 0.2), 2),
            'humidity_percent': round(58 - 3 * heat + 4 * math.sin(t / 55) + random.gauss(0, 0.5), 1),
            'soil_moisture_raw': float(int(620 - (t % 240) * 0.8 + random.gauss(0, 4))),
            'led_on': state['led_on'], 'last_command_id': state['last_command_id']}

def tank_a(t, state):
    return {'tank_a_level_cm': round(20 + 60 * (1 - (t % 360) / 360) + random.gauss(0, 0.4), 1)}  # drains, refills every 6 min

def tank_b(t, state):
    surge = 2.2 if (t % 200) < 12 else 0  # pump current spike every 200 s
    return {'tank_b_level_cm': round(70 + 8 * math.sin(t / 60) + random.gauss(0, 0.4), 1),
            'pump_current_a': round(2.3 + surge + random.gauss(0, 0.08), 2)}

def rf_probe(t, state):
    burst = 0.9 if (t % 150) < 10 else 0  # interference burst every 150 s
    return {'rf_detector_v': round(0.55 + burst + 0.05 * math.sin(t / 7) + random.gauss(0, 0.02), 4),
            'wifi_rssi_dbm': float(round(-58 - 12 * (burst > 0) + random.gauss(0, 2)))}

# (project name, device, generator, interval seconds, silent window (start, end) within a 420 s cycle)
DEVICES = [
    ('Demo Greenhouse Climate', 'gh-node-01', greenhouse, 2, None),
    ('Demo Water Tanks', 'tank-a', tank_a, 2, None),
    ('Demo Water Tanks', 'tank-b', tank_b, 2, (300, 340)),  # goes offline for 40 s -> silence alert
    ('Demo RF Connectivity Lab', 'rf-probe-01', rf_probe, 1, None),
]

def ensure_projects(api, reset):
    existing = {item['project']['name']: item['project']['id'] for item in api.get('/projects').raise_for_status().json()}
    ids = {}
    for spec in PROJECTS:
        if spec['name'] in existing and reset:
            api.delete(f"/projects/{existing.pop(spec['name'])}").raise_for_status()
        if spec['name'] in existing:
            ids[spec['name']] = existing[spec['name']]; print(f"Using existing project {spec['name']} ({ids[spec['name']]})")
        else:
            project = api.post('/projects', json=spec).raise_for_status().json()
            ids[spec['name']] = project['id']; print(f"Created project {spec['name']} ({project['id']})")
    return ids

def run_device(host, port, pid, device, generator, interval, silent, stop):
    state = {'led_on': False, 'last_command_id': None}
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f'demo-{device}-{uuid.uuid4().hex[:6]}')
    if os.getenv('MQTT_USERNAME'): client.username_pw_set(os.getenv('MQTT_USERNAME'), os.getenv('MQTT_PASSWORD'))
    def on_connect(c, *_): c.subscribe(f'agentwin/{pid}/{device}/command', qos=1)
    def on_command(_c, _u, message):
        body = json.loads(message.payload)
        if body.get('action') == 'set_led':
            print(f"[{device}] command set_led={body['value']} ({body['command_id']})")
            time.sleep(1)  # simulate actuation latency before telemetry confirms it
            state['led_on'], state['last_command_id'] = bool(body['value']), body['command_id']
    client.on_connect, client.on_message = on_connect, on_command
    client.connect(host, port); client.loop_start()
    boot, sequence, started = 'demo-' + uuid.uuid4().hex[:12], 0, time.monotonic()
    while not stop.is_set():
        t = time.monotonic() - started
        if not (silent and silent[0] <= t % 420 < silent[1]):
            payload = {'schema_version': 1, 'project_id': pid, 'device_id': device, 'boot_id': boot, 'sequence': sequence,
                       'uptime_ms': int(t * 1000), 'session_registration': True, 'readings': generator(t, state)}
            client.publish(f'agentwin/{pid}/{device}/telemetry', json.dumps(payload), qos=0, retain=False); sequence += 1
        stop.wait(interval)
    client.loop_stop(); client.disconnect()

def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--api', default=os.getenv('AGENTWIN_API_URL', 'http://127.0.0.1:8000/api'))
    parser.add_argument('--mqtt-host', default=os.getenv('MQTT_HOST', '127.0.0.1'))
    parser.add_argument('--mqtt-port', type=int, default=int(os.getenv('MQTT_PORT', '1883')))
    parser.add_argument('--reset', action='store_true', help='delete and recreate the demo projects first')
    parser.add_argument('--setup-only', action='store_true', help='create projects without running virtual devices')
    args = parser.parse_args()
    # The backend's TrustedHostMiddleware only accepts localhost, so name it explicitly
    # when reaching it by a Compose service name.
    with httpx.Client(base_url=args.api, timeout=10, headers={'Host': 'localhost'}) as api:
        for attempt in range(30):  # the backend may still be starting under Compose
            try: api.get('/health').raise_for_status(); break
            except httpx.HTTPError as error:
                if attempt == 29: raise SystemExit(f'Backend not reachable at {args.api}: {error}')
                time.sleep(2)
        ids = ensure_projects(api, args.reset)
    if args.setup_only: return
    stop = threading.Event()
    threads = [threading.Thread(target=run_device, args=(args.mqtt_host, args.mqtt_port, ids[name], device, gen, interval, silent, stop), daemon=True) for name, device, gen, interval, silent in DEVICES]
    for thread in threads: thread.start()
    print(f'Streaming {len(threads)} virtual devices to {args.mqtt_host}:{args.mqtt_port}. Ctrl+C to stop.')
    try:
        while True: time.sleep(1)
    except KeyboardInterrupt:
        stop.set()
        for thread in threads: thread.join(timeout=3)

if __name__ == '__main__':
    main()
