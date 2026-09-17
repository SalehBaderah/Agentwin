# UNO R4 WiFi RF detector

Direct-MQTT Agentwin project integrating the supplied bare-metal MLP weights and inference function. The original model is in `RF_jamming.ino`; Agentwin lifecycle and telemetry are in `R4_jamming_detector.ino` and `src/RfJammingDriver.h`.

The UNO R4 WiFi header exposes A0-A5, so this project uses A5. Do not wire to `A10`. The AD8313 is a logarithmic RF detector/controller covering 0.1-2.5 GHz, not a spectrum analyzer. Its DC output, this specific breakout's supply/pinout, attenuation, antenna response, ADC reference, and model training setup must be verified before interpreting the prediction as calibrated evidence of jamming.

After creating the website project, copy its generated ID into `project_config.h`. Copy `secrets.example.h` to ignored `secrets.h` and enter the private Wi-Fi and MQTT values.

```powershell
arduino-cli compile --fqbn arduino:renesas_uno:unor4wifi --libraries firmware/libraries firmware/projects/R4_jamming_detector
arduino-cli upload --port COM3 --fqbn arduino:renesas_uno:unor4wifi firmware/projects/R4_jamming_detector
```
