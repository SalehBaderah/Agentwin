#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <HardwareDriver.h>
#include <math.h>

float predictJamming(float *input);
extern float scaler_mean[3];
extern float scaler_scale[3];

class RfJammingDriver : public HardwareDriver {
 public:
  RfJammingDriver(uint8_t pin, float referenceV, unsigned long sampleIntervalMs)
      : pin_(pin), referenceV_(referenceV), sampleIntervalMs_(sampleIntervalMs) {}

  void begin() override {
    pinMode(pin_, INPUT);
    analogReadResolution(10);
  }

  void loop(unsigned long now) override {
    if (now - lastSampleMs_ < sampleIntervalMs_) return;
    lastSampleMs_ = now;
    voltage_ = analogRead(pin_) * referenceV_ / 1023.0f;
    buffer_[bufferIndex_++] = voltage_;
    if (bufferIndex_ >= WINDOW_SIZE) { bufferIndex_ = 0; bufferFull_ = true; }
    if (!bufferFull_) return;

    float sum = 0.0f;
    for (uint8_t i = 0; i < WINDOW_SIZE; ++i) sum += buffer_[i];
    mean_ = sum / WINDOW_SIZE;
    float variance = 0.0f;
    for (uint8_t i = 0; i < WINDOW_SIZE; ++i) {
      const float difference = buffer_[i] - mean_;
      variance += difference * difference;
    }
    stddev_ = sqrt(variance / (WINDOW_SIZE - 1));
    float features[3] = {voltage_, mean_, stddev_};
    float scaled[3];
    for (uint8_t i = 0; i < 3; ++i) scaled[i] = (features[i] - scaler_mean[i]) / scaler_scale[i];
    probability_ = predictJamming(scaled);

    if (!attackState_ && probability_ >= 0.50f && now - lastChangeMs_ > 200) {
      attackState_ = true;
      lastChangeMs_ = now;
    } else if (attackState_ && probability_ < 0.49f && now - lastChangeMs_ > 200) {
      attackState_ = false;
      lastChangeMs_ = now;
    }
  }

  void appendReadings(JsonObject readings) override {
    readings["rf_detector_v"] = voltage_;
    readings["rf_mean_v"] = mean_;
    readings["rf_std_v"] = stddev_;
    readings["jamming_probability_percent"] = probability_ * 100.0f;
    readings["jamming_state"] = bufferFull_ ? (attackState_ ? "attack" : "normal") : "warming_up";
  }

 private:
  static constexpr uint8_t WINDOW_SIZE = 10;
  uint8_t pin_;
  float referenceV_;
  unsigned long sampleIntervalMs_;
  unsigned long lastSampleMs_ = 0;
  unsigned long lastChangeMs_ = 0;
  float buffer_[WINDOW_SIZE] = {};
  uint8_t bufferIndex_ = 0;
  bool bufferFull_ = false;
  bool attackState_ = false;
  float voltage_ = 0.0f;
  float mean_ = 0.0f;
  float stddev_ = 0.0f;
  float probability_ = 0.0f;
};
