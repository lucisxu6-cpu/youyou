// KEYES modules: V -> 3V3, G -> common GND.
// Channel labels are planned installation zones, not gesture classifications.
#include <Arduino.h>

constexpr uint8_t kHeadPin = 4;
constexpr uint8_t kBellyPin = 6;
constexpr uint8_t kBackPin = 7;
constexpr uint32_t kSampleIntervalMs = 20;
uint32_t lastSampleMs = 0;

void setup() {
  Serial0.begin(115200);
  analogReadResolution(12);
  for (const uint8_t pin : {kHeadPin, kBellyPin, kBackPin}) {
    pinMode(pin, INPUT);
    analogSetPinAttenuation(pin, ADC_11db);
  }
  delay(1000);
  Serial0.println("THREE_SENSOR_CHECK: head=GPIO4, belly=GPIO6, back=GPIO7; 12-bit raw; 20ms interval");
  Serial0.println("uptime_ms,head_raw,belly_raw,back_raw");
  lastSampleMs = millis();
}

void loop() {
  const uint32_t now = millis();
  if (static_cast<uint32_t>(now - lastSampleMs) < kSampleIntervalMs) {
    delay(1);
    return;
  }
  lastSampleMs = now;
  const uint16_t head = analogRead(kHeadPin);
  const uint16_t belly = analogRead(kBellyPin);
  const uint16_t back = analogRead(kBackPin);
  Serial0.printf("%lu,%u,%u,%u\n", static_cast<unsigned long>(now),
                 static_cast<unsigned>(head), static_cast<unsigned>(belly),
                 static_cast<unsigned>(back));
}
