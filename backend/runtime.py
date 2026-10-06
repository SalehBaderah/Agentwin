import asyncio, json, logging, math, os, time
from paho.mqtt import client as mqtt
from .agent import scheduled_summary
from .notifications import send_email, smtp_configured
from .store import uid
from .control_proposals import control_contract, pending_proposal

log = logging.getLogger(__name__)

def sample(project, boot, sequence, elapsed, scenario='normal'):
    readings = {}
    for field, spec in project['graph']['fields'].items():
        if spec.get('device_id') not in (None, project['device_id']): continue
        if field.endswith('last_command_id'): readings[field] = None
        elif spec.get('data_type') == 'boolean': readings[field] = False
        elif spec.get('data_type') == 'categorical': readings[field] = 'simulated'
        else: readings[field] = round(23 + math.sin(sequence / 5), spec.get('precision', 2))
    return {'schema_version': 1, 'project_id': project['id'], 'device_id': project['device_id'], 'boot_id': boot, 'sequence': sequence, 'uptime_ms': int(elapsed * 1000), 'session_registration': True, 'readings': readings}

class Runtime:
    def __init__(self, store):
        self.store, self.tasks, self.mqtt_connected, self.rejections, self.client = store, {}, False, 0, None
        self.summary_tasks, self.email_task = {}, None
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

    def component_action(self, pid, sid, component_id, action, value, *, proposal_id=None):
        with self.store.lock:
            _, control, device_config, _ = control_contract(self.store, pid, sid, component_id, action, value)
            device = device_config['id']
            gateway = self.store.rows('SELECT * FROM gateways WHERE project=? AND device=?', (pid, device))
            if device_config['connector'] == 'usb' and (not gateway or not gateway[0]['online'] or time.time()-gateway[0]['received'] > 10): raise ValueError('USB gateway is not connected for this device')
            if not self.client or not self.mqtt_connected: raise ValueError('MQTT broker is not connected')
            if proposal_id and self.store.rows("SELECT id FROM actions WHERE project=? AND session=? AND target=? AND status='requested'", (pid, sid, component_id)):
                raise ValueError('A command is already pending for this component; wait for its result')
            action_id, timeout = proposal_id or uid(), control.get('timeout_seconds', 15)
            if proposal_id:
                changed = self.store.db.execute("UPDATE actions SET status='requested' WHERE id=? AND project=? AND session=? AND status='awaiting_confirmation'", (action_id, pid, sid)).rowcount
                if changed != 1: raise ValueError('This proposal has already been handled')
            else:
                self.store.db.execute('INSERT INTO actions VALUES (?,?,?,?,?,?,?)', (action_id, pid, sid, time.time(), f'{action}:{json.dumps(value)}', component_id, 'requested'))
            command_field = control['expected'].get('command_field', 'last_command_id')
            self.store.db.execute('INSERT INTO action_expectations(action_id,device,field,expected,deadline,command_field) VALUES (?,?,?,?,?,?)', (action_id, device, control['expected']['field'], json.dumps(value), time.time()+timeout, command_field))
            self.store.db.commit()
            try:
                info = self.client.publish(f'agentwin/{pid}/{device}/command', json.dumps({'schema_version': 1, 'project_id': pid, 'device_id': device, 'command_id': action_id, 'action': action, 'component_id': component_id, 'value': value}), qos=1, retain=False)
                if info.rc != mqtt.MQTT_ERR_SUCCESS: raise ValueError('Command could not be published')
            except Exception as error:
                self.store.execute("UPDATE actions SET status='failed' WHERE id=?", (action_id,))
                raise ValueError('Command could not be published') from error
            return {'id': action_id, 'status': 'requested', 'timeout_seconds': timeout}

    def confirm_control_proposal(self, pid, sid, action_id):
        with self.store.lock:
            _, details = pending_proposal(self.store, pid, sid, action_id)
            try:
                _, _, _, contract = control_contract(self.store, pid, sid, details['component_id'], details['action'], details['value'])
            except ValueError:
                self.store.execute("UPDATE actions SET status='invalidated' WHERE id=?", (action_id,))
                raise ValueError('Hardware configuration changed; ask Win for a new proposal') from None
            if contract != details['contract']:
                self.store.execute("UPDATE actions SET status='invalidated' WHERE id=?", (action_id,))
                raise ValueError('Hardware configuration changed; ask Win for a new proposal')
            return self.component_action(pid, sid, details['component_id'], details['action'], details['value'], proposal_id=action_id)

    def cancel_control_proposal(self, pid, sid, action_id):
        with self.store.lock:
            pending_proposal(self.store, pid, sid, action_id)
            self.store.execute("UPDATE actions SET status='cancelled' WHERE id=? AND status='awaiting_confirmation'", (action_id,))
        return {'id': action_id, 'status': 'cancelled'}

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
            for pid, sid, slot in self.store.due_summaries():
                task = self.summary_tasks.get(pid)
                if task is None or task.done():
                    self.summary_tasks[pid] = asyncio.create_task(self.generate_summary(pid, sid, slot))
            if smtp_configured() and (self.email_task is None or self.email_task.done()):
                self.email_task = asyncio.create_task(self.deliver_email())
            await asyncio.sleep(1)

    async def generate_summary(self, pid, sid, slot):
        try:
            facts = self.store.summary_facts(pid, sid)
            body, source = await scheduled_summary(facts)
            self.store.save_summary(pid, sid, slot, facts, body, source)
        except Exception:
            log.exception('Scheduled summary failed for project=%s', pid)

    async def deliver_email(self):
        for item in self.store.pending_email():
            try:
                await asyncio.to_thread(send_email, item)
                self.store.email_result(item['id'])
            except Exception as error:
                log.warning('Email delivery failed for project=%s ref=%s', item['project'], item['ref_id'])
                self.store.email_result(item['id'], error)

    async def close(self):
        background = [*self.tasks.values(), *self.summary_tasks.values(), *([self.email_task] if self.email_task else [])]
        for task in background: task.cancel()
        await asyncio.gather(*background, return_exceptions=True)
        if self.client: self.client.disconnect(); self.client.loop_stop()
