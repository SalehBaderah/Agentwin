# Arduino UNO D13 LED

USB-only Agentwin firmware for the classic ATmega328P UNO built-in LED. After creating the website project, copy its generated project ID into `project_config.h`, keep device ID `uno-d13-01`, compile, upload, close Serial Monitor, and run one serial gateway for the UNO's COM port.

```powershell
arduino-cli compile --fqbn arduino:avr:uno --libraries firmware/libraries firmware/projects/arduino_uno_d13_led
arduino-cli upload --port COM4 --fqbn arduino:avr:uno firmware/projects/arduino_uno_d13_led
```
