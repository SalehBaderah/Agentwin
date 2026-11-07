# Supported hardware setup

Complete the [local quick start](../README.md#quick-start) first. Simulation does
not require these steps. Physical devices require local USB/network access that
a remote development environment may not have.

| Hardware Template | Connection | Firmware |
| --- | --- | --- |
| Classic Arduino UNO D13 LED | USB → Python gateway → MQTT | [UNO guide](../firmware/projects/arduino_uno_d13_led/README.md) |
| UNO R4 WiFi + AD8313 RF detector | Wi-Fi → MQTT | [R4 guide](../firmware/projects/R4_jamming_detector/README.md) |

## 1. Create the project and configure its device

In **Add project**, choose **Supported hardware**, select the matching **Hardware
Template**, and configure the device identity and serial port where applicable.
A Hardware Template currently creates one device per project. **Custom
configuration** supports multiple devices but requires your own matching firmware.

After creating the project, use **Device setup** to download the generated
firmware package. It contains this project's project/device IDs and telemetry
contract. Use those generated IDs throughout the broker configuration and gateway
commands below; sample IDs from someone else's machine will not work.

## 2. Configure a private-network MQTT broker

The checked-in `broker/mosquitto.conf` is anonymous and intended only for loopback
development. For physical devices, use `broker/private-network.conf.example` as
the basis for ignored `broker/private-network.conf`. Create it only if absent.
Install Docker with Compose if you use the supplied broker container.

Create broker accounts using the Mosquitto password tool. These commands prompt
for passwords; do not put real passwords in command arguments or shell history.
Run them from the repository root, replacing the account `device-01` with the
account for your board. In PowerShell, use `${PWD}` in place of `$(pwd)`.

```bash
# ONLY for a new password file: -c creates/replaces it.
docker run --rm -it -v "$(pwd)/broker:/mosquitto/config" --entrypoint mosquitto_passwd eclipse-mosquitto:2.0.22 -c /mosquitto/config/passwords agentwin-backend
# Omit -c when adding accounts or changing an existing password.
docker run --rm -it -v "$(pwd)/broker:/mosquitto/config" --entrypoint mosquitto_passwd eclipse-mosquitto:2.0.22 /mosquitto/config/passwords device-01
```

Create ignored `broker/acl`. Replace `PROJECT_ID` and `DEVICE_ID` with the actual
values from **Device setup**, and use the matching MQTT username:

```text
user agentwin-backend
topic read agentwin/+/+/telemetry
topic read agentwin/+/+/status
topic write agentwin/+/+/command

user device-01
topic write agentwin/PROJECT_ID/DEVICE_ID/telemetry
topic write agentwin/PROJECT_ID/DEVICE_ID/status
topic read agentwin/PROJECT_ID/DEVICE_ID/command
```

For the USB gateway, choose a dedicated account with those device permissions,
or grant the backend account those same scoped telemetry/status writes and
command reads if you explicitly share it with the gateway. Do not use a
read-only backend subscription account for publishing gateway telemetry.

Set `.env` for the backend:

```dotenv
MQTT_HOST=127.0.0.1
MQTT_PORT=1883
MQTT_USERNAME=agentwin-backend
MQTT_PASSWORD=replace-with-your-local-password
MQTT_BROKER_CONFIG=private-network.conf
MQTT_BIND_IP=192.168.1.10
```

`MQTT_BIND_IP` above is a placeholder: replace it with the host's actual private
LAN address so Wi-Fi devices can reach the broker. The native backend can use
that address as `MQTT_HOST` too. If sharing its account with the USB gateway,
keep its scoped ACLs in sync. Use a trusted private network and restrict inbound
TCP 1883 accordingly; this example does not configure MQTT transport encryption.

```bash
docker compose up -d broker
```

Restart the broker after changing ACLs or password files and restart the backend
after `.env` changes. A password hash from `broker/passwords` is not the plain
password to put into `.env` or firmware.

## 3. Build and upload firmware locally

Use Arduino IDE or Arduino CLI and the board/library versions recorded in each
project's `sketch.yaml`. Keep the sketch folder and main `.ino` filename identical.
The repository reference sketches can be compiled from the root:

```bash
arduino-cli board list
arduino-cli compile --fqbn arduino:avr:uno --libraries firmware/libraries firmware/projects/arduino_uno_d13_led
arduino-cli compile --fqbn arduino:renesas_uno:unor4wifi --libraries firmware/libraries firmware/projects/R4_jamming_detector
```

Before building a reference sketch, set its `project_config.h` to the actual
project/device IDs, or build the generated package instead. For the R4, copy
`secrets.example.h` to ignored `secrets.h` without overwriting an existing file,
and set local Wi-Fi/broker credentials. Its broker address must be reachable
from the board; `127.0.0.1` on the board refers to the board itself.

Upload only the board you intend to update. Use the actual port reported by
`arduino-cli board list`; for example, replace `SERIAL_PORT` below:

```bash
arduino-cli upload --port SERIAL_PORT --fqbn arduino:avr:uno firmware/projects/arduino_uno_d13_led
```

Use `arduino:renesas_uno:unor4wifi` and the R4 sketch path for that board.
Flashing is local and manual; downloading firmware does not upload it.

## 4. Start the USB gateway when applicable

For the classic UNO, close Arduino Serial Monitor and run one gateway:

```bash
# macOS / Linux; use .\.venv\Scripts\python.exe on Windows.
.venv/bin/python -m gateway.serial_gateway --port SERIAL_PORT --baud 38400 --project PROJECT_ID --device DEVICE_ID
```

The classic UNO firmware and gateway must both use **38400 baud**. The gateway
loads the root `.env`; if using a dedicated gateway account, supply that account
through its process environment without overwriting the backend's credentials.
The R4 publishes over Wi-Fi and **does not use the serial gateway**. Reflash it
after changing its compiled credentials.

## 5. Verify the Live path

`/api/health` should report `mqtt: true`. Select a Live session and check fresh,
advancing telemetry for the correct project/device. In **Device setup**, mark
**I uploaded this package** only after uploading it yourself. Upload confirmation
is operator-recorded; reporting and telemetry verification need fresh Live
samples. Simulation cannot verify device setup, wiring, calibration, or outputs.

The R4 D13 LED indicates connectivity: fast blink means no Wi-Fi, slow blink
means Wi-Fi without MQTT, solid means MQTT connected. Its AD8313 detector output
and included classifier are not a calibrated spectrum or proof of jamming.

To add a new board/sensor implementation, follow the
[Hardware Template development guide](hardware-templates.md).
