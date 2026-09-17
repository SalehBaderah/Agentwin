"""Isolated MQTT device fixture. Never connects to physical hardware."""
import json
import sys
import time
import uuid
from paho.mqtt import client as mqtt

project, device, port = sys.argv[1:]
client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
pending = None
state, command_id = False, None

def receive(_client, _userdata, message):
    global pending
    pending = (time.monotonic() + 3, json.loads(message.payload))

client.on_message = receive
client.connect("127.0.0.1", int(port))
client.subscribe(f"agentwin/{project}/{device}/command")
client.loop_start()
sequence = 0
boot_id = "ui-fixture-" + uuid.uuid4().hex
while True:
    if pending and time.monotonic() >= pending[0]:
        state, command_id = pending[1]["value"], pending[1]["command_id"]
        pending = None
    client.publish(f"agentwin/{project}/{device}/telemetry", json.dumps({
        "schema_version": 1, "project_id": project, "device_id": device,
        "boot_id": boot_id, "sequence": sequence,
        "uptime_ms": sequence * 1000, "session_registration": True,
        "readings": {"led_on": state, "last_command_id": command_id},
    }))
    sequence += 1
    time.sleep(1)
