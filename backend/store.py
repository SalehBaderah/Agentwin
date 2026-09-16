import json
import sqlite3
import threading
import time
import uuid
from pathlib import Path
from .models import ProjectCreate, Telemetry
from .templates import definition, migrate_graph

def uid():
    return uuid.uuid4().hex

class Store:
    def __init__(self, path='data/agentwin.db'):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.lock = threading.RLock()
        self.db.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, config TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, project TEXT, mode TEXT, provenance TEXT, created REAL, scenario TEXT);
        CREATE TABLE IF NOT EXISTS readings(id INTEGER PRIMARY KEY, project TEXT, session TEXT, device TEXT, boot TEXT, seq INTEGER, uptime INTEGER, received REAL, payload TEXT, original TEXT, UNIQUE(session,device,boot,seq));
        CREATE INDEX IF NOT EXISTS reading_scope ON readings(project,session,id);
        CREATE TABLE IF NOT EXISTS boots(session TEXT, device TEXT, boot TEXT, retired INTEGER DEFAULT 0, PRIMARY KEY(session,device,boot));
        CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, project TEXT, session TEXT, kind TEXT, created REAL, recovered REAL, acknowledged REAL, evidence TEXT);
        CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY, project TEXT, session TEXT, created REAL, question TEXT, answer TEXT);
        CREATE TABLE IF NOT EXISTS actions(id TEXT PRIMARY KEY, project TEXT, session TEXT, created REAL, action TEXT, target TEXT, status TEXT);
        CREATE TABLE IF NOT EXISTS gateways(project TEXT PRIMARY KEY, received REAL, online INTEGER);
        ''')
        self.db.commit()

    def rows(self, sql, args=()):
        with self.lock:
            return [dict(r) for r in self.db.execute(sql, args).fetchall()]

    def execute(self, sql, args=()):
        with self.lock:
            result = self.db.execute(sql, args)
            self.db.commit()
            return result

    def project(self, pid):
        rows = self.rows('SELECT config FROM projects WHERE id=?', (pid,))
        if not rows:
            raise ValueError('Project not found')
        project = json.loads(rows[0]['config'])
        project['graph'], changed = migrate_graph(project['graph'], project.get('freshness_seconds', 8), project.get('template'))
        if changed:
            self.execute('UPDATE projects SET config=? WHERE id=?', (json.dumps(project), pid))
        return project

    def projects(self):
        return [self.project(r['id']) for r in self.rows('SELECT id FROM projects ORDER BY rowid')]

    def create_project(self, request: ProjectCreate, pid=None):
        pid = pid or 'project-' + uid()[:10]
        p = {'id': pid, **request.model_dump(), 'arabic_title': 'اتصال الأنظمة الذكية' if request.template == 'connectivity' else None,
             'description': "Monitor a connected device's availability alongside RF detector readings, and investigate changes using a project-specific AI agent." if request.template == 'connectivity' else 'A reusable sensor project with a dedicated operational view.',
             'calibration': None, 'agent': {'version': 1, 'mode': 'observe', 'allowed_actions': ['acknowledge_event']},
             'adc': {'resolution_bits': 12, 'reference_v': 5.0, 'reference': 'AR_DEFAULT (nominal; measure before calibration)'}, 'created': time.time()}
        if p['template'] == 'temperature':
            p['mapping'], p['high_limit'] = {'field': 'temperature_c', 'unit': '°C'}, request.high_limit
            p['description'] = 'Monitor a temperature sensor in its physical context using shared project services.'
        elif p['template'] == 'water':
            p['mapping'], p['high_limit'] = {'field': 'water_level_cm', 'unit': 'cm'}, request.high_limit
            p['description'] = 'Monitor a water level sensor associated with a tank or monitored area.'
        p['graph'] = definition(p['template'], p['mapping'], p['attenuator_inserted'], p['cable_description'])
        self.execute('INSERT INTO projects VALUES (?,?)', (pid, json.dumps(p)))
        self.create_session(pid, 'live')
        self.create_session(pid, 'simulated')
        return p

    def seed(self):
        if not self.rows('SELECT id FROM projects WHERE id=?', ('smart-connectivity',)):
            self.create_project(ProjectCreate(name='Smart Systems Connectivity', template='connectivity', device_id='uno-r4-01'), 'smart-connectivity')
        if not self.rows('SELECT id FROM projects WHERE id=?', ('sensor-lab',)):
            self.create_project(ProjectCreate(name='Sensor Lab', high_limit=30), 'sensor-lab')

    def create_session(self, pid, mode, recording=None):
        self.project(pid)
        provenance = {'origin': 'hardware' if mode == 'live' else 'synthetic'}
        if mode == 'replay':
            source = self.session(pid, recording)
            if source['mode'] == 'replay':
                raise ValueError('Choose an original live or simulated recording')
            provenance = {'origin': json.loads(source['provenance'])['origin'], 'recording_id': recording}
        sid = uid()
        self.execute('INSERT INTO sessions VALUES (?,?,?,?,?,?)', (sid, pid, mode, json.dumps(provenance), time.time(), 'stop'))
        return self.session(pid, sid)

    def session(self, pid, sid=None, mode=None):
        if sid:
            rows = self.rows('SELECT * FROM sessions WHERE project=? AND id=?', (pid, sid))
        else:
            rows = self.rows('SELECT * FROM sessions WHERE project=? AND mode=? ORDER BY created DESC LIMIT 1', (pid, mode or 'simulated'))
        if not rows:
            raise ValueError('Session not found in this project')
        return rows[0]

    def history(self, pid, sid, limit=180):
        self.session(pid, sid)
        rows = self.rows('SELECT * FROM readings WHERE project=? AND session=? ORDER BY id DESC LIMIT ?', (pid, sid, min(max(limit, 1), 180)))
        return [{**r, 'readings': json.loads(r.pop('payload')), 'original': json.loads(r['original']) if r['original'] else None} for r in reversed(rows)]

    def ingest(self, message, sid, retained=False, now=None, original=None):
        m = Telemetry.model_validate(message)
        p = self.project(m.project_id)
        s = self.session(m.project_id, sid)
        if m.device_id != p['device_id']:
            raise ValueError('Unregistered device/project mapping')
        if retained:
            return {'accepted': False, 'reason': 'retained'}
        fields = p['graph']['fields']
        if set(m.readings) - set(fields):
            raise ValueError('Unknown field; configure the template mapping')
        values = m.readings
        for key, value in values.items():
            if value is None:
                continue
            data_type = fields[key].get('data_type', 'number')
            if data_type == 'boolean' and type(value) is not bool:
                raise ValueError(f'{key} must be boolean')
            if data_type == 'number' and (type(value) not in (int, float)):
                raise ValueError(f'{key} must be numeric')
            if data_type == 'categorical' and type(value) is not str:
                raise ValueError(f'{key} must be categorical text')
        raw = values.get('rf_adc_raw')
        if raw is not None and (raw != int(raw) or not 0 <= raw < 2 ** p['adc']['resolution_bits']):
            raise ValueError('ADC count outside configured resolution')
        voltage = values.get('rf_detector_v')
        if voltage is not None and not 0 <= voltage <= p['adc']['reference_v']:
            raise ValueError('Voltage outside reference range')
        if values.get('wifi_rssi_dbm') is not None and not -150 <= values['wifi_rssi_dbm'] <= 0:
            raise ValueError('Invalid Wi-Fi RSSI')
        now = time.time() if now is None else now
        with self.lock:
            last = self.rows('SELECT * FROM readings WHERE session=? ORDER BY id DESC LIMIT 1', (sid,))
            retired = self.rows('SELECT retired FROM boots WHERE session=? AND device=? AND boot=?', (sid, m.device_id, m.boot_id))
            if retired and retired[0]['retired']:
                return {'accepted': False, 'reason': 'retired boot'}
            if last and last[0]['boot'] == m.boot_id and (m.sequence <= last[0]['seq'] or m.uptime_ms < last[0]['uptime']):
                return {'accepted': False, 'reason': 'duplicate or out of order'}
            # Unknown boot requires an early sample. No wall-clock claim from arbitrary uptime.
            if s['mode'] != 'replay' and (not last or last[0]['boot'] != m.boot_id) and m.uptime_ms > 30000:
                return {'accepted': False, 'reason': 'new boot requires reconnect/restart within 30 seconds'}
            if last and last[0]['boot'] == m.boot_id and s['mode'] != 'replay':
                first = self.rows('SELECT * FROM readings WHERE session=? AND boot=? ORDER BY id LIMIT 1', (sid, m.boot_id))[0]
                age = now - first['received'] - (m.uptime_ms - first['uptime']) / 1000
                if abs(age) > p['freshness_seconds']:
                    return {'accepted': False, 'reason': 'delayed or invalid uptime; restart producer'}
            if last and last[0]['boot'] != m.boot_id:
                self.db.execute('UPDATE boots SET retired=1 WHERE session=?', (sid,))
            self.db.execute('INSERT OR IGNORE INTO boots(session,device,boot) VALUES (?,?,?)', (sid, m.device_id, m.boot_id))
            try:
                cur = self.db.execute('INSERT INTO readings(project,session,device,boot,seq,uptime,received,payload,original) VALUES (?,?,?,?,?,?,?,?,?)', (m.project_id, sid, m.device_id, m.boot_id, m.sequence, m.uptime_ms, now, json.dumps(values), json.dumps(original) if original else None))
                self.db.commit()
            except sqlite3.IntegrityError:
                return {'accepted': False, 'reason': 'duplicate'}
            self.evaluate(m.project_id, sid, now)
            command_id = values.get('last_command_id')
            if command_id:
                self.db.execute("UPDATE actions SET status='completed' WHERE id=? AND project=? AND session=? AND status='requested'", (command_id, m.project_id, sid))
                self.db.commit()
            return {'accepted': True, 'id': cur.lastrowid}

    def evaluate(self, pid, sid, now=None):
        now = time.time() if now is None else now
        p = self.project(pid)
        h = self.history(pid, sid, 3)
        session = self.session(pid, sid)
        if session['mode'] == 'replay':
            return
        last = h[-1] if h else None
        baseline = last['received'] if last else session['created']
        stale = now - baseline > p['freshness_seconds']
        field = p['graph']['primary_field']
        limit = p['high_limit']
        numeric_rule = p['graph']['fields'][field].get('data_type', 'number') == 'number'
        consecutive = len(h) == 3 and len({r['boot'] for r in h}) == 1 and all(b['received'] - a['received'] <= p['freshness_seconds'] for a, b in zip(h, h[1:]))
        high = numeric_rule and consecutive and all(r['readings'].get(field) is not None and r['readings'][field] > limit for r in h)
        recovered_level = numeric_rule and consecutive and all(r['readings'].get(field) is not None and r['readings'][field] <= limit for r in h) and not stale
        for kind, active, recovered in [('missing_telemetry', stale, not stale and bool(last)), ('high_reading', high and not stale, recovered_level)]:
            open_rows = self.rows('SELECT * FROM events WHERE project=? AND session=? AND kind=? AND recovered IS NULL', (pid, sid, kind))
            if active and not open_rows:
                recent = self.rows('SELECT recovered FROM events WHERE project=? AND session=? AND kind=? ORDER BY created DESC LIMIT 1', (pid, sid, kind))
                if recent and recent[0]['recovered'] and now - recent[0]['recovered'] < 10:
                    continue
                evidence = {'rule': f'No telemetry for > {p["freshness_seconds"]} seconds' if kind == 'missing_telemetry' else f'{field} > {limit} {p["graph"]["fields"][field]["unit"]} for 3 consecutive samples', 'readings': h, 'observed_at': now, 'source_mode': session['mode'], 'cause': 'Unknown; this observation does not establish interference or jamming.'}
                self.db.execute('INSERT INTO events VALUES (?,?,?,?,?,?,?,?)', (uid(), pid, sid, kind, now, None, None, json.dumps(evidence)))
            elif recovered and open_rows:
                self.db.execute('UPDATE events SET recovered=? WHERE project=? AND session=? AND kind=? AND recovered IS NULL', (now, pid, sid, kind))
        self.db.commit()

    def events(self, pid, sid):
        self.session(pid, sid)
        return [{**r, 'severity': 'warning', 'evidence': json.loads(r['evidence'])} for r in self.rows('SELECT * FROM events WHERE project=? AND session=? ORDER BY created DESC LIMIT 100', (pid, sid))]

    def state(self, pid, sid=None):
        p = self.project(pid)
        s = self.session(pid, sid, mode='live' if sid is None else None)
        h = self.history(pid, s['id'])
        last = h[-1] if h else None
        stale = not last or time.time() - last['received'] > p['freshness_seconds']
        gateway = self.rows('SELECT * FROM gateways WHERE project=?', (pid,))
        gateway_status = 'unknown' if not gateway else ('online' if gateway[0]['online'] and time.time() - gateway[0]['received'] < 10 else 'disconnected')
        return {'project': p, 'session': {**s, 'provenance': json.loads(s['provenance'])}, 'sessions': self.rows('SELECT * FROM sessions WHERE project=? ORDER BY created DESC', (pid,)), 'latest': last, 'readings': h, 'events': self.events(pid, s['id']), 'actions': self.rows('SELECT * FROM actions WHERE project=? AND session=? ORDER BY created DESC LIMIT 50', (pid, s['id'])), 'status': 'recording' if s['mode'] == 'replay' else ('awaiting data' if not last else 'stale' if stale else 'reporting'), 'gateway_status': gateway_status, 'estimated_rf_dbm': None, 'agent_config': p['agent']}

    def acknowledge(self, pid, sid, eid):
        rows = self.rows('SELECT * FROM events WHERE id=? AND project=? AND session=?', (eid, pid, sid))
        if not rows:
            raise ValueError('Event not found in this scope')
        if not rows[0]['acknowledged']:
            with self.lock:
                self.db.execute('UPDATE events SET acknowledged=? WHERE id=?', (time.time(), eid))
                self.db.execute('INSERT INTO actions VALUES (?,?,?,?,?,?,?)', (uid(), pid, sid, time.time(), 'acknowledge_event', eid, 'completed'))
                self.db.commit()
        return {'status': 'acknowledged', 'resolved': bool(rows[0]['recovered'])}
