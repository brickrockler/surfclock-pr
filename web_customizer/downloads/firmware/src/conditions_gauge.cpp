#include <Preferences.h>
#include "conditions_gauge.h"

ConditionsGauge::ConditionsGauge(uint8_t in1, uint8_t in2, uint8_t in3, uint8_t in4, uint8_t hallPin)
    : _in1(in1), _in2(in2), _in3(in3), _in4(in4), _hallPin(hallPin),
      // 28BYJ-48 wire sequence: IN1, IN3, IN2, IN4
      _stepper(AccelStepper::FULL4WIRE, in1, in3, in2, in4),
      _isHomed(false),
      _currentRating(1.0f),
      _isSeeking(false),
      _seekDirection(-1),
      _stationaryStartTime(0),
      _coilsEnergized(false),
      _keepHoldingTorque(false)
{}

void ConditionsGauge::begin() {
    pinMode(_in1, OUTPUT);
    pinMode(_in2, OUTPUT);
    pinMode(_in3, OUTPUT);
    pinMode(_in4, OUTPUT);
    pinMode(_hallPin, INPUT_PULLUP);
    _stepper.setMaxSpeed(GAUGE_MAX_SPEED);
    _stepper.setAcceleration(GAUGE_ACCELERATION);
    loadPositionFromNvs();
    _isHomed = true;
    disableCoils();
}

void ConditionsGauge::loadPositionFromNvs() {
    Preferences prefs;
    prefs.begin("surf_gauge", false);
    long savedStep = prefs.getLong("gauge_step", 0);
    float savedRating = prefs.getFloat("gauge_rating", 1.0f);
    prefs.end();

    _stepper.setCurrentPosition(savedStep);
    _currentRating = savedRating;
    Serial.printf("[GAUGE] Restored from NVS: Step %ld (Rating %.1f)\n", savedStep, savedRating);
}

void ConditionsGauge::savePositionToNvs() {
    Preferences prefs;
    prefs.begin("surf_gauge", false);
    prefs.putLong("gauge_step", _stepper.currentPosition());
    prefs.putFloat("gauge_rating", _currentRating);
    prefs.end();
    Serial.printf("[GAUGE] Persisted to NVS: Step %ld (Rating %.1f)\n", _stepper.currentPosition(), _currentRating);
}

void ConditionsGauge::zeroDatum() {
    _stepper.stop();
    _stepper.setCurrentPosition(0);
    _isHomed = true;
    _currentRating = 1.0f;
    _isSeeking = false;
    savePositionToNvs();
    Serial.println("[GAUGE] Current position locked as Rating 1.0 datum (Step 0) & saved to NVS!");
}

bool ConditionsGauge::isHallTriggered() const {
    return digitalRead(_hallPin) == LOW;
}

int ConditionsGauge::readHallRaw() const {
    return digitalRead(_hallPin);
}

void ConditionsGauge::enableCoils() {
    if (!_coilsEnergized) {
        _stepper.enableOutputs();
        _coilsEnergized = true;
    }
}

void ConditionsGauge::disableCoils() {
    _stepper.disableOutputs();
    digitalWrite(_in1, LOW);
    digitalWrite(_in2, LOW);
    digitalWrite(_in3, LOW);
    digitalWrite(_in4, LOW);
    _coilsEnergized = false;
}

void ConditionsGauge::holdCoils() {
    enableCoils();
    _keepHoldingTorque = true;
    Serial.println("[GAUGE] Holding torque enabled.");
}

void ConditionsGauge::freeCoils() {
    _stepper.stop();
    _keepHoldingTorque = false;
    _isSeeking = false;
    disableCoils();
    Serial.println("[GAUGE] Stepper coils powered down.");
}
void ConditionsGauge::testCoilSequence() {
    Serial.println("[TEST GAUGE] Cycling ULN2003 coil outputs (11 -> 12 -> 13 -> 14)...");
    const uint8_t pins[] = {_in1, _in2, _in3, _in4};
    for (int p = 0; p < 4; p++) pinMode(pins[p], OUTPUT);
    for (int cycle = 0; cycle < 3; cycle++) {
        for (int p = 0; p < 4; p++) {
            for (int i = 0; i < 4; i++) digitalWrite(pins[i], (i == p) ? HIGH : LOW);
            Serial.printf("  Gauge Coil IN%d (GPIO %d) active\n", p + 1, pins[p]);
            delay(400);
        }
    }
    disableCoils();
    Serial.println("[TEST GAUGE] Coil test complete.");
}

void ConditionsGauge::startHoming(bool clockwise) {
    startSeek(clockwise);
}

void ConditionsGauge::startSeek(bool clockwise) {
    _seekDirection = clockwise ? 1 : -1;
    Serial.printf("[GAUGE] Crawling %s seeking HW-477 sensor (GPIO %d)...\n",
                  clockwise ? "CW" : "CCW", _hallPin);
    enableCoils();
    _stepper.setMaxSpeed(200.0f);
    _stepper.setAcceleration(GAUGE_ACCELERATION);
    _isSeeking = true;
    _stepper.moveTo(_stepper.currentPosition() + (_seekDirection * 3000));
}

bool ConditionsGauge::setRating(float rating) {
    if (rating < 1.0f) rating = 1.0f;
    if (rating > 10.0f) rating = 10.0f;

    enableCoils();
    _stepper.setMaxSpeed(GAUGE_MAX_SPEED);
    _stepper.setAcceleration(GAUGE_ACCELERATION);

    // Rating 1.0 = 0 steps, Rating 10.0 = GAUGE_SPAN_STEPS (1024)
    long targetStep = round((rating - 1.0f) * ((float)GAUGE_SPAN_STEPS / 9.0f));
    _stepper.moveTo(targetStep);
    _currentRating = rating;

    Serial.printf("[GAUGE] Target Rating: %.1f/10 | Target Step: %ld\n", rating, targetStep);
    return true;
}

void ConditionsGauge::moveRelative(long steps) {
    enableCoils();
    _stepper.setMaxSpeed(GAUGE_MAX_SPEED);
    _stepper.setAcceleration(GAUGE_ACCELERATION);
    _stepper.move(steps);
    Serial.printf("[GAUGE] Moving relative %+ld steps\n", steps);
}

void ConditionsGauge::update() {
    if (_isSeeking) {
        if (isHallTriggered()) {
            _stepper.stop();
            Serial.printf("[GAUGE] 🎯 Sensor TRIPPED! Step coordinate zeroed at Rating 1.0\n");
            _stepper.setCurrentPosition(0);
            _isHomed = true;
            _currentRating = 1.0f;
            _isSeeking = false;
            _stationaryStartTime = millis();
        } else if (_stepper.distanceToGo() == 0) {
            _stepper.stop();
            Serial.println("[GAUGE] Seek limit reached without trigger. Setting step 0 fallback.");
            _stepper.setCurrentPosition(0);
            _isHomed = true;
            _isSeeking = false;
            _stationaryStartTime = millis();
        }
    }

    _stepper.run();

    // Power saving when stationary
    if (_stepper.distanceToGo() == 0 && !_keepHoldingTorque && !_isSeeking) {
        if (_coilsEnergized) {
            if (_stationaryStartTime == 0) {
                _stationaryStartTime = millis();
            } else if (millis() - _stationaryStartTime > COIL_POWERDOWN_DELAY) {
                savePositionToNvs();
                disableCoils();
                _stationaryStartTime = 0;
            }
        }
    } else {
        _stationaryStartTime = 0;
    }
}
