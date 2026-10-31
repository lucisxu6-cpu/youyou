// USB pet protocol v1. No Wi-Fi, NVS, filesystem, OTA, Flash or eFuse writes.
// Only GPIO4, GPIO6, GPIO7 and GPIO5 are used, always as analog inputs.
#include <Arduino.h>
#include <esp_system.h>
#include <ctype.h>
#include <esp_err.h>

// Arduino 3.3.10 initializes NVS before setup(), and may erase it on error.
// The build script wraps that call and verifies the final ELF. Do not build
// without this guard: this USB-only firmware never needs persistent storage.
#ifndef PET_NO_NVS_INIT
#error Use pet-firmware.ps1 to build with the verified no-NVS linker guard.
#endif
#ifdef CONFIG_APP_ROLLBACK_ENABLE
// Official weak hook: this build has no OTA path and must not write boot metadata.
// The uploader separately requires the vendor's known ota_0 selection image.
extern "C" bool verifyRollbackLater(void) { return true; }
#endif
extern "C" esp_err_t __wrap_nvs_flash_init(void) { return ESP_ERR_NOT_SUPPORTED; }

constexpr uint8_t kPins[] = {4, 6, 7, 5}; // Physical channels; body assignment lives on the PC.
constexpr uint32_t kIntervalMs = 20;
constexpr uint32_t kLeaseMs = 5000;
char deviceId[24];
char bootId[17];
char challenge[33] = {};
char lineBuffer[96] = {};
size_t lineLength = 0;
bool lineOverflow = false;
bool streaming = false;
uint32_t lastSample = 0;
uint32_t lastPing = 0;
uint32_t sequence = 0;

bool validChallenge(const char* value) {
  if (strlen(value) != 32) return false;
  for (size_t i = 0; i < 32; ++i) {
    if (!isxdigit(static_cast<unsigned char>(value[i]))) return false;
  }
  return true;
}

void command(const char* line) {
  constexpr const char* hello = "PET/1 HELLO ";
  if (strncmp(line, hello, strlen(hello)) == 0 && validChallenge(line + strlen(hello))) {
    streaming = false;
    memcpy(challenge, line + strlen(hello), 33);
    Serial0.printf("{\"type\":\"hello\",\"protocol\":1,\"product\":\"loveandrobot.pet\",\"firmware\":\"1.1.1\",\"board\":\"esp32s3-n8r8\",\"device_id\":\"%s\",\"boot_id\":\"%s\",\"nonce\":\"%s\",\"pins\":[4,6,7,5],\"zones\":[\"head\",\"left_hand\",\"back\",\"right_hand\"],\"adc_bits\":12,\"sample_ms\":20}\n", deviceId, bootId, challenge);
    return;
  }
  if (challenge[0] == '\0') return;
  if (strncmp(line, "PET/1 START ", 12) == 0 && strcmp(line + 12, challenge) == 0) {
    streaming = true;
    lastPing = millis();
    lastSample = millis();
  } else if (strncmp(line, "PET/1 PING ", 11) == 0 && strcmp(line + 11, challenge) == 0) {
    lastPing = millis();
  } else if (strncmp(line, "PET/1 STOP ", 11) == 0 && strcmp(line + 11, challenge) == 0) {
    streaming = false;
  }
}

void setup() {
  Serial0.begin(115200);
  analogReadResolution(12);
  for (const uint8_t pin : kPins) {
    pinMode(pin, INPUT);
    analogSetPinAttenuation(pin, ADC_11db);
  }
  // Reads the factory identity. This does not program eFuses.
  snprintf(deviceId, sizeof(deviceId), "LR-%012llX", static_cast<unsigned long long>(ESP.getEfuseMac() & 0xFFFFFFFFFFFFULL));
  snprintf(bootId, sizeof(bootId), "%08lX%08lX", static_cast<unsigned long>(esp_random()), static_cast<unsigned long>(esp_random()));
}

void loop() {
  // Bound command work and line storage so malformed input cannot starve sampling.
  for (size_t budget = 0; budget < 64 && Serial0.available(); ++budget) {
    const char c = static_cast<char>(Serial0.read());
    if (c == '\n') {
      if (!lineOverflow) {
        if (lineLength && lineBuffer[lineLength - 1] == '\r') --lineLength;
        lineBuffer[lineLength] = '\0';
        command(lineBuffer);
      }
      lineLength = 0;
      lineOverflow = false;
    } else if (c == '\r') {
      // Only a final CRLF is accepted; an embedded CR invalidates the line.
      if (lineLength < sizeof(lineBuffer) - 1 && !lineOverflow) lineBuffer[lineLength++] = c;
      else lineOverflow = true;
    } else if (c < 32 || c > 126 || (lineLength && lineBuffer[lineLength - 1] == '\r')) {
      lineOverflow = true;
    } else {
      if (lineLength < sizeof(lineBuffer) - 1 && !lineOverflow) lineBuffer[lineLength++] = c;
      else lineOverflow = true;
    }
  }
  const uint32_t now = millis();
  if (streaming && static_cast<uint32_t>(now - lastPing) > kLeaseMs) streaming = false;
  if (streaming && static_cast<uint32_t>(now - lastSample) >= kIntervalMs) {
    lastSample = now;
    const uint16_t head = analogRead(kPins[0]);
    const uint16_t leftHand = analogRead(kPins[1]);
    const uint16_t back = analogRead(kPins[2]);
    const uint16_t rightHand = analogRead(kPins[3]);
    Serial0.printf("{\"type\":\"sample\",\"seq\":%lu,\"ms\":%lu,\"raw\":[%u,%u,%u,%u]}\n",
      static_cast<unsigned long>(sequence++), static_cast<unsigned long>(now),
      static_cast<unsigned>(head), static_cast<unsigned>(leftHand), static_cast<unsigned>(back), static_cast<unsigned>(rightHand));
  }
  delay(1);
}
