# MQTT transport host regression

This test uses the real ArduinoJson 7.2.1 serializer and a test double for the
Arduino/MQTT socket. It verifies that packets larger than 256 bytes are sent
whole with one payload write, that repeated sends continue, and that failed or
oversized writes are handled. It does not simulate WiFiS3 timing or certify a
physical board's connection.

With a C++ compiler and an installed ArduinoJson 7.2.1 include directory:

```bash
mkdir -p artifacts
g++ -std=c++11 -Wall -Wextra -Werror \
  -Itests/firmware/stubs \
  -I/path/to/ArduinoJson/src \
  -Ifirmware/libraries/AgentwinCore/src \
  -Ifirmware/libraries/AgentwinArduino/src \
  tests/firmware/mqtt_transport.cpp -o artifacts/mqtt-transport-test
./artifacts/mqtt-transport-test
```

Replace the ArduinoJson path with your installation. The upstream 7.2.1
single-header distribution can also be used from an ignored local include
directory. Compile the real R4 sketch and verify reception on hardware separately.
