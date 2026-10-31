// Single KEYES pressure module: G -> GND, V -> 3V3, S -> GPIO4.
// Raw readings only: no gesture detection, Wi-Fi or AI calls.
#include <Arduino.h>

constexpr uint8_t kSensorPin = 4;

void setup() {
  Serial0.begin(115200);
  pinMode(kSensorPin, INPUT);
  analogReadResolution(12);
  analogSetPinAttenuation(kSensorPin, ADC_11db);
  delay(1000);
  Serial0.println("SENSOR_CHECK: GPIO4, 12-bit raw ADC, 100ms interval");
  Serial0.println("uptime_ms,head_raw");
}

void loop() {
  const uint16_t raw = analogRead(kSensorPin);
  Serial0.printf("%lu,%u\n", static_cast<unsigned long>(millis()), raw);
  delay(100);
}
