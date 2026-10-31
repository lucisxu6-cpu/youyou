// First test: USB/UART only. No sensors or Wi-Fi are used.
// Waveshare ESP32-S3-DEV-KIT-N8R8: CH343 port, 115200 baud.
#include <Arduino.h>

uint32_t count = 0;

void setup() {
  Serial0.begin(115200);
  delay(1000);
  Serial0.println("BOARD_CHECK: START OK");
  Serial0.printf("Flash: %u bytes; PSRAM: %u bytes\n",
                 ESP.getFlashChipSize(), ESP.getPsramSize());
}

void loop() {
  Serial0.printf("BOARD_CHECK: count=%lu uptime_ms=%lu\n",
                 static_cast<unsigned long>(++count),
                 static_cast<unsigned long>(millis()));
  delay(1000);
}
