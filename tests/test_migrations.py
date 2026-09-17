import json, sqlite3
from backend.store import Store

def test_legacy_gateway_migrates_to_device_scope(tmp_path):
    path = tmp_path/'legacy.db'; db = sqlite3.connect(path)
    db.execute('CREATE TABLE projects(id TEXT PRIMARY KEY, config TEXT NOT NULL)')
    db.execute('INSERT INTO projects VALUES (?,?)', ('project-one', json.dumps({'device_id':'board-one'})))
    db.execute('CREATE TABLE gateways(project TEXT PRIMARY KEY, received REAL, online INTEGER)')
    db.execute('INSERT INTO gateways VALUES (?,?,?)', ('project-one', 10.0, 1)); db.commit(); db.close()
    store = Store(str(path)); row = store.rows('SELECT * FROM gateways')[0]
    assert row == {'project':'project-one','device':'board-one','received':10.0,'online':1}
    store.db.close()
