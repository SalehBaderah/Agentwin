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
        p = {'id': pid, **request.model_dump(), 'name': 'UNO R4 LED', 'template': 'led',
             'arabic_title': None, 'description': 'Live control and hardware-confirmed state for the external D7 LED.',
             'calibration': None, 'agent': {'version': 1, 'mode': 'observe', 'allowed_actions': ['acknowledge_event']},
             'created': time.time()}
        p['graph'] = definition(p['template'], p['mapping'], p['attenuator_inserted'], p['cable_description'])
        self.execute('INSERT INTO projects VALUES (?,?)', (pid, json.dumps(p)))
        self.create_session(pid, 'live')
        return p

    def seed(self):
        row = self.rows('SELECT config FROM projects WHERE id=?', ('smart-connectivity',))
        if not row:
            self.create_project(ProjectCreate(name='UNO R4 LED', template='led', device_id='uno-r4-01'), 'smart-connectivity')
        else:
            project = json.loads(row[0]['config'])
            replacing_old_graph = project.get('graph', {}).get('schema_version') != 4
            project.update({'name': 'UNO R4 LED', 'template': 'led', 'device_id': 'uno-r4-01', 'connector': 'usb',
                            'arabic_title': None, 'description': 'Live control and hardware-confirmed state for the external D7 LED.',
                            'graph': definition()})
            self.execute('UPDATE projects SET config=? WHERE id=?', (json.dumps(project), 'smart-connectivity'))
            if replacing_old_graph:
                for table in ('readings', 'boots', 'events', 'actions', 'conversations', 'gateways'):
                    self.execute(f'DELETE FROM {table} WHERE project=?' if table != 'boots' else
                                 "DELETE FROM boots WHERE session IN (SELECT id FROM sessions WHERE project=?)", ('smart-connectivity',))
        self.execute("DELETE FROM projects WHERE id!='smart-connectivity'")
        self.execute("DELETE FROM sessions WHERE project!='smart-connectivity' OR mode!='live'")
        if not self.rows("SELECT id FROM sessions WHERE project='smart-connectivity' AND mode='live'"):
            self.create_session('smart-connectivity', 'live')

    def create_session(self, pid, mode, recording=None):
        self.project(pid)
        if mode != 'live':
            raise ValueError('Only the live hardware session is available')
        provenance = {'origin': 'hardware'}
        sid = uid()
        self.execute('INSERT INTO sessions VALUES (?,?,?,?,?,?)', (sid, pid, mode, json.dumps(provenance), time.time(), 'stop'))
        return self.session(pid, sid)

    def session(self, pid, sid=None, mode=None):
        if sid:
            rows = self.rows('SELECT * FROM sessions WHERE project=? AND id=?', (pid, sid))
        else:
            rows = self.rows('SELECT * FROM sessions WHERE project=? AND mode=? ORDER BY created DESC LIMIT 1', (pid, mode or 'live'))
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
        now = time.time() if now is None else now
        with self.lock:
            last = self.rows('SELECT * FROM readings WHERE session=? ORDER BY id DESC LIMIT 1', (sid,))
            retired = self.rows('SELECT retired FROM boots WHERE session=? AND device=? AND boot=?', (sid, m.device_id, m.boot_id))
            if retired and retired[0]['retired']:
                return {'accepted': False, 'reason': 'retired boot'}
            if last and last[0]['boot'] == m.boot_id and (m.sequence <= last[0]['seq'] or m.uptime_ms < last[0]['uptime']):
                return {'accepted': False, 'reason': 'duplicate or out of order'}
            # Unknown boot requires an early sample. No wall-clock claim from arbitrary uptime.
            if (not last or last[0]['boot'] != m.boot_id) and m.uptime_ms > 30000:
                return {'accepted': False, 'reason': 'new boot requires reconnect/restart within 30 seconds'}
            if last and last[0]['boot'] == m.boot_id:
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
            led_on = values.get('led_on')
            if command_id and type(led_on) is bool:
                expected_action = f'set_led:{str(led_on).lower()}'
                self.db.execute(
                    "UPDATE actions SET status='completed' WHERE id=? AND project=? AND session=? AND target='led' AND action=? AND status='requested'",
                    (command_id, m.project_id, sid, expected_action),
                )
                self.db.commit()
            return {'accepted': True, 'id': cur.lastrowid}

    def evaluate(self, pid, sid, now=None):
        now = time.time() if now is None else now
        p = self.project(pid)
        h = self.history(pid, sid, 3)
        session = self.session(pid, sid)
        last = h[-1] if h else None
        baseline = last['received'] if last else session['created']
        stale = now - baseline > p['freshness_seconds']
        for kind, active, recovered in [('missing_telemetry', stale, not stale and bool(last))]:
            open_rows = self.rows('SELECT * FROM events WHERE project=? AND session=? AND kind=? AND recovered IS NULL', (pid, sid, kind))
            if active and not open_rows:
                recent = self.rows('SELECT recovered FROM events WHERE project=? AND session=? AND kind=? ORDER BY created DESC LIMIT 1', (pid, sid, kind))
                if recent and recent[0]['recovered'] and now - recent[0]['recovered'] < 10:
                    continue
                evidence = {'rule': f'No telemetry for > {p["freshness_seconds"]} seconds', 'readings': h, 'observed_at': now, 'source_mode': session['mode'], 'cause': 'The live LED board stopped reporting; inspect USB, gateway, and board power.'}
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
        return {'project': p, 'session': {**s, 'provenance': json.loads(s['provenance'])}, 'sessions': [s], 'latest': last, 'readings': h, 'events': self.events(pid, s['id']), 'actions': self.rows('SELECT * FROM actions WHERE project=? AND session=? ORDER BY created DESC LIMIT 50', (pid, s['id'])), 'status': 'awaiting data' if not last else 'stale' if stale else 'reporting', 'gateway_status': gateway_status, 'agent_config': p['agent']}

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
