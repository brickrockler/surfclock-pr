/**
 * Surf Clock (Minimalist Gallery Monolith Gallery Frame Edition)
 * Magnet-Free ESP32-S3 Firmware using RTC_DATA_ATTR + NVS Flash (Preferences)
 *
 * Actuators:
 *   - Upper Stepper (28BYJ-48 + ULN2003): Beach Indicator (360° dial)
 *     0° (12 o'clock) = LONG REEF
 *     +60°            = DEE WHY
 *     +120°           = CURL CURL
 *     -120° (240°)    = FRESHIE
 *     -60°  (300°)    = QUEENSCLIFF
 *   - Lower Stepper (28BYJ-48 + ULN2003): Conditions Sub-Dial (180° arc)
 *     -90° (9 o'clock) = Rating 1
 *     +90° (3 o'clock) = Rating 10
 */

#include <Arduino.h>
#include <Preferences.h>
#include <esp_sleep.h>

static constexpr int32_t STEPS_PER_REV = 4096; // 28BYJ-48 half-step mode

// ULN2003 Driver Pins on ESP32-S3 (IN1, IN2, IN3, IN4)
static constexpr uint8_t BEACH_PINS[4] = {4, 5, 6, 7};
static constexpr uint8_t COND_PINS[4]  = {15, 16, 17, 18};
static constexpr uint8_t ZERO_BUTTON_PIN = 0; // Built-in BOOT button for manual 12-o'clock trim

// Persists in 8 KB RTC SRAM across esp_deep_sleep_start() with zero flash wear
RTC_DATA_ATTR int32_t rtc_beach_step = 0;
RTC_DATA_ATTR int32_t rtc_cond_step  = 0;
RTC_DATA_ATTR uint32_t rtc_magic     = 0;
static constexpr uint32_t MAGIC_VALID = 0x53555246; // "SURF"

Preferences prefs;

static const uint8_t HALF_STEP_SEQ[8][4] = {
  {1, 0, 0, 0},
  {1, 1, 0, 0},
  {0, 1, 0, 0},
  {0, 1, 1, 0},
  {0, 0, 1, 0},
  {0, 0, 1, 1},
  {0, 0, 0, 1},
  {1, 0, 0, 1}
};

void deenergizeCoils(const uint8_t pins[4]) {
  for (int i = 0; i < 4; i++) digitalWrite(pins[i], LOW);
}

void stepMotor(const uint8_t pins[4], int32_t &current_step, int32_t target_step) {
  int32_t delta = target_step - current_step;
  if (delta == 0) return;
  int8_t dir = (delta > 0) ? 1 : -1;
  uint32_t steps = abs(delta);
  for (uint32_t s = 0; s < steps; s++) {
    current_step += dir;
    uint8_t phase = ((current_step % 8) + 8) % 8;
    for (int c = 0; c < 4; c++) {
      digitalWrite(pins[c], HALF_STEP_SEQ[phase][c]);
    }
    delayMicroseconds(1800); // Smooth, silent torque for razor-thin PLA hands
  }
  deenergizeCoils(pins); // Cut coil current to 0 mA before sleep
}

int32_t degToSteps(float degrees) {
  return (int32_t)roundf((degrees / 360.0f) * STEPS_PER_REV);
}

void restoreOrInitPositions() {
  prefs.begin("surfclock", false);
  if (rtc_magic != MAGIC_VALID) {
    // Cold boot or battery swap: restore last saved step counts from NVS Flash
    rtc_beach_step = prefs.getInt("beach_step", 0);
    rtc_cond_step  = prefs.getInt("cond_step", 0);
    rtc_magic      = MAGIC_VALID;
  }
}

void savePositionsToNVS() {
  // Commit to NVS Flash only when step count actually changes
  if (prefs.getInt("beach_step", 0) != rtc_beach_step) {
    prefs.putInt("beach_step", rtc_beach_step);
  }
  if (prefs.getInt("cond_step", 0) != rtc_cond_step) {
    prefs.putInt("cond_step", rtc_cond_step);
  }
}

void moveHandsToForecast(float beach_angle_deg, float conditions_rating_1_to_10) {
  float clamped_rating = constrain(conditions_rating_1_to_10, 1.0f, 10.0f);
  // Map 1..10 onto -90 deg (left) .. +90 deg (right)
  float cond_angle_deg = -90.0f + ((clamped_rating - 1.0f) / 9.0f) * 180.0f;

  int32_t target_beach = degToSteps(beach_angle_deg);
  int32_t target_cond  = degToSteps(cond_angle_deg);

  stepMotor(BEACH_PINS, rtc_beach_step, target_beach);
  stepMotor(COND_PINS,  rtc_cond_step,  target_cond);
  savePositionsToNVS();
}

void setup() {
  Serial.begin(115200);
  pinMode(ZERO_BUTTON_PIN, INPUT_PULLUP);
  for (int i = 0; i < 4; i++) {
    pinMode(BEACH_PINS[i], OUTPUT);
    pinMode(COND_PINS[i], OUTPUT);
  }

  restoreOrInitPositions();

  // Hold BOOT button at wake to zero current hand alignment as (LONG REEF 0°, Conditions Center 5.5)
  if (digitalRead(ZERO_BUTTON_PIN) == LOW) {
    rtc_beach_step = 0;
    rtc_cond_step  = 0;
    savePositionsToNVS();
  }

  // Example forecast update: DEE WHY (+60.0°) with 8.0/10 Conditions
  moveHandsToForecast(60.0f, 8.0f);

  prefs.end();
  // Sleep for 30 minutes (retaining rtc_beach_step & rtc_cond_step in RTC SRAM)
  esp_sleep_enable_timer_wakeup(30ULL * 60ULL * 1000000ULL);
  esp_deep_sleep_start();
}

void loop() {}
