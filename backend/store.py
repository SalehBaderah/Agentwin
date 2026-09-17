import json, sqlite3, threading, time, uuid
from pathlib import Path
from .models import DeviceCreate, ProjectCreate, Telemetry
from .templates import definition, migrate_graph

def uid(): return uuid.uuid4().hex

class Store:
    def __init__(self, path='data/agentwin.db'):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path, check_same_thread=False); self.db.row_factory = sqlite3.Row; self.lock = threading.RLock()
        self.db.executescript('''PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, config TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, project TEXT, mode TEXT, provenance TEXT, created REAL, scenario TEXT);
        CREATE TABLE IF NOT EXISTS readings(id INTEGER PRIMARY KEY, project TEXT, session TEXT, device TEXT, boot TEXT, seq INTEGER, uptime INTEGER, received REAL, payload TEXT, original TEXT, UNIQUE(session,device,boot,seq));
        CREATE INDEX IF NOT EXISTS reading_scope ON readings(project,session,id);
        CREATE TABLE IF NOT EXISTS boots(session TEXT, device TEXT, boot TEXT, retired INTEGER DEFAULT 0, PRIMARY KEY(session,device,boot));
        CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, project TEXT, session TEXT, kind TEXT, created REAL, recovered REAL, acknowledged REAL, evidence TEXT);
        CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY, project TEXT, session TEXT, created REAL, question TEXT, answer TEXT);
        CREATE TABLE IF NOT EXISTS actions(id TEXT PRIMARY KEY, project TEXT, session TEXT, created REAL, action TEXT, target TEXT, status TEXT);
        CREATE TABLE IF NOT EXISTS action_expectations(action_id TEXT PRIMARY KEY, device TEXT, field TEXT, expected TEXT, deadline REAL);
        CREATE TABLE IF NOT EXISTS gateways(project TEXT, device TEXT, received REAL, online INTEGER, PRIMARY KEY(project,device));''')
        self.db.commit()

    def rows(self, sql, args=()):
        with self.lock: return [dict(row) for row in self.db.execute(sql, args).fetchall()]
    def execute(self, sql, args=()):
        with self.lock:
            value = self.db.execute(sql, args); self.db.commit(); return value

    def project(self, pid):
        rows = self.rows('SELECT config FROM projects WHERE id=?', (pid,))
        if not rows: raise ValueError('Project not found')
        project = json.loads(rows[0]['config'])
        config_changed = False
        if 'devices' not in project:
            serial_port = project.get('serial_port')
            project['devices'] = [{'id': project['device_id'], 'connector': project.get('connector', 'usb'), 'serial_port': serial_port}]
            config_changed = True
        project['graph'], changed = migrate_graph(project['graph'], project.get('freshness_seconds', 8), project.get('template'), project['device_id'], project.get('connector', 'usb'), project.get('mapping'))
        if changed or config_changed: self.execute('UPDATE projects SET config=? WHERE id=?', (json.dumps(project), pid))
        return project
    def projects(self): return [self.project(row['id']) for row in self.rows('SELECT id FROM projects ORDER BY rowid')]

    def create_project(self, request: ProjectCreate, pid=None):
        pid = pid or f'project-{uid()[:10]}'
        project = {'id': pid, **request.model_dump(), 'description': f'{request.template.replace("_", " ").title()} project with independent telemetry, events, controls, and agent context.', 'arabic_title': None, 'created': time.time(), 'agent': {'version': 1, 'mode': 'observe', 'allowed_actions': ['acknowledge_event']}, 'devices': [{'id': request.device_id, 'connector': request.connector, 'serial_port': request.serial_port}]}
        project['graph'] = definition(request.template, request.mapping.model_dump(), cable=request.cable_description, device_id=request.device_id, connector=request.connector)
        self.execute('INSERT INTO projects VALUES (?,?)', (pid, json.dumps(project)))
        self.create_session(pid, 'live'); self.create_session(pid, 'simulated')
        return project

    def register_device(self, pid, request: DeviceCreate):
        project = self.project(pid)
        if any(device['id'] == request.device_id for device in project['devices']):
            raise ValueError('Device is already registered to this project')
        project['devices'].append({'id': request.device_id, 'connector': request.connector, 'serial_port': request.serial_port})
        self.execute('UPDATE projects SET config=? WHERE id=?', (json.dumps(project), pid))
        return project

    def delete_project(self, pid):
        self.project(pid)
        with self.lock:
            self.db.execute('DELETE FROM action_expectations WHERE action_id IN (SELECT id FROM actions WHERE project=?)', (pid,))
            self.db.execute('DELETE FROM boots WHERE session IN (SELECT id FROM sessions WHERE project=?)', (pid,))
            for table in ('readings', 'events', 'conversations', 'actions', 'sessions', 'gateways'):
                self.db.execute(f'DELETE FROM {table} WHERE project=?', (pid,))
            self.db.execute('DELETE FROM projects WHERE id=?', (pid,))
            self.db.commit()

    def create_session(self, pid, mode, recording=None):
        self.project(pid)
        if mode not in ('live', 'simulated'): raise ValueError('Unsupported session mode')
        provenance = {'origin': 'hardware' if mode == 'live' else 'synthetic'}
        sid = uid(); self.execute('INSERT INTO sessions VALUES (?,?,?,?,?,?)', (sid, pid, mode, json.dumps(provenance), time.time(), 'stop'))
        return self.session(pid, sid)
    def session(self, pid, sid=None, mode=None):
        rows = self.rows('SELECT * FROM sessions WHERE project=? AND id=?', (pid, sid)) if sid else self.rows('SELECT * FROM sessions WHERE project=? AND mode=? ORDER BY created DESC LIMIT 1', (pid, mode or 'live'))
        if not rows: raise ValueError('Session not found in this project')
        return rows[0]
    def history(self, pid, sid, limit=180):
        self.session(pid, sid); rows = self.rows('SELECT * FROM readings WHERE project=? AND session=? ORDER BY id DESC LIMIT ?', (pid, sid, min(max(limit, 1), 180)))
        return [{**row, 'readings': json.loads(row.pop('payload')), 'original': json.loads(row['original']) if row['original'] else None} for row in reversed(rows)]

    def ingest(self, message, sid, retained=False, now=None, original=None):
        telemetry = Telemetry.model_validate(message); project = self.project(telemetry.project_id); session = self.session(telemetry.project_id, sid)
        if telemetry.device_id not in {device['id'] for device in project['devices']}: raise ValueError('Unregistered device/project mapping')
        if retained: return {'accepted': False, 'reason': 'retained'}
        fields, values = project['graph']['fields'], telemetry.readings
        if set(values) - set(fields): raise ValueError('Unknown field; configure this project mapping')
        for key, value in values.items():
            if value is None: continue
            kind = fields[key].get('data_type', 'number')
            if kind == 'boolean' and type(value) is not bool: raise ValueError(f'{key} must be boolean')
            if kind == 'number' and type(value) not in (int, float): raise ValueError(f'{key} must be numeric')
            if kind == 'categorical' and type(value) is not str: raise ValueError(f'{key} must be categorical text')
        now = time.time() if now is None else now
        with self.lock:
            last = self.rows('SELECT * FROM readings WHERE session=? AND device=? ORDER BY id DESC LIMIT 1', (sid, telemetry.device_id))
            if last and last[0]['boot'] == telemetry.boot_id and (telemetry.sequence <= last[0]['seq'] or telemetry.uptime_ms < last[0]['uptime']): return {'accepted': False, 'reason': 'duplicate or out of order'}
            if (not last or last[0]['boot'] != telemetry.boot_id) and telemetry.uptime_ms > 30000: return {'accepted': False, 'reason': 'new boot requires reconnect/restart within 30 seconds'}
            if last and last[0]['boot'] != telemetry.boot_id: self.db.execute('UPDATE boots SET retired=1 WHERE session=? AND device=?', (sid, telemetry.device_id))
            self.db.execute('INSERT OR IGNORE INTO boots(session,device,boot) VALUES (?,?,?)', (sid, telemetry.device_id, telemetry.boot_id))
            try: cur = self.db.execute('INSERT INTO readings(project,session,device,boot,seq,uptime,received,payload,original) VALUES (?,?,?,?,?,?,?,?,?)', (telemetry.project_id, sid, telemetry.device_id, telemetry.boot_id, telemetry.sequence, telemetry.uptime_ms, now, json.dumps(values), json.dumps(original) if original else None)); self.db.commit()
            except sqlite3.IntegrityError: return {'accepted': False, 'reason': 'duplicate'}
            self._verify_actions(telemetry.project_id, sid, telemetry.device_id, values, now); self.evaluate(telemetry.project_id, sid, now)
            return {'accepted': True, 'id': cur.lastrowid}

    def _verify_actions(self, pid, sid, device, values, now):
        command_id = values.get('last_command_id')
        if not command_id: return
        rows = self.rows('SELECT * FROM action_expectations WHERE action_id=? AND device=?', (command_id, device))
        if not rows or now > rows[0]['deadline']: return
        expected = json.loads(rows[0]['expected'])
        if values.get(rows[0]['field']) == expected:
            self.db.execute("UPDATE actions SET status='completed' WHERE id=? AND project=? AND session=? AND status='requested'", (command_id, pid, sid)); self.db.commit()

    def evaluate(self, pid, sid, now=None):
        now = time.time() if now is None else now; project = self.project(pid); session = self.session(pid, sid); readings = self.history(pid, sid, 3); last = readings[-1] if readings else None
        stale = now - (last['received'] if last else session['created']) > project['freshness_seconds']
        open_rows = self.rows("SELECT * FROM events WHERE project=? AND session=? AND kind='missing_telemetry' AND recovered IS NULL", (pid, sid))
        if stale and not open_rows:
            evidence = {'rule': f"No telemetry for > {project['freshness_seconds']} seconds", 'readings': readings, 'observed_at': now, 'source_mode': session['mode'], 'cause': 'Device data is unavailable; inspect its configured connector.'}
            self.db.execute('INSERT INTO events VALUES (?,?,?,?,?,?,?,?)', (uid(), pid, sid, 'missing_telemetry', now, None, None, json.dumps(evidence)))
        elif not stale and open_rows: self.db.execute("UPDATE events SET recovered=? WHERE project=? AND session=? AND kind='missing_telemetry' AND recovered IS NULL", (now, pid, sid))
        self.db.execute("UPDATE actions SET status='timed_out' WHERE status='requested' AND id IN (SELECT action_id FROM action_expectations WHERE deadline<?)", (now,)); self.db.commit()

    def events(self, pid, sid): return [{**row, 'severity': 'warning', 'evidence': json.loads(row['evidence'])} for row in self.rows('SELECT * FROM events WHERE project=? AND session=? ORDER BY created DESC LIMIT 100', (pid, sid))]
    def state(self, pid, sid=None):
        project = self.project(pid); active = self.session(pid, sid, mode='live' if sid is None else None); readings = self.history(pid, active['id']); latest = readings[-1] if readings else None
        gateways = self.rows('SELECT * FROM gateways WHERE project=?', (pid,)); online = {row['device'] for row in gateways if row['online'] and time.time() - row['received'] < 10}
        devices = [{'id': device['id'], 'connector': device['connector'], 'online': device['id'] in online, 'reporting': bool(latest and latest['device'] == device['id'] and time.time()-latest['received'] <= project['freshness_seconds'])} for device in project['devices']]
        return {'project': project, 'session': {**active, 'provenance': json.loads(active['provenance'])}, 'sessions': self.rows('SELECT * FROM sessions WHERE project=? ORDER BY created DESC', (pid,)), 'latest': latest, 'readings': readings, 'events': self.events(pid, active['id']), 'actions': self.rows('SELECT * FROM actions WHERE project=? AND session=? ORDER BY created DESC LIMIT 100', (pid, active['id'])), 'devices': devices, 'status': 'awaiting data' if not latest else 'stale' if time.time()-latest['received'] > project['freshness_seconds'] else 'reporting', 'gateway_status': 'online' if online else 'unknown', 'agent_config': project['agent']}
    def acknowledge(self, pid, sid, eid):
        rows = self.rows('SELECT * FROM events WHERE id=? AND project=? AND session=?', (eid, pid, sid))
        if not rows: raise ValueError('Event not found in this scope')
        if not rows[0]['acknowledged']: self.execute('UPDATE events SET acknowledged=? WHERE id=?', (time.time(), eid)); self.execute('INSERT INTO actions VALUES (?,?,?,?,?,?,?)', (uid(), pid, sid, time.time(), 'acknowledge_event', eid, 'completed'))
        return {'status': 'acknowledged', 'resolved': bool(rows[0]['recovered'])}
