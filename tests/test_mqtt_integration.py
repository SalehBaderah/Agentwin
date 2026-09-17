"""Opt-in TCP serial fixture -> actual gateway -> MQTT -> storage -> WebSocket.

No real hardware: temporary DB and Aedes protocol fixture, not Mosquitto certification.
"""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import pytest
from fastapi.testclient import TestClient
from backend.main import create_app
from backend.models import ProjectCreate

@pytest.mark.skipif(os.getenv('RUN_MQTT_TESTS') != '1', reason='Opt-in MQTT/socket integration fixture')
def test_serial_to_mqtt_to_websocket(tmp_path, monkeypatch):
    root = Path(__file__).resolve().parents[1]
    def free_port():
        with socket.socket() as sock:
            sock.bind(('127.0.0.1',0))
            return sock.getsockname()[1]
    broker_port=free_port()
    monkeypatch.setenv('MQTT_PORT',str(broker_port))
    monkeypatch.setenv('MQTT_HOST','127.0.0.1')
    monkeypatch.delenv('MQTT_USERNAME',raising=False)
    broker=subprocess.Popen(['node',str(root/'frontend/tests/mqtt-broker.mjs'),str(broker_port)],stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    gateway=None
    try:
        assert b'ready' in broker.stdout.readline()
        app=create_app(str(tmp_path/'integration.db'))
        app.state.store.create_project(ProjectCreate(name='Integration LED', template='led', device_id='uno-r4-01', connector='usb'), 'smart-connectivity')
        with TestClient(app) as client, socket.socket() as serial_fixture:
            serial_fixture.bind(('127.0.0.1',0))
            serial_fixture.listen(1)
            serial_fixture.settimeout(15)
            port=serial_fixture.getsockname()[1]
            gateway=subprocess.Popen([sys.executable,'-m','gateway.serial_gateway','--port',f'socket://127.0.0.1:{port}','--project','smart-connectivity','--device','uno-r4-01'],cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            connection,_=serial_fixture.accept()
            with connection:
                deadline=time.monotonic()+10
                while not app.state.runtime.mqtt_connected and time.monotonic()<deadline:
                    time.sleep(.1)
                assert app.state.runtime.mqtt_connected
                time.sleep(1)
                for i in range(4):
                    payload={'schema_version':1,'project_id':'smart-connectivity','device_id':'uno-r4-01','boot_id':'serial-fixture','sequence':i,'uptime_ms':i*1000,'readings':{'led_on':False,'last_command_id':None}}
                    line=json.dumps(payload).encode()+b'\n'
                    # A partial frame must survive a serial read timeout.
                    connection.sendall(line[:40])
                    time.sleep(.1)
                    connection.sendall(line[40:])
                    time.sleep(.9)
                sid=app.state.store.session('smart-connectivity',mode='live')['id']
                state=client.get(f'/api/projects/smart-connectivity?session={sid}').json()
                assert state['latest']['readings']['led_on'] is False
                assert state['status']=='reporting'
                assert state['gateway_status']=='online'
                with client.websocket_connect(f'/api/ws?project=smart-connectivity&session={sid}') as ws:
                    snapshot=ws.receive_json()
                    assert snapshot['state']['latest']['readings']['led_on'] is False
                # The fixture only populates the live connector's isolated test DB.
                assert app.state.store.state('smart-connectivity')['latest'] is None
    finally:
        if gateway:
            gateway.terminate()
            gateway.wait(timeout=10)
        broker.terminate()
        broker.wait(timeout=10)
