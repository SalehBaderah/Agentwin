import json, os, sqlite3, threading, time, uuid
from pathlib import Path
from .models import DeviceCreate, MonitoringSettings, ProjectCreate, Settings, Telemetry
from .notifications import last_telemetry_label, smtp_configured
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
        CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, project TEXT, session TEXT, kind TEXT, created REAL, recovered REAL, acknowledged REAL, evidence TEXT, subject TEXT NOT NULL DEFAULT '', severity TEXT NOT NULL DEFAULT 'warning');
        CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY, project TEXT, session TEXT, created REAL, question TEXT, answer TEXT);
        CREATE TABLE IF NOT EXISTS actions(id TEXT PRIMARY KEY, project TEXT, session TEXT, created REAL, action TEXT, target TEXT, status TEXT);
        CREATE TABLE IF NOT EXISTS action_proposals(action_id TEXT PRIMARY KEY, details TEXT NOT NULL, expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS summaries(id TEXT PRIMARY KEY, project TEXT NOT NULL, session TEXT NOT NULL, slot REAL NOT NULL, period_start REAL NOT NULL, period_end REAL NOT NULL, created REAL NOT NULL, body TEXT NOT NULL, source TEXT NOT NULL, UNIQUE(project,session,slot));
        CREATE TABLE IF NOT EXISTS summary_schedule(project TEXT PRIMARY KEY, next_due REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS email_outbox(id TEXT PRIMARY KEY, project TEXT NOT NULL, ref_kind TEXT NOT NULL, ref_id TEXT NOT NULL, recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt REAL NOT NULL, sent REAL, last_error TEXT, UNIQUE(ref_kind,ref_id));
        CREATE TABLE IF NOT EXISTS action_expectations(action_id TEXT PRIMARY KEY, device TEXT, field TEXT, expected TEXT, deadline REAL);
        CREATE TABLE IF NOT EXISTS gateways(project TEXT, device TEXT, received REAL, online INTEGER, PRIMARY KEY(project,device));
        CREATE TABLE IF NOT EXISTS device_sessions(project TEXT, session TEXT, device TEXT, current_boot TEXT, updated REAL, PRIMARY KEY(project,session,device));''')
        columns = {row['name'] for row in self.rows('PRAGMA table_info(action_expectations)')}
        if 'command_field' not in columns:
            self.db.execute("ALTER TABLE action_expectations ADD COLUMN command_field TEXT NOT NULL DEFAULT 'last_command_id'")
        event_columns = {row['name'] for row in self.rows('PRAGMA table_info(events)')}
        if 'subject' not in event_columns:
            self.db.execute("ALTER TABLE events ADD COLUMN subject TEXT NOT NULL DEFAULT ''")
        if 'severity' not in event_columns:
            self.db.execute("ALTER TABLE events ADD COLUMN severity TEXT NOT NULL DEFAULT 'warning'")
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
        if 'monitoring' not in project:
            project['monitoring'] = MonitoringSettings(silence_seconds=max(30, project.get('freshness_seconds', 8))).model_dump()
            config_changed = True
        project['graph'], changed = migrate_graph(project['graph'], project.get('freshness_seconds', 8), project.get('template'), project['device_id'], project.get('connector', 'usb'), project.get('mapping'), project.get('devices'), project.get('components') or None)
        if changed or config_changed: self.execute('UPDATE projects SET config=? WHERE id=?', (json.dumps(project), pid))
        if not self.rows('SELECT 1 FROM summary_schedule WHERE project=?', (pid,)):
            self.execute('INSERT OR IGNORE INTO summary_schedule VALUES (?,?)', (pid, time.time() + project['monitoring']['summary_interval_minutes'] * 60))
        return project
    def projects(self): return [self.project(row['id']) for row in self.rows('SELECT id FROM projects ORDER BY rowid')]

    def create_project(self, request: ProjectCreate, pid=None):
        pid = pid or f'project-{uid()[:10]}'
        configured_devices = [{'id': request.device_id, 'connector': request.connector, 'serial_port': request.serial_port, 'baud_rate': request.baud_rate}, *[{'id': item.device_id, 'connector': item.connector, 'serial_port': item.serial_port, 'baud_rate': item.baud_rate} for item in request.devices]]
        configured_components = [item.model_dump() for item in request.components]
        project = {'id': pid, **request.model_dump(exclude={'devices', 'components'}), 'description': f'{request.template.replace("_", " ").title()} project with independent telemetry, events, controls, and agent context.', 'arabic_title': None, 'created': time.time(), 'agent': {'version': 1, 'mode': 'observe', 'allowed_actions': ['acknowledge_event']}, 'devices': configured_devices, 'components': configured_components}
        project['monitoring']['silence_seconds'] = max(project['monitoring']['silence_seconds'], request.freshness_seconds)
        project['graph'] = definition(request.template, request.mapping.model_dump(), cable=request.cable_description, device_id=request.device_id, connector=request.connector, devices=configured_devices, components=configured_components or None, freshness_seconds=request.freshness_seconds)
        from .hardware_templates import LEGACY, firmware_check
        if request.template not in LEGACY:
            if request.devices: raise ValueError('Hardware templates currently describe one device per project. Use a manual preset for a custom assembly.')
            check = firmware_check(project, request.device_id, request.template)
            if not check['compatible']: raise ValueError(' '.join(check['errors']))
            project['firmware_template_version'] = check['version']
        self.validate_monitoring(project, project['monitoring'])
        self.execute('INSERT INTO projects VALUES (?,?)', (pid, json.dumps(project)))
        self.create_session(pid, 'live'); self.create_session(pid, 'simulated')
        return project

    @staticmethod
    def validate_monitoring(project, monitoring):
        fields = project['graph']['fields']
        for rule in monitoring['threshold_rules']:
            field = fields.get(rule['field_key'])
            if not field or field['data_type'] != 'number':
                raise ValueError(f"{rule['field_key']} is not a numeric field in this project")
        if monitoring['silence_seconds'] < project['freshness_seconds']:
            raise ValueError('Silence alert delay must be at least the freshness threshold')

    def update_settings(self, pid, body: Settings):
        project = self.project(pid)
        monitoring = body.monitoring.model_dump() if body.monitoring else project['monitoring']
        candidate = {**project, **body.model_dump(exclude={'monitoring'}), 'monitoring': monitoring}
        candidate['graph'] = definition(candidate['template'], candidate['mapping'], cable=candidate['cable_description'], device_id=candidate['device_id'], connector=candidate['connector'], devices=candidate['devices'], components=candidate.get('components') or None, freshness_seconds=candidate['freshness_seconds'])
        self.validate_monitoring(candidate, monitoring)
        old = project['monitoring']
        with self.lock:
            self.db.execute('UPDATE projects SET config=? WHERE id=?', (json.dumps(candidate), pid))
            if old['summary_interval_minutes'] != monitoring['summary_interval_minutes'] or (not old['summary_enabled'] and monitoring['summary_enabled']):
                self.db.execute('INSERT OR REPLACE INTO summary_schedule VALUES (?,?)', (pid, time.time() + monitoring['summary_interval_minutes'] * 60))
            active = self.rows("SELECT id,kind,subject,evidence FROM events WHERE project=? AND recovered IS NULL AND kind='threshold_breach'", (pid,))
            rules = {(rule['field_key'], rule['direction']): rule['limit'] for rule in monitoring['threshold_rules']}
            for event in active:
                evidence = json.loads(event['evidence'])
                if rules.get((evidence.get('field_key'), evidence.get('direction'))) != evidence.get('limit'):
                    evidence['close_reason'] = 'Rule removed or changed in settings'
                    self.db.execute('UPDATE events SET recovered=?,evidence=? WHERE id=?', (time.time(), json.dumps(evidence), event['id']))
                    self._cancel_pending_email('event', event['id'], 'Rule removed or changed')
            if (old['alert_email_enabled'] and not monitoring['alert_email_enabled']) or old['email_to'] != monitoring['email_to']:
                self.db.execute("UPDATE email_outbox SET status='cancelled',last_error='Email settings changed' WHERE project=? AND ref_kind='event' AND status='pending'", (pid,))
            if (old['summary_email_enabled'] and not monitoring['summary_email_enabled']) or old['email_to'] != monitoring['email_to']:
                self.db.execute("UPDATE email_outbox SET status='cancelled',last_error='Email settings changed' WHERE project=? AND ref_kind='summary' AND status='pending'", (pid,))
            self.db.commit()
        return candidate

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
            self.db.execute('DELETE FROM action_proposals WHERE action_id IN (SELECT id FROM actions WHERE project=?)', (pid,))
            self.db.execute('DELETE FROM boots WHERE session IN (SELECT id FROM sessions WHERE project=?)', (pid,))
            for table in ('summaries', 'summary_schedule', 'email_outbox'):
                self.db.execute(f'DELETE FROM {table} WHERE project=?', (pid,))
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

    def clear_telemetry_history(self, pid, sid):
        """Remove older samples without resetting freshness or replay protection."""
        with self.lock:
            self.project(pid)
            self.session(pid, sid)
            # Ingestion checks sequence/uptime against the last stored sample.
            # Retain it for every device, along with all boot/session records.
            result = self.db.execute('''
                DELETE FROM readings WHERE project=? AND session=? AND id NOT IN (
                    SELECT MAX(id) FROM readings WHERE project=? AND session=? GROUP BY device
                )''', (pid, sid, pid, sid))
            kept = self.db.execute(
                'SELECT COUNT(*) FROM readings WHERE project=? AND session=?', (pid, sid)
            ).fetchone()[0]
            self.db.commit()
            return {'deleted': result.rowcount, 'kept': kept}

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
        now = time.time() if now is None else now
        with self.lock:
            project, session = self.project(pid), self.session(pid, sid)
            monitoring = project['monitoring']
            active = self.rows('SELECT * FROM events WHERE project=? AND session=? AND recovered IS NULL', (pid, sid))
            reports = {row['device']: row['received'] for row in self.rows('SELECT device,MAX(received) AS received FROM readings WHERE project=? AND session=? GROUP BY device', (pid, sid))}
            for device in project['devices']:
                did, last_received = device['id'], reports.get(device['id'])
                if last_received is None: continue  # Awaiting the first valid report is not an outage.
                old = next((row for row in active if row['kind'] == 'missing_telemetry' and row['subject'] in (did, '' if did == project['device_id'] else did)), None)
                silent = now - last_received > monitoring['silence_seconds']
                if silent and old is None:
                    recent = self.rows('SELECT * FROM readings WHERE project=? AND session=? AND device=? ORDER BY id DESC LIMIT 3', (pid, sid, did))
                    evidence = {'rule': f"{did} sent no telemetry for over {monitoring['silence_seconds']} seconds", 'readings': [self._reading(row) for row in reversed(recent)], 'observed_at': now, 'last_received': last_received, 'source_mode': session['mode'], 'device_id': did, 'cause': 'Unknown from available telemetry'}
                    self._open_event(pid, sid, 'missing_telemetry', did, now, evidence, project, session)
                elif not silent and old is not None:
                    self.db.execute('UPDATE events SET recovered=? WHERE id=?', (now, old['id']))
                    self._cancel_pending_email('event', old['id'], 'Device resumed reporting')
            for rule in monitoring['threshold_rules']:
                key, direction, limit = rule['field_key'], rule['direction'], rule['limit']
                device_id = project['graph']['fields'][key].get('device_id')
                subject = f'{key}:{direction}'
                old = next((row for row in active if row['kind'] == 'threshold_breach' and row['subject'] == subject), None)
                samples = self.rows("SELECT * FROM readings WHERE project=? AND session=? AND device=? AND json_type(payload, ?) IN ('integer','real') ORDER BY id DESC LIMIT 2", (pid, sid, device_id, f'$.{key}'))
                pair = [self._reading(row) for row in reversed(samples)]
                if len(pair) != 2 or now - pair[-1]['received'] > project['freshness_seconds'] or pair[-1]['received'] - pair[0]['received'] > project['freshness_seconds']:
                    continue
                breach = all(row['readings'][key] > limit if direction == 'above' else row['readings'][key] < limit for row in pair)
                normal = all(row['readings'][key] <= limit if direction == 'above' else row['readings'][key] >= limit for row in pair)
                if breach and old is None:
                    unit = project['graph']['fields'][key]['unit']
                    comparison = 'above' if direction == 'above' else 'below'
                    evidence = {'rule': f"{key} stayed {comparison} {limit:g} {unit}".strip(), 'readings': pair, 'observed_at': now, 'source_mode': session['mode'], 'device_id': device_id, 'field_key': key, 'direction': direction, 'limit': limit, 'unit': unit, 'cause': 'Unknown from available telemetry'}
                    self._open_event(pid, sid, 'threshold_breach', subject, now, evidence, project, session)
                elif normal and old is not None:
                    self.db.execute('UPDATE events SET recovered=? WHERE id=?', (now, old['id']))
                    self._cancel_pending_email('event', old['id'], 'Readings returned to range')
            self.db.execute("UPDATE actions SET status='timed_out' WHERE status='requested' AND id IN (SELECT action_id FROM action_expectations WHERE deadline<?)", (now,))
            self.db.execute("UPDATE actions SET status='expired' WHERE project=? AND session=? AND status='awaiting_confirmation' AND id IN (SELECT action_id FROM action_proposals WHERE expires<=?)", (pid, sid, now))
            cutoff = now - project.get('retention_days', 30) * 86400
            self.db.execute('DELETE FROM readings WHERE id IN (SELECT id FROM readings WHERE project=? AND received<? ORDER BY id LIMIT 200)', (pid, cutoff))
            self.db.commit()

    @staticmethod
    def _reading(row):
        return {**{key: value for key, value in row.items() if key != 'payload'}, 'readings': json.loads(row['payload']), 'original': json.loads(row['original']) if row['original'] else None}

    def _open_event(self, pid, sid, kind, subject, now, evidence, project, session):
        eid = uid()
        self.db.execute('INSERT INTO events(id,project,session,kind,created,recovered,acknowledged,evidence,subject,severity) VALUES (?,?,?,?,?,?,?,?,?,?)', (eid, pid, sid, kind, now, None, None, json.dumps(evidence), subject, 'warning'))
        if session['mode'] == 'live' and project['monitoring']['alert_email_enabled']:
            recipient = project['monitoring']['email_to'] or os.getenv('AGENTWIN_EMAIL_TO')
            if recipient:
                last = evidence.get('last_received')
                detail = f"Last valid report: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime(last))}." if last else f"Observed value: {evidence['readings'][-1]['readings'].get(evidence.get('field_key'))} {evidence.get('unit', '')}."
                body = f"Project: {project['name']}\nDetected: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime(now))}\n\n{evidence['rule']}. {detail} Cause is not established by this alert."
                self._queue_email(pid, 'event', eid, recipient, f"Agentwin alert: {project['name']}", body, now)

    def events(self, pid, sid):
        return [{**row, 'evidence': json.loads(row['evidence'])} for row in self.rows("SELECT e.*,COALESCE(o.status,'not_configured') AS email_status FROM events e LEFT JOIN email_outbox o ON o.ref_kind='event' AND o.ref_id=e.id WHERE e.project=? AND e.session=? ORDER BY e.created DESC LIMIT 100", (pid, sid))]

    def _queue_email(self, pid, kind, ref_id, recipient, subject, body, now):
        self.db.execute('INSERT OR IGNORE INTO email_outbox(id,project,ref_kind,ref_id,recipient,subject,body,status,next_attempt) VALUES (?,?,?,?,?,?,?,?,?)', (uid(), pid, kind, ref_id, recipient, subject, body, 'pending', now))

    def _cancel_pending_email(self, kind, ref_id, reason):
        self.db.execute("UPDATE email_outbox SET status='cancelled',last_error=? WHERE ref_kind=? AND ref_id=? AND status='pending'", (reason, kind, ref_id))

    def pending_email(self, now=None):
        now = time.time() if now is None else now
        return self.rows("SELECT * FROM email_outbox WHERE status='pending' AND next_attempt<=? ORDER BY next_attempt LIMIT 10", (now,))

    def email_result(self, message_id, error=None, now=None):
        now = time.time() if now is None else now
        with self.lock:
            row = self.rows('SELECT attempts FROM email_outbox WHERE id=?', (message_id,))
            if not row: return
            attempts = row[0]['attempts'] + 1
            if error is None:
                self.db.execute("UPDATE email_outbox SET status='sent',attempts=?,sent=?,last_error=NULL WHERE id=?", (attempts, now, message_id))
            else:
                status = 'failed' if attempts >= 5 else 'pending'
                self.db.execute('UPDATE email_outbox SET status=?,attempts=?,next_attempt=?,last_error=? WHERE id=?', (status, attempts, now + min(3600, 60 * 2 ** (attempts - 1)), str(error)[:200], message_id))
            self.db.commit()

    def due_summaries(self, now=None):
        now = time.time() if now is None else now
        due = []
        for project in self.projects():
            if not project['monitoring']['summary_enabled']: continue
            schedule = self.rows('SELECT next_due FROM summary_schedule WHERE project=?', (project['id'],))
            if schedule and schedule[0]['next_due'] <= now:
                due.append((project['id'], self.session(project['id'], mode='live')['id'], schedule[0]['next_due']))
        return due

    def summary_facts(self, pid, sid, now=None):
        now = time.time() if now is None else now
        project, session = self.project(pid), self.session(pid, sid)
        if session['mode'] != 'live': raise ValueError('Scheduled summaries use only live telemetry')
        minutes = project['monitoring']['summary_interval_minutes']
        start = now - minutes * 60
        devices = []
        for device in project['devices']:
            did = device['id']
            count = self.rows('SELECT COUNT(*) AS count FROM readings WHERE project=? AND session=? AND device=? AND received>? AND received<=?', (pid, sid, did, start, now))[0]['count']
            latest = self.rows('SELECT * FROM readings WHERE project=? AND session=? AND device=? AND received<=? ORDER BY received DESC,id DESC LIMIT 1', (pid, sid, did, now))
            last = self._reading(latest[0]) if latest else None
            devices.append({'id': did, 'samples': count, 'last_received': last['received'] if last else None, 'reporting': bool(last and now - last['received'] <= project['freshness_seconds'])})
        observations = []
        for key, field in project['graph']['fields'].items():
            if key.endswith('last_command_id'): continue
            latest = self.rows('SELECT * FROM readings WHERE project=? AND session=? AND device=? AND received>? AND received<=? AND json_type(payload, ?) IS NOT NULL ORDER BY id DESC LIMIT 1', (pid, sid, field.get('device_id'), start, now, f'$.{key}'))
            if latest:
                reading = self._reading(latest[0]); value = reading['readings'].get(key)
                if value is not None: observations.append({'field': key, 'label': field['label'], 'value': value, 'unit': field['unit'], 'received': reading['received']})
        opened = self.rows('SELECT id,kind,subject FROM events WHERE project=? AND session=? AND created>? AND created<=?', (pid, sid, start, now))
        recovered = self.rows('SELECT id FROM events WHERE project=? AND session=? AND recovered>? AND recovered<=?', (pid, sid, start, now))
        active = self.rows('SELECT id,kind,subject FROM events WHERE project=? AND session=? AND created<=? AND (recovered IS NULL OR recovered>?)', (pid, sid, now, now))
        return {'project_id': pid, 'project_name': project['name'], 'session_id': sid, 'period_start': start, 'period_end': now, 'minutes': minutes, 'devices': devices, 'observations': observations[:12], 'new_events': opened[:20], 'recovered_count': len(recovered), 'open_events': active[:20]}

    def summaries(self, pid, sid, limit=20):
        self.session(pid, sid)
        return self.rows("SELECT s.id,s.project,s.session,s.period_start,s.period_end,s.created,s.body,s.source,COALESCE(o.status,'not_configured') AS email_status FROM summaries s LEFT JOIN email_outbox o ON o.ref_kind='summary' AND o.ref_id=s.id WHERE s.project=? AND s.session=? ORDER BY s.created DESC LIMIT ?", (pid, sid, limit))

    def save_summary(self, pid, sid, slot, facts, body, source):
        now = time.time()
        with self.lock:
            project = self.project(pid)
            schedule = self.rows('SELECT next_due FROM summary_schedule WHERE project=?', (pid,))
            if not project['monitoring']['summary_enabled'] or not schedule or schedule[0]['next_due'] != slot:
                return None  # Settings changed while the summary was being prepared.
            summary_id = uid()
            inserted = self.db.execute('INSERT OR IGNORE INTO summaries VALUES (?,?,?,?,?,?,?,?,?)', (summary_id, pid, sid, slot, facts['period_start'], facts['period_end'], now, body, source)).rowcount
            if not inserted:
                return None
            self.db.execute('UPDATE summary_schedule SET next_due=? WHERE project=?', (now + project['monitoring']['summary_interval_minutes'] * 60, pid))
            if project['monitoring']['summary_email_enabled']:
                recipient = project['monitoring']['email_to'] or os.getenv('AGENTWIN_EMAIL_TO')
                if recipient:
                    interval = f"{time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime(facts['period_start']))} to {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime(facts['period_end']))}"
                    latest = max((device['last_received'] for device in facts['devices'] if device['last_received'] is not None), default=None)
                    last_telemetry = last_telemetry_label(latest, facts['period_end'])
                    email_body = f"Project: {project['name']}\nLive window: {interval}\nLast telemetry (at window end): {last_telemetry}\n\n{body}"
                    self._queue_email(pid, 'summary', summary_id, recipient, f"Agentwin summary: {project['name']}", email_body, now)
            self.db.commit()
            return summary_id
    def actions(self, pid, sid):
        from .control_proposals import proposal_view
        self.session(pid, sid)
        rows = self.rows('SELECT a.*, p.details AS proposal_details FROM actions a LEFT JOIN action_proposals p ON p.action_id=a.id WHERE a.project=? AND a.session=? ORDER BY a.created DESC LIMIT 100', (pid, sid))
        for row in rows:
            details = row.pop('proposal_details')
            if details:
                row['proposal'] = proposal_view(row['id'], row['status'], json.loads(details))
        return rows

    def state(self, pid, sid=None):
        project = self.project(pid); active = self.session(pid, sid, mode='live' if sid is None else None); readings = self.history(pid, active['id']); latest = readings[-1] if readings else None
        live = self.session(pid, mode='live')
        schedule = self.rows('SELECT next_due FROM summary_schedule WHERE project=?', (pid,))
        monitoring = project['monitoring']
        next_summary_email_due = schedule[0]['next_due'] if schedule and monitoring['summary_enabled'] and monitoring['summary_email_enabled'] and (monitoring['email_to'] or os.getenv('AGENTWIN_EMAIL_TO')) and smtp_configured() else None
        gateways = self.rows('SELECT * FROM gateways WHERE project=?', (pid,)); online = {row['device'] for row in gateways if row['online'] and time.time() - row['received'] < 10}
        devices = [{'id': device['id'], 'connector': device['connector'], 'online': device['id'] in online, 'reporting': any(row['device'] == device['id'] and time.time()-row['received'] <= project['freshness_seconds'] for row in readings[-20:])} for device in project['devices']]
        field_status = {}
        for key, field in project['graph']['fields'].items():
            observed = next((row for row in reversed(readings) if key in row['readings']), None); limit = field.get('freshness_seconds') or project['freshness_seconds']
            field_status[key] = {'received': observed['received'] if observed else None, 'fresh': bool(observed and time.time()-observed['received'] <= limit), 'device_id': field.get('device_id')}
        return {'project': project, 'session': {**active, 'provenance': json.loads(active['provenance'])}, 'sessions': self.rows('SELECT * FROM sessions WHERE project=? ORDER BY created DESC', (pid,)), 'latest': latest, 'readings': readings, 'events': self.events(pid, active['id']), 'summaries': self.summaries(pid, live['id']), 'next_summary_email_due': next_summary_email_due, 'server_time': time.time(), 'actions': self.actions(pid, active['id']), 'devices': devices, 'field_status': field_status, 'status': 'awaiting data' if not latest else 'stale' if not any(item['fresh'] for item in field_status.values()) else 'reporting', 'gateway_status': 'online' if online else 'unknown', 'agent_config': project['agent']}
    def acknowledge(self, pid, sid, eid):
        rows = self.rows('SELECT * FROM events WHERE id=? AND project=? AND session=?', (eid, pid, sid))
        if not rows: raise ValueError('Event not found in this scope')
        if not rows[0]['acknowledged']: self.execute('UPDATE events SET acknowledged=? WHERE id=?', (time.time(), eid)); self.execute('INSERT INTO actions VALUES (?,?,?,?,?,?,?)', (uid(), pid, sid, time.time(), 'acknowledge_event', eid, 'completed'))
        return {'status': 'acknowledged', 'resolved': bool(rows[0]['recovered'])}
