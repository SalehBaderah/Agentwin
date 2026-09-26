import asyncio
import json
import time

from backend.agent import deterministic_summary
from backend.models import DeviceCreate, MonitoringSettings, ProjectCreate, Settings
from backend.notifications import send_email
from backend.runtime import Runtime
from backend.store import Store


def create_store(tmp_path, *, template='temperature', monitoring=None):
    store = Store(str(tmp_path / 'monitoring.db'))
    project = store.create_project(ProjectCreate(name='Monitoring test', template=template, device_id='device-a', connector='mqtt', monitoring=monitoring or MonitoringSettings()))
    return store, project['id'], store.session(project['id'], mode='live')['id']


def packet(pid, device, sequence, readings):
    return {'schema_version': 1, 'project_id': pid, 'device_id': device, 'boot_id': 'boot-a', 'sequence': sequence, 'uptime_ms': sequence * 1000, 'session_registration': True, 'readings': readings}


def save_settings(store, pid, **changes):
    project = store.project(pid)
    monitoring = MonitoringSettings.model_validate({**project['monitoring'], **changes})
    return store.update_settings(pid, Settings(freshness_seconds=project['freshness_seconds'], high_limit=project['high_limit'], cable_description=project['cable_description'], monitoring=monitoring))


def test_new_and_existing_projects_inherit_safe_defaults(tmp_path):
    store, pid, _ = create_store(tmp_path, template='led')
    assert store.project(pid)['monitoring']['summary_interval_minutes'] == 10
    assert store.project(pid)['monitoring']['threshold_rules'] == []
    assert store.project(pid)['monitoring']['silence_seconds'] == 30
    project = store.project(pid); project.pop('monitoring')
    store.execute('UPDATE projects SET config=? WHERE id=?', (json.dumps(project), pid))
    migrated = store.project(pid)
    assert migrated['monitoring']['summary_enabled'] is True
    assert migrated['monitoring']['threshold_rules'] == []
    assert store.rows('SELECT next_due FROM summary_schedule WHERE project=?', (pid,))
    store.db.close()


def test_silence_is_per_device_and_starts_after_first_valid_reading(tmp_path, monkeypatch):
    monkeypatch.setenv('AGENTWIN_EMAIL_TO', 'operator@example.com')
    store, pid, sid = create_store(tmp_path, template='led')
    store.register_device(pid, DeviceCreate(device_id='device-b', connector='mqtt'))
    start = time.time()
    store.evaluate(pid, sid, now=start + 90)
    assert store.events(pid, sid) == []
    assert store.ingest(packet(pid, 'device-a', 0, {'led_on': False, 'last_command_id': None}), sid, now=start)['accepted']
    assert store.ingest(packet(pid, 'device-b', 0, {}), sid, now=start)['accepted']
    assert store.ingest(packet(pid, 'device-a', 1, {'led_on': False}), sid, now=start + 29)['accepted']
    store.evaluate(pid, sid, now=start + 31)
    events = store.events(pid, sid)
    assert len(events) == 1 and events[0]['subject'] == 'device-b'
    assert len(store.rows("SELECT * FROM email_outbox WHERE ref_kind='event'")) == 1
    store.evaluate(pid, sid, now=start + 32)
    assert len(store.events(pid, sid)) == 1
    assert store.ingest(packet(pid, 'device-b', 1, {}), sid, now=start + 33)['accepted']
    assert store.events(pid, sid)[0]['recovered'] is not None
    assert store.events(pid, sid)[0]['email_status'] == 'cancelled'
    store.db.close()


def test_thresholds_are_opt_in_and_removable(tmp_path):
    store, pid, sid = create_store(tmp_path)
    start = time.time()
    for seq, value in enumerate((40, 41)):
        assert store.ingest(packet(pid, 'device-a', seq, {'temperature_c': value}), sid, now=start + seq)['accepted']
    assert store.events(pid, sid) == []
    save_settings(store, pid, threshold_rules=[{'field_key': 'temperature_c', 'direction': 'above', 'limit': 30}])
    for seq, value in enumerate((42, 43), 2):
        assert store.ingest(packet(pid, 'device-a', seq, {'temperature_c': value}), sid, now=start + seq)['accepted']
    events = store.events(pid, sid)
    assert len(events) == 1 and events[0]['kind'] == 'threshold_breach'
    assert events[0]['evidence']['field_key'] == 'temperature_c'
    save_settings(store, pid, threshold_rules=[])
    event = store.events(pid, sid)[0]
    assert event['recovered'] is not None and event['evidence']['close_reason']
    store.db.close()


def test_disabling_email_cancels_queued_delivery(tmp_path, monkeypatch):
    monkeypatch.setenv('AGENTWIN_EMAIL_TO', 'operator@example.com')
    store, pid, sid = create_store(tmp_path, monitoring=MonitoringSettings(threshold_rules=[{'field_key': 'temperature_c', 'direction': 'above', 'limit': 30}]))
    now = time.time()
    for seq in range(2):
        assert store.ingest(packet(pid, 'device-a', seq, {'temperature_c': 35}), sid, now=now + seq)['accepted']
    assert store.events(pid, sid)[0]['email_status'] == 'pending'
    save_settings(store, pid, alert_email_enabled=False)
    assert store.events(pid, sid)[0]['email_status'] == 'cancelled'
    store.db.close()


def test_summaries_are_live_scoped_persisted_and_rescheduled(tmp_path, monkeypatch):
    monkeypatch.setenv('AGENTWIN_EMAIL_TO', 'operator@example.com')
    monkeypatch.setenv('LLM_PROVIDER', 'none')
    store, pid, sid = create_store(tmp_path)
    simulated = store.session(pid, mode='simulated')['id']
    now = time.time()
    assert store.ingest(packet(pid, 'device-a', 0, {'temperature_c': 24.5}), sid, now=now)['accepted']
    slot = store.rows('SELECT next_due FROM summary_schedule WHERE project=?', (pid,))[0]['next_due']
    assert store.due_summaries(slot - 1) == []
    assert store.due_summaries(slot + 1) == [(pid, sid, slot)]
    asyncio.run(Runtime(store).generate_summary(pid, sid, slot))
    summaries = store.state(pid, simulated)['summaries']
    assert len(summaries) == 1 and summaries[0]['source'] == 'deterministic'
    assert 'readings received' in summaries[0]['body']
    assert store.rows("SELECT recipient FROM email_outbox WHERE ref_kind='summary'")[0]['recipient'] == 'operator@example.com'
    save_settings(store, pid, summary_interval_minutes=3)
    new_slot = store.rows('SELECT next_due FROM summary_schedule WHERE project=?', (pid,))[0]['next_due']
    assert 179 <= new_slot - time.time() <= 181
    store.db.close()


def test_next_summary_email_due_uses_schedule_and_configuration(tmp_path, monkeypatch):
    monkeypatch.setenv('AGENTWIN_EMAIL_TO', 'operator@example.com')
    monkeypatch.setenv('AGENTWIN_EMAIL_FROM', 'sender@example.com')
    monkeypatch.setenv('AGENTWIN_SMTP_HOST', '127.0.0.1')
    store, pid, _ = create_store(tmp_path)
    slot = store.rows('SELECT next_due FROM summary_schedule WHERE project=?', (pid,))[0]['next_due']
    state = store.state(pid)
    assert state['next_summary_email_due'] == slot
    assert abs(state['server_time'] - time.time()) < 2
    save_settings(store, pid, summary_interval_minutes=3)
    new_slot = store.rows('SELECT next_due FROM summary_schedule WHERE project=?', (pid,))[0]['next_due']
    assert store.state(pid)['next_summary_email_due'] == new_slot != slot
    save_settings(store, pid, summary_email_enabled=False)
    assert store.state(pid)['next_summary_email_due'] is None
    save_settings(store, pid, summary_email_enabled=True)
    monkeypatch.delenv('AGENTWIN_EMAIL_TO')
    assert store.state(pid)['next_summary_email_due'] is None
    save_settings(store, pid, email_to='project@example.com')
    assert store.state(pid)['next_summary_email_due'] == new_slot
    monkeypatch.delenv('AGENTWIN_SMTP_HOST')
    assert store.state(pid)['next_summary_email_due'] is None
    store.db.close()


def test_summary_email_reports_last_live_telemetry_age(tmp_path, monkeypatch):
    monkeypatch.setenv('AGENTWIN_EMAIL_TO', 'operator@example.com')
    store, pid, sid = create_store(tmp_path)
    simulated = store.session(pid, mode='simulated')['id']
    window_end = time.time()
    last_live = window_end - 2 * 86400
    assert store.ingest(packet(pid, 'device-a', 0, {'temperature_c': 24.5}), sid, now=last_live)['accepted']
    assert store.ingest(packet(pid, 'device-a', 0, {'temperature_c': 30}), simulated, now=window_end - 60)['accepted']
    facts = store.summary_facts(pid, sid, now=window_end)
    slot = store.rows('SELECT next_due FROM summary_schedule WHERE project=?', (pid,))[0]['next_due']
    store.save_summary(pid, sid, slot, facts, deterministic_summary(facts), 'deterministic')
    body = store.rows("SELECT body FROM email_outbox WHERE ref_kind='summary'")[0]['body']
    assert 'Last telemetry (at window end): 2 days ago (' in body
    assert time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime(last_live)) in body
    store.db.close()


def test_summary_email_does_not_invent_last_telemetry(tmp_path, monkeypatch):
    monkeypatch.setenv('AGENTWIN_EMAIL_TO', 'operator@example.com')
    store, pid, sid = create_store(tmp_path)
    facts = store.summary_facts(pid, sid)
    slot = store.rows('SELECT next_due FROM summary_schedule WHERE project=?', (pid,))[0]['next_due']
    store.save_summary(pid, sid, slot, facts, deterministic_summary(facts), 'deterministic')
    body = store.rows("SELECT body FROM email_outbox WHERE ref_kind='summary'")[0]['body']
    assert 'Last telemetry (at window end): No stored live telemetry in this session' in body
    store.db.close()


def test_new_summary_does_not_cancel_earlier_pending_email(tmp_path, monkeypatch):
    monkeypatch.setenv('AGENTWIN_EMAIL_TO', 'operator@example.com')
    store, pid, sid = create_store(tmp_path)
    for _ in range(2):
        facts = store.summary_facts(pid, sid)
        slot = store.rows('SELECT next_due FROM summary_schedule WHERE project=?', (pid,))[0]['next_due']
        store.save_summary(pid, sid, slot, facts, deterministic_summary(facts), 'deterministic')
    assert [row['status'] for row in store.rows("SELECT status FROM email_outbox WHERE ref_kind='summary' ORDER BY rowid")] == ['pending', 'pending']
    store.db.close()


def test_no_data_summary_does_not_claim_health():
    facts = {'minutes': 10, 'devices': [{'id': 'device-a', 'samples': 0, 'reporting': False}], 'new_events': [], 'recovered_count': 0, 'open_events': [], 'observations': []}
    assert 'No telemetry received' in deterministic_summary(facts)
    assert 'healthy' not in deterministic_summary(facts)


def test_branded_email_contains_logo_and_plain_text(monkeypatch):
    sent = []
    class SMTP:
        def __init__(self, *args, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *_): return None
        def starttls(self, **_): pass
        def login(self, *_): pass
        def send_message(self, message): sent.append(message)
    monkeypatch.setenv('AGENTWIN_SMTP_HOST', 'smtp.example.com')
    monkeypatch.setenv('AGENTWIN_EMAIL_FROM', 'agentwin@example.com')
    monkeypatch.setenv('AGENTWIN_SMTP_SECURITY', 'starttls')
    monkeypatch.setattr('backend.notifications.smtplib.SMTP', SMTP)
    send_email({'recipient': 'operator@example.com', 'subject': 'Agentwin summary', 'body': 'No telemetry received.', 'ref_kind': 'summary'})
    assert sent and 'Agentwin' in sent[0].get_body(preferencelist=('plain',)).get_content()
    assert any(part.get('Content-ID') == '<agentwin-logo>' for part in sent[0].walk())


def test_summary_email_separates_metadata_and_findings(monkeypatch):
    sent = []
    class SMTP:
        def __init__(self, *args, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *_): return None
        def starttls(self, **_): pass
        def login(self, *_): pass
        def send_message(self, message): sent.append(message)
    monkeypatch.setenv('AGENTWIN_SMTP_HOST', 'smtp.example.com')
    monkeypatch.setenv('AGENTWIN_EMAIL_FROM', 'agentwin@example.com')
    monkeypatch.setenv('AGENTWIN_SMTP_SECURITY', 'starttls')
    monkeypatch.setattr('backend.notifications.smtplib.SMTP', SMTP)
    body = ('Project: R4 RF Jamming Detector\n'
            'Live window: 2026-09-24 21:23:32 UTC to 2026-09-24 21:33:32 UTC\n'
            'Last telemetry (at window end): 2 days ago (2026-09-22 21:33:32 UTC)\n\n'
            'No telemetry received during this 10-minute window; current device state is not confirmed by new readings. '
            '0 new alerts, 0 recovered, 1 still open.')
    send_email({'recipient': 'operator@example.com', 'subject': 'Agentwin summary', 'body': body, 'ref_kind': 'summary'})
    message = sent[0]
    plain = message.get_body(preferencelist=('plain',)).get_content()
    rendered = message.get_body(preferencelist=('html',)).get_content()
    assert body in plain
    assert 'Reporting window</td>' in rendered
    assert 'Last telemetry (at window end)</td>' in rendered
    assert '2 days ago (2026-09-22 21:33:32 UTC)' in rendered
    assert '<h1 ' in rendered and 'Scheduled project summary</h1>' in rendered
    assert 'R4 RF Jamming Detector</td>' in rendered
    assert rendered.count('font-size:15px;line-height:1.6') == 2
    assert 'Missing data does not establish a physical cause.' in plain


def test_email_html_escapes_project_and_finding(monkeypatch):
    sent = []
    class SMTP:
        def __init__(self, *args, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *_): return None
        def starttls(self, **_): pass
        def login(self, *_): pass
        def send_message(self, message): sent.append(message)
    monkeypatch.setenv('AGENTWIN_SMTP_HOST', 'smtp.example.com')
    monkeypatch.setenv('AGENTWIN_EMAIL_FROM', 'agentwin@example.com')
    monkeypatch.setenv('AGENTWIN_SMTP_SECURITY', 'starttls')
    monkeypatch.setattr('backend.notifications.smtplib.SMTP', SMTP)
    send_email({'recipient': 'operator@example.com', 'subject': 'Agentwin alert',
                'body': 'Project: <Sensor & relay>\nDetected: 2026-09-24 21:23:32 UTC\n\nThreshold < 5 & rising.',
                'ref_kind': 'event'})
    rendered = sent[0].get_body(preferencelist=('html',)).get_content()
    assert '&lt;Sensor &amp; relay&gt;' in rendered
    assert 'Threshold &lt; 5 &amp; rising.' in rendered
    assert '<Sensor & relay>' not in rendered


def test_email_failure_is_recorded_and_retried(tmp_path, monkeypatch):
    monkeypatch.setenv('AGENTWIN_EMAIL_TO', 'operator@example.com')
    store, pid, sid = create_store(tmp_path, monitoring=MonitoringSettings(threshold_rules=[{'field_key': 'temperature_c', 'direction': 'above', 'limit': 30}]))
    now = time.time()
    for seq in range(2):
        store.ingest(packet(pid, 'device-a', seq, {'temperature_c': 35}), sid, now=now + seq)
    store.execute('UPDATE email_outbox SET next_attempt=?', (time.time() - 1,))
    def fail(_): raise RuntimeError('temporary SMTP failure')
    monkeypatch.setattr('backend.runtime.send_email', fail)
    asyncio.run(Runtime(store).deliver_email())
    assert store.events(pid, sid)[0]['email_status'] == 'pending'
    assert store.rows('SELECT attempts FROM email_outbox')[0]['attempts'] == 1
    store.execute('UPDATE email_outbox SET next_attempt=?', (time.time() - 1,))
    monkeypatch.setattr('backend.runtime.send_email', lambda _: None)
    asyncio.run(Runtime(store).deliver_email())
    assert store.events(pid, sid)[0]['email_status'] == 'sent'
    store.db.close()
