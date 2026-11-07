# UNO R4 WiFi RF detector

Direct-MQTT Agentwin project integrating the supplied bare-metal MLP weights and inference function. The original model is in `RF_jamming.ino`; Agentwin lifecycle and telemetry are in `R4_jamming_detector.ino` and `src/RfJammingDriver.h`.

The model deployed on this R4 RF Jamming Detector is also open source in
[CryptoPulse AI System](https://github.com/SalehBaderah/cryptopulse-ai-system).
AgentWin was originally built to stream real-time edge-device data for CryptoPulse
and later expanded into a broader IoT monitoring workspace.

## Publishing and stale telemetry

This template publishes once per second by default. The default freshness limit
is five seconds since the backend's last accepted reading; there is no intended
50-second cutoff. A solid LED indicates the local MQTT connection flag, not
successful ingestion by the backend.

Template version 2 serializes each bounded JSON packet locally and sends it with
one payload write. Direct JSON streaming previously required hundreds of small
writes through WiFiS3, which can block publishing. Updating the website alone
does not change firmware already flashed on the board: download a fresh package
from **Device setup**, preserve your local credentials, and compile/upload it.

For diagnosis, open the R4's USB Serial Monitor at **115200 baud**. A summary every
five seconds reports `wifi`, `mqtt`, successful/failed packet counts,
`publish_ms`, and `last_sent_age_ms`. Monitoring is optional; the board never waits
for a USB host. Successful sends should keep increasing; local send success does
not prove backend acceptance. Check `/api/health` for `mqtt` and `mqtt_rejections`;
the backend logs reasons for duplicate, out-of-order, or retired-boot rejections.
Keep the configured freshness limit while investigating; increasing it would
only hide missing updates. The [host regression test](../../../tests/firmware/README.md)
checks serialization and transport behavior without physical hardware.

The UNO R4 WiFi header exposes A0-A5, so this project uses A5. Do not wire to `A10`. The AD8313 is a logarithmic RF detector/controller covering 0.1-2.5 GHz, not a spectrum analyzer. Its DC output, this specific breakout's supply/pinout, attenuation, antenna response, ADC reference, and model training setup must be verified before interpreting the prediction as calibrated evidence of jamming.

The built-in D13 LED is a connection indicator: solid means MQTT is connected, slow blinking means Wi-Fi is connected but MQTT is not, and fast blinking means Wi-Fi is unavailable. It lights during `setup()` before the Wi-Fi attempt. If it never lights on battery, check the power source and wiring before investigating network settings. This is separate from the classic UNO D13 LED project.

After creating the website project, copy its generated ID into `project_config.h`. Copy `secrets.example.h` to ignored `secrets.h` and enter the private Wi-Fi and MQTT values.

```powershell
arduino-cli compile --fqbn arduino:renesas_uno:unor4wifi --libraries firmware/libraries firmware/projects/R4_jamming_detector
arduino-cli upload --port COM3 --fqbn arduino:renesas_uno:unor4wifi firmware/projects/R4_jamming_detector
```
