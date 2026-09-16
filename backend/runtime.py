import asyncio
import json
import logging
import math
import os
import time
from paho.mqtt import client as mqtt
from .store import uid

log = logging.getLogger(__name__)

def sample(p, boot, sequence, elapsed, scenario='normal'):
    value = round(1.2 + .045 * math.sin(sequence / 5) + (.65 if scenario == 'level-change' else 0), 4)
    if p['template'] == 'connectivity':
        readings = {'rf_adc_raw': round(value / 5 * 4095), 'rf_detector_v': value, 'wifi_connected': None, 'wifi_rssi_dbm': None}
    else:
        readings = {p['mapping']['field']: round(23 + math.sin(sequence / 5) + (12 if scenario == 'level-change' else 0), 2)}
    return {'schema_version': 1, 'project_id': p['id'], 'device_id': p['device_id'], 'boot_id': boot, 'sequence': sequence, 'uptime_ms': int(elapsed * 1000), 'readings': readings}

class Runtime:
    def __init__(self, store):
        self.store = store
        self.tasks = {}
        self.mqtt_connected = False
        self.rejections = 0
        self.client = None

    def start_mqtt(self):
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id='agentwin-backend-' + uid()[:8], clean_session=True)
        if os.getenv('MQTT_USERNAME'):
            self.client.username_pw_set(os.getenv('MQTT_USERNAME'), os.getenv('MQTT_PASSWORD'))
        self.client.reconnect_delay_set(1, 15)
        def connected(client, userdata, flags, reason, properties):
            self.mqtt_connected = not reason.is_failure
            client.subscribe('agentwin/+/+/telemetry', qos=0)
            client.subscribe('agentwin/+/+/status', qos=0)
        def disconnected(*args):
            self.mqtt_connected = False
        def message(client, userdata, msg):
            try:
                if len(msg.payload) > 8192:
                    raise ValueError('Message too large')
                _, pid, device, kind = msg.topic.split('/')
                p = self.store.project(pid)
                if p['device_id'] != device:
                    raise ValueError('Device mismatch')
                body = json.loads(msg.payload)
                if kind == 'status':
                    if msg.retain:
                        return
                    self.store.execute('INSERT OR REPLACE INTO gateways VALUES (?,?,?)', (pid, time.time(), int(body.get('online') is True)))
                    return
                if body.get('project_id') != pid or body.get('device_id') != device:
                    raise ValueError('Topic mismatch')
                result = self.store.ingest(body, self.store.session(pid, mode='live')['id'], retained=msg.retain)
                if not result['accepted']:
                    self.rejections += 1
            except Exception:
                self.rejections += 1
                log.warning('Rejected MQTT message on registered ingestion boundary')
        self.client.on_connect = connected
        self.client.on_disconnect = disconnected
        self.client.on_message = message
        self.client.connect_async(os.getenv('MQTT_HOST', '127.0.0.1'), int(os.getenv('MQTT_PORT', '1883')), 15)
        self.client.loop_start()

    async def scenario(self, pid, sid, scenario):
        session = self.store.session(pid, sid)
        if session['mode'] != 'simulated':
            raise ValueError('Demo controls require a simulated session')
        self.store.execute('UPDATE sessions SET scenario=? WHERE id=?', (scenario, sid))
        if sid not in self.tasks or self.tasks[sid].done():
            if scenario not in ('pause', 'stop'):
                self.tasks[sid] = asyncio.create_task(self.produce(pid, sid))

    def component_action(self, pid, sid, component_id, action, value):
        session = self.store.session(pid, sid)
        if session['mode'] != 'live':
            raise ValueError('Physical actions require the live session')
        project = self.store.project(pid)
        component = next((item for item in project['graph']['components'] if item['id'] == component_id), None)
        if not component or f'action:{action}' not in component.get('capabilities', []):
            raise ValueError('Action is not allowed for this component')
        if project['connector'] == 'usb' and self.store.state(pid, sid)['gateway_status'] != 'online':
            raise ValueError('USB gateway is not connected')
        if not self.client or not self.mqtt_connected:
            raise ValueError('MQTT broker is not connected')
        action_id = uid()
        self.store.execute('INSERT INTO actions VALUES (?,?,?,?,?,?,?)', (action_id, pid, sid, time.time(), f'{action}:{str(value).lower()}', component_id, 'requested'))
        payload = json.dumps({'schema_version': 1, 'command_id': action_id, 'action': action, 'component_id': component_id, 'value': value})
        info = self.client.publish(f'agentwin/{pid}/{project["device_id"]}/command', payload, qos=1, retain=False)
        if info.rc != mqtt.MQTT_ERR_SUCCESS:
            self.store.execute("UPDATE actions SET status='failed' WHERE id=?", (action_id,))
            raise ValueError('Command could not be published')
        return {'id': action_id, 'status': 'requested', 'requested_value': value}

    async def produce(self, pid, sid):
        boot, seq, started = uid(), 0, time.monotonic()
        while True:
            scenario = self.store.session(pid, sid)['scenario']
            if scenario == 'stop':
                return
            p = self.store.project(pid)
            if scenario != 'pause':
                self.store.ingest(sample(p, boot, seq, time.monotonic() - started, scenario), sid)
                seq += 1
            await asyncio.sleep(p['interval_seconds'])

    async def replay(self, pid, sid, recording):
        rows = self.store.history(pid, recording, 180)
        if not rows:
            return
        boot = uid()
        for i, r in enumerate(rows):
            if i:
                await asyncio.sleep(min(max(r['received'] - rows[i-1]['received'], .05), 5))
            p = self.store.project(pid)
            payload = {'schema_version': 1, 'project_id': pid, 'device_id': p['device_id'], 'boot_id': boot, 'sequence': i, 'uptime_ms': int((r['received']-rows[0]['received'])*1000), 'readings': r['readings']}
            self.store.ingest(payload, sid, original={'reading_id': r['id'], 'received': r['received'], 'session': recording, 'provenance': json.loads(self.store.session(pid, recording)['provenance'])})

    async def tick(self):
        while True:
            for p in self.store.projects():
                for mode in ('live', 'simulated'):
                    s = self.store.session(p['id'], mode=mode)
                    # Unstarted simulated sessions do not create phantom missing-data events.
                    if mode == 'live' or s['scenario'] != 'stop':
                        with self.store.lock:
                            self.store.evaluate(p['id'], s['id'])
            await asyncio.sleep(1)

    async def close(self):
        for task in self.tasks.values():
            task.cancel()
        await asyncio.gather(*self.tasks.values(), return_exceptions=True)
        if self.client:
            self.client.disconnect()
            self.client.loop_stop()
