import asyncio, json, logging, math, os, time
from paho.mqtt import client as mqtt
from .store import uid

log = logging.getLogger(__name__)

def sample(project, boot, sequence, elapsed, scenario='normal'):
    template = project['template']; field = project['graph']['primary_field']
    if template == 'led': readings = {'led_on': False, 'last_command_id': None}
    elif template == 'connectivity': readings = {'rf_detector_v': round(1.2 + .04 * math.sin(sequence / 5), 4), 'wifi_rssi_dbm': None}
    else: readings = {field: round(23 + math.sin(sequence / 5), 2)}
    return {'schema_version': 1, 'project_id': project['id'], 'device_id': project['device_id'], 'boot_id': boot, 'sequence': sequence, 'uptime_ms': int(elapsed * 1000), 'readings': readings}

class Runtime:
    def __init__(self, store): self.store, self.tasks, self.mqtt_connected, self.rejections, self.client = store, {}, False, 0, None
    def start_mqtt(self):
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id='agentwin-backend-' + uid()[:8], clean_session=True)
        if os.getenv('MQTT_USERNAME'): self.client.username_pw_set(os.getenv('MQTT_USERNAME'), os.getenv('MQTT_PASSWORD'))
        self.client.reconnect_delay_set(1, 15)
        def connected(client, userdata, flags, reason, properties):
            self.mqtt_connected = not reason.is_failure; client.subscribe('agentwin/+/+/telemetry', qos=0); client.subscribe('agentwin/+/+/status', qos=0)
        def disconnected(*_): self.mqtt_connected = False
        def message(client, userdata, msg):
            try:
                if len(msg.payload) > 8192 or msg.retain: raise ValueError('invalid message')
                _, pid, device, kind = msg.topic.split('/'); project = self.store.project(pid)
                if device not in {item['id'] for item in project['devices']}: raise ValueError('device mismatch')
                body = json.loads(msg.payload)
                if kind == 'status': self.store.execute('INSERT OR REPLACE INTO gateways VALUES (?,?,?,?)', (pid, device, time.time(), int(body.get('online') is True))); return
                if body.get('project_id') != pid or body.get('device_id') != device: raise ValueError('topic mismatch')
                result = self.store.ingest(body, self.store.session(pid, mode='live')['id'], retained=False)
                if not result['accepted']: self.rejections += 1
            except Exception:
                self.rejections += 1; log.warning('Rejected MQTT message on scoped ingestion boundary')
        self.client.on_connect, self.client.on_disconnect, self.client.on_message = connected, disconnected, message
        self.client.connect_async(os.getenv('MQTT_HOST', '127.0.0.1'), int(os.getenv('MQTT_PORT', '1883')), 15); self.client.loop_start()

    def component_action(self, pid, sid, component_id, action, value):
        session, project = self.store.session(pid, sid), self.store.project(pid)
        if session['mode'] != 'live': raise ValueError('Physical actions require the live session')
        component = next((item for item in project['graph']['components'] if item['id'] == component_id), None)
        control = next((item for item in (component or {}).get('controls', []) if item['action'] == action), None)
        if not control or f'action:{action}' not in component['capabilities']: raise ValueError('Action is not implemented for this component')
        device = project['graph']['fields'].get(control['expected']['field'], {}).get('device_id') or project['device_id']
        device_config = next((item for item in project['devices'] if item['id'] == device), None)
        if not device_config: raise ValueError('Control device is not registered to this project')
        gateway = self.store.rows('SELECT * FROM gateways WHERE project=? AND device=?', (pid, device))
        if device_config['connector'] == 'usb' and (not gateway or not gateway[0]['online'] or time.time()-gateway[0]['received'] > 10): raise ValueError('USB gateway is not connected for this device')
        if not self.client or not self.mqtt_connected: raise ValueError('MQTT broker is not connected')
        action_id, timeout = uid(), control.get('timeout_seconds', 15)
        self.store.execute('INSERT INTO actions VALUES (?,?,?,?,?,?,?)', (action_id, pid, sid, time.time(), f'{action}:{json.dumps(value)}', component_id, 'requested'))
        self.store.execute('INSERT INTO action_expectations VALUES (?,?,?,?,?)', (action_id, device, control['expected']['field'], json.dumps(value), time.time()+timeout))
        info = self.client.publish(f'agentwin/{pid}/{device}/command', json.dumps({'schema_version': 1, 'command_id': action_id, 'action': action, 'component_id': component_id, 'value': value}), qos=1, retain=False)
        if info.rc != mqtt.MQTT_ERR_SUCCESS: self.store.execute("UPDATE actions SET status='failed' WHERE id=?", (action_id,)); raise ValueError('Command could not be published')
        return {'id': action_id, 'status': 'requested', 'timeout_seconds': timeout}

    async def scenario(self, pid, sid, scenario):
        if self.store.session(pid, sid)['mode'] != 'simulated': raise ValueError('Simulation controls require a simulated session')
        self.store.execute('UPDATE sessions SET scenario=? WHERE id=?', (scenario, sid))
        if scenario not in ('pause', 'stop') and (sid not in self.tasks or self.tasks[sid].done()): self.tasks[sid] = asyncio.create_task(self.produce(pid, sid))
    async def produce(self, pid, sid):
        boot, seq, started = uid(), 0, time.monotonic()
        while True:
            scenario = self.store.session(pid, sid)['scenario']
            if scenario == 'stop': return
            if scenario != 'pause': self.store.ingest(sample(self.store.project(pid), boot, seq, time.monotonic()-started, scenario), sid); seq += 1
            await asyncio.sleep(self.store.project(pid)['interval_seconds'])
    async def tick(self):
        while True:
            for project in self.store.projects():
                for mode in ('live', 'simulated'):
                    try: self.store.evaluate(project['id'], self.store.session(project['id'], mode=mode)['id'])
                    except ValueError: pass
            await asyncio.sleep(1)
    async def close(self):
        for task in self.tasks.values(): task.cancel()
        await asyncio.gather(*self.tasks.values(), return_exceptions=True)
        if self.client: self.client.disconnect(); self.client.loop_stop()
