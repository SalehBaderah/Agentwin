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
        CREATE TABLE IF NOT EXISTS gateways(project TEXT, device TEXT, received REAL, online INTEGER, PRIMARY KEY(project,device));
        CREATE TABLE IF NOT EXISTS device_sessions(project TEXT, session TEXT, device TEXT, current_boot TEXT, updated REAL, PRIMARY KEY(project,session,device));''')
        columns = {row['name'] for row in self.rows('PRAGMA table_info(action_expectations)')}
        if 'command_field' not in columns:
            self.db.execute("ALTER TABLE action_expectations ADD COLUMN command_field TEXT NOT NULL DEFAULT 'last_command_id'")
        session_columns = {row['name'] for row in self.rows('PRAGMA table_info(device_sessions)')}
        if 'session' not in session_columns:
            self.db.execute('ALTER TABLE device_sessions RENAME TO device_sessions_legacy')
            self.db.execute('CREATE TABLE device_sessions(project TEXT, session TEXT, device TEXT, current_boot TEXT, updated REAL, PRIMARY KEY(project,session,device))')
            self.db.execute("INSERT OR IGNORE INTO device_sessions SELECT d.project, s.id, d.device, d.current_boot, d.updated FROM device_sessions_legacy d JOIN sessions s ON s.project=d.project AND s.mode='live'")
            self.db.execute('DROP TABLE device_sessions_legacy')
        gateway_columns = {row['name'] for row in self.rows('PRAGMA table_info(gateways)')}
        if 'device' not in gateway_columns:
            self.db.execute('ALTER TABLE gateways RENAME TO gateways_legacy')
            self.db.execute('CREATE TABLE gateways(project TEXT, device TEXT, received REAL, online INTEGER, PRIMARY KEY(project,device))')
            for row in self.db.execute('SELECT project,received,online FROM gateways_legacy').fetchall():
                project_row = self.db.execute('SELECT config FROM projects WHERE id=?', (row['project'],)).fetchone()
                if project_row:
                    primary_device = json.loads(project_row['config']).get('device_id')
                    if primary_device: self.db.execute('INSERT OR REPLACE INTO gateways VALUES (?,?,?,?)', (row['project'], primary_device, row['received'], row['online']))
            self.db.execute('DROP TABLE gateways_legacy')
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
        if 'retention_days' not in project: project['retention_days'] = 30; config_changed = True
        if 'components' not in project: project['components'] = []; config_changed = True
        project['graph'], changed = migrate_graph(project['graph'], project.get('freshness_seconds', 8), project.get('template'), project['device_id'], project.get('connector', 'usb'), project.get('mapping'), project.get('devices'), project.get('components') or None)
        if changed or config_changed: self.execute('UPDATE projects SET config=? WHERE id=?', (json.dumps(project), pid))
        return project
    def projects(self): return [self.project(row['id']) for row in self.rows('SELECT id FROM projects ORDER BY rowid')]

    def create_project(self, request: ProjectCreate, pid=None):
        pid = pid or f'project-{uid()[:10]}'
        configured_devices = [{'id': request.device_id, 'connector': request.connector, 'serial_port': request.serial_port, 'baud_rate': 115200}, *[{'id': item.device_id, 'connector': item.connector, 'serial_port': item.serial_port, 'baud_rate': item.baud_rate} for item in request.devices]]
        configured_components = [item.model_dump() for item in request.components]
        project = {'id': pid, **request.model_dump(exclude={'devices', 'components'}), 'description': f'{request.template.replace("_", " ").title()} project with independent telemetry, events, controls, and agent context.', 'arabic_title': None, 'created': time.time(), 'agent': {'version': 1, 'mode': 'observe', 'allowed_actions': ['acknowledge_event']}, 'devices': configured_devices, 'components': configured_components}
        project['graph'] = definition(request.template, request.mapping.model_dump(), cable=request.cable_description, device_id=request.device_id, connector=request.connector, devices=configured_devices, components=configured_components or None, freshness_seconds=request.freshness_seconds)
        self.execute('INSERT INTO projects VALUES (?,?)', (pid, json.dumps(project)))
        self.create_session(pid, 'live'); self.create_session(pid, 'simulated')
        return project

    def register_device(self, pid, request: DeviceCreate):
        project = self.project(pid)
        if any(device['id'] == request.device_id for device in project['devices']):
            raise ValueError('Device is already registered to this project')
        project['devices'].append({'id': request.device_id, 'connector': request.connector, 'serial_port': request.serial_port, 'baud_rate': request.baud_rate})
        project['graph'] = definition(project['template'], project['mapping'], cable=project['cable_description'], device_id=project['device_id'], connector=project['connector'], devices=project['devices'], components=project.get('components') or None, freshness_seconds=project['freshness_seconds'])
        self.execute('UPDATE projects SET config=? WHERE id=?', (json.dumps(project), pid))
        return project

    def delete_project(self, pid):
        self.project(pid)
        with self.lock:
            self.db.execute('DELETE FROM action_expectations WHERE action_id IN (SELECT id FROM actions WHERE project=?)', (pid,))
            self.db.execute('DELETE FROM boots WHERE session IN (SELECT id FROM sessions WHERE project=?)', (pid,))
            for table in ('readings', 'events', 'conversations', 'actions', 'sessions', 'gateways', 'device_sessions'):
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
        unexpected = set(values) - set(fields)
        if unexpected: raise ValueError(f"Unexpected fields for device {telemetry.device_id}: {', '.join(sorted(unexpected))}")
        for key, value in values.items():
            if fields[key].get('device_id') not in (None, telemetry.device_id): raise ValueError(f'{key} belongs to another registered device')
            if value is None: continue
            kind = fields[key].get('data_type', 'number')
            if kind == 'boolean' and type(value) is not bool: raise ValueError(f'{key} must be boolean')
            if kind == 'number' and type(value) not in (int, float): raise ValueError(f'{key} must be numeric')
            if kind == 'categorical' and type(value) is not str: raise ValueError(f'{key} must be categorical text')
        now = time.time() if now is None else now
        with self.lock:
            active = self.rows('SELECT current_boot FROM device_sessions WHERE project=? AND session=? AND device=?', (telemetry.project_id, sid, telemetry.device_id))
            if active and active[0]['current_boot'] != telemetry.boot_id:
                known = self.rows('SELECT retired FROM boots WHERE session=? AND device=? AND boot=?', (sid, telemetry.device_id, telemetry.boot_id))
                if known and known[0]['retired']: return {'accepted': False, 'reason': 'retired device session'}
                if not telemetry.session_registration: return {'accepted': False, 'reason': 'new device session requires registration'}
                self.db.execute('UPDATE boots SET retired=1 WHERE session=? AND device=?', (sid, telemetry.device_id))
            elif not active and not telemetry.session_registration:
                return {'accepted': False, 'reason': 'device session requires registration'}
            self.db.execute('INSERT OR REPLACE INTO device_sessions VALUES (?,?,?,?,?)', (telemetry.project_id, sid, telemetry.device_id, telemetry.boot_id, now))
            last = self.rows('SELECT * FROM readings WHERE session=? AND device=? ORDER BY id DESC LIMIT 1', (sid, telemetry.device_id))
            if last and last[0]['boot'] == telemetry.boot_id and (telemetry.sequence <= last[0]['seq'] or telemetry.uptime_ms < last[0]['uptime']): return {'accepted': False, 'reason': 'duplicate or out of order'}
            if last and last[0]['boot'] != telemetry.boot_id: self.db.execute('UPDATE boots SET retired=1 WHERE session=? AND device=?', (sid, telemetry.device_id))
            self.db.execute('INSERT OR IGNORE INTO boots(session,device,boot) VALUES (?,?,?)', (sid, telemetry.device_id, telemetry.boot_id))
            try: cur = self.db.execute('INSERT INTO readings(project,session,device,boot,seq,uptime,received,payload,original) VALUES (?,?,?,?,?,?,?,?,?)', (telemetry.project_id, sid, telemetry.device_id, telemetry.boot_id, telemetry.sequence, telemetry.uptime_ms, now, json.dumps(values), json.dumps(original) if original else None)); self.db.commit()
            except sqlite3.IntegrityError: return {'accepted': False, 'reason': 'duplicate'}
            self._verify_actions(telemetry.project_id, sid, telemetry.device_id, values, now); self.evaluate(telemetry.project_id, sid, now)
            return {'accepted': True, 'id': cur.lastrowid}

    def _verify_actions(self, pid, sid, device, values, now):
        rows = self.rows("SELECT e.* FROM action_expectations e JOIN actions a ON a.id=e.action_id WHERE a.project=? AND a.session=? AND a.status='requested' AND e.device=?", (pid, sid, device))
        for row in rows:
            if now > row['deadline'] or values.get(row['command_field']) != row['action_id']: continue
            if values.get(row['field']) == json.loads(row['expected']):
                self.db.execute("UPDATE actions SET status='completed' WHERE id=? AND project=? AND session=? AND status='requested'", (row['action_id'], pid, sid))
        self.db.commit()

    def evaluate(self, pid, sid, now=None):
        now = time.time() if now is None else now; project = self.project(pid); session = self.session(pid, sid); readings = self.history(pid, sid, 3); last = readings[-1] if readings else None
        # Before the first accepted sample the source is awaiting data, not in an
        # outage. Missing-telemetry events describe an interruption after a
        # device has established that it can report in this session.
        stale = bool(last) and now - last['received'] > project['freshness_seconds']
        open_rows = self.rows("SELECT * FROM events WHERE project=? AND session=? AND kind='missing_telemetry' AND recovered IS NULL", (pid, sid))
        if stale and not open_rows:
            evidence = {'rule': f"No telemetry for > {project['freshness_seconds']} seconds", 'readings': readings, 'observed_at': now, 'source_mode': session['mode'], 'cause': 'Device data is unavailable; inspect its configured connector.'}
            self.db.execute('INSERT INTO events VALUES (?,?,?,?,?,?,?,?)', (uid(), pid, sid, 'missing_telemetry', now, None, None, json.dumps(evidence)))
        elif not stale and open_rows: self.db.execute("UPDATE events SET recovered=? WHERE project=? AND session=? AND kind='missing_telemetry' AND recovered IS NULL", (now, pid, sid))
        self.db.execute("UPDATE actions SET status='timed_out' WHERE status='requested' AND id IN (SELECT action_id FROM action_expectations WHERE deadline<?)", (now,)); self.db.commit()
        cutoff = now - project.get('retention_days', 30) * 86400
        self.db.execute('DELETE FROM readings WHERE id IN (SELECT id FROM readings WHERE project=? AND received<? ORDER BY id LIMIT 200)', (pid, cutoff)); self.db.commit()

    def events(self, pid, sid): return [{**row, 'severity': 'warning', 'evidence': json.loads(row['evidence'])} for row in self.rows('SELECT * FROM events WHERE project=? AND session=? ORDER BY created DESC LIMIT 100', (pid, sid))]
    def state(self, pid, sid=None):
        project = self.project(pid); active = self.session(pid, sid, mode='live' if sid is None else None); readings = self.history(pid, active['id']); latest = readings[-1] if readings else None
        gateways = self.rows('SELECT * FROM gateways WHERE project=?', (pid,)); online = {row['device'] for row in gateways if row['online'] and time.time() - row['received'] < 10}
        devices = [{'id': device['id'], 'connector': device['connector'], 'online': device['id'] in online, 'reporting': any(row['device'] == device['id'] and time.time()-row['received'] <= project['freshness_seconds'] for row in readings[-20:])} for device in project['devices']]
        field_status = {}
        for key, field in project['graph']['fields'].items():
            observed = next((row for row in reversed(readings) if key in row['readings']), None); limit = field.get('freshness_seconds') or project['freshness_seconds']
            field_status[key] = {'received': observed['received'] if observed else None, 'fresh': bool(observed and time.time()-observed['received'] <= limit), 'device_id': field.get('device_id')}
        return {'project': project, 'session': {**active, 'provenance': json.loads(active['provenance'])}, 'sessions': self.rows('SELECT * FROM sessions WHERE project=? ORDER BY created DESC', (pid,)), 'latest': latest, 'readings': readings, 'events': self.events(pid, active['id']), 'actions': self.rows('SELECT * FROM actions WHERE project=? AND session=? ORDER BY created DESC LIMIT 100', (pid, active['id'])), 'devices': devices, 'field_status': field_status, 'status': 'awaiting data' if not latest else 'stale' if not any(item['fresh'] for item in field_status.values()) else 'reporting', 'gateway_status': 'online' if online else 'unknown', 'agent_config': project['agent']}
    def acknowledge(self, pid, sid, eid):
        rows = self.rows('SELECT * FROM events WHERE id=? AND project=? AND session=?', (eid, pid, sid))
        if not rows: raise ValueError('Event not found in this scope')
        if not rows[0]['acknowledged']: self.execute('UPDATE events SET acknowledged=? WHERE id=?', (time.time(), eid)); self.execute('INSERT INTO actions VALUES (?,?,?,?,?,?,?)', (uid(), pid, sid, time.time(), 'acknowledge_event', eid, 'completed'))
        return {'status': 'acknowledged', 'resolved': bool(rows[0]['recovered'])}
