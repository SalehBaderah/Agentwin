"""Host USB gateway. Run from repository root; never buffers old telemetry."""
import argparse
import json
import logging
import os
import queue
import re
import time
import serial
from dotenv import load_dotenv
from paho.mqtt import client as mqtt
from backend.models import Telemetry

log = logging.getLogger('agentwin.gateway')

SERIAL_COMMAND_CHUNK_BYTES = 16
SERIAL_COMMAND_CHUNK_DELAY_SECONDS = 0.01

def write_command(connection, command):
    payload = ('CMD ' + command + '\n').encode('utf-8')
    for offset in range(0, len(payload), SERIAL_COMMAND_CHUNK_BYTES):
        connection.write(payload[offset:offset + SERIAL_COMMAND_CHUNK_BYTES])
        connection.flush()
        if offset + SERIAL_COMMAND_CHUNK_BYTES < len(payload):
            time.sleep(SERIAL_COMMAND_CHUNK_DELAY_SECONDS)

def validate_line(line, project, device):
    if len(line) > 8192:
        raise ValueError('Serial line too large')
    message = Telemetry.model_validate_json(line)
    if message.project_id != project or message.device_id != device:
        raise ValueError('Serial identity differs from registered gateway identity')
    return message.model_dump_json()

def validate_command(payload, project=None, device=None):
    if len(payload) > 1024:
        raise ValueError('Command too large')
    body = json.loads(payload)
    if body.get('schema_version') != 1 or body.get('action') != 'set_led' or not isinstance(body.get('value'), bool):
        raise ValueError('Unsupported command')
    if not isinstance(body.get('component_id'), str) or not re.fullmatch(r'[a-z][a-z0-9-]{0,63}', body['component_id']): raise ValueError('Invalid component identity')
    for key in ('project_id', 'device_id'):
        if key in body and (not isinstance(body[key], str) or not re.fullmatch(r'[a-z0-9-]{1,64}', body[key])): raise ValueError(f'Invalid {key}')
    if project is not None and body.get('project_id') != project: raise ValueError('Command project differs from gateway scope')
    if device is not None and body.get('device_id') != device: raise ValueError('Command device differs from gateway scope')
    command_id = body.get('command_id')
    if not isinstance(command_id, str) or not command_id or len(command_id) > 47:
        raise ValueError('Invalid command identity')
    return json.dumps(body, separators=(',', ':'))

def main():
    load_dotenv()
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', required=True)
    parser.add_argument('--project', default='smart-connectivity')
    parser.add_argument('--device', default='uno-r4-01')
    parser.add_argument('--baud', type=int, default=115200)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    topic = f'agentwin/{args.project}/{args.device}'
    commands = queue.Queue(maxsize=20)
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f'gateway-{args.project}-{args.device}', clean_session=True)
    if os.getenv('MQTT_USERNAME'):
        client.username_pw_set(os.getenv('MQTT_USERNAME'), os.getenv('MQTT_PASSWORD'))
    client.will_set(topic+'/status', json.dumps({'online': False}), qos=0, retain=False)
    client.reconnect_delay_set(1, 15)
    def connected(client, userdata, flags, reason, properties):
        if not reason.is_failure:
            client.subscribe(topic + '/command', qos=1)
    def message(client, userdata, msg):
        if msg.topic != topic + '/command' or msg.retain or len(msg.payload) > 1024:
            return
        try:
            commands.put_nowait(validate_command(msg.payload, args.project, args.device))
            log.info('Accepted command from MQTT for %s', args.device)
        except (ValueError, json.JSONDecodeError, queue.Full):
            log.warning('Invalid or excess command rejected')
    client.on_connect = connected
    client.on_message = message
    client.connect_async(os.getenv('MQTT_HOST', '127.0.0.1'), int(os.getenv('MQTT_PORT', 1883)), 15)
    client.loop_start()
    try:
        while True:
            try:
                with serial.serial_for_url(args.port, baudrate=args.baud, timeout=1) as connection:
                    connection.reset_input_buffer()
                    last_status = 0
                    while True:
                        try:
                            command = commands.get_nowait()
                            write_command(connection, command)
                            log.info('Forwarded command to %s on %s', args.device, args.port)
                        except queue.Empty:
                            pass
                        if time.monotonic() - last_status > 3:
                            client.publish(topic+'/status', json.dumps({'online': True}), qos=0, retain=False)
                            last_status = time.monotonic()
                        frame = connection.readline(8193)
                        if not frame:
                            continue
                        if len(frame) > 8192 or not frame.endswith(b'\n'):
                            log.warning('Incomplete or oversized serial frame rejected: bytes=%d newline=%s', len(frame), frame.endswith(b'\n'))
                            continue
                        try:
                            payload = validate_line(frame.rstrip(b'\r\n'), args.project, args.device)
                            if client.is_connected():
                                client.publish(topic+'/telemetry', payload, qos=0, retain=False)
                        except ValueError as error:
                            log.warning('Invalid serial frame rejected: %s; bytes=%d frame_prefix=%r frame_suffix=%r', error, len(frame), frame[:120], frame[-80:])
            except (serial.SerialException, OSError):
                client.publish(topic+'/status', json.dumps({'online': False}), qos=0, retain=False)
                log.warning('Serial unavailable; retrying in 3 seconds')
                time.sleep(3)
    except KeyboardInterrupt:
        pass
    finally:
        client.publish(topic+'/status', json.dumps({'online': False}), qos=0, retain=False)
        client.disconnect()
        client.loop_stop()

if __name__ == '__main__':
    main()
