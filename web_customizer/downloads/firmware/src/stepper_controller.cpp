#include <Preferences.h>
#include "stepper_controller.h"

StepperController::StepperController(HallSensor& hall)
    : _hall(hall),
      // 28BYJ-48 wire sequence: IN1, IN3, IN2, IN4
      _stepper(AccelStepper::FULL4WIRE, PIN_MOTOR_IN1, PIN_MOTOR_IN3, PIN_MOTOR_IN2, PIN_MOTOR_IN4),
      _isHomed(false),
      _currentBeachPos(12),
      _homingState(HOMING_STATE_IDLE),
      _homingStartStep(0),
      _homingDirection(-1),
      _stationaryStartTime(0),
      _coilsEnergized(false),
      _keepHoldingTorque(false),
      _sweepDemo(false),
      _lastSweepStepTime(0),
      _sweepTargetIndex(0)
{}

void StepperController::begin() {
    pinMode(PIN_MOTOR_IN1, OUTPUT);
    pinMode(PIN_MOTOR_IN2, OUTPUT);
    pinMode(PIN_MOTOR_IN3, OUTPUT);
    pinMode(PIN_MOTOR_IN4, OUTPUT);
    _stepper.setMaxSpeed(MOTOR_MAX_SPEED);
    _stepper.setAcceleration(MOTOR_ACCELERATION);
    loadPositionFromNvs();
    _isHomed = true;
    disableCoils();
}

void StepperController::loadPositionFromNvs() {
    Preferences prefs;
    prefs.begin("surf_step", false);
    long savedStep = prefs.getLong("beach_step", 0);
    int savedPos = prefs.getInt("beach_pos", 1);
    prefs.end();

    _stepper.setCurrentPosition(savedStep);
    _currentBeachPos = savedPos;
    Serial.printf("[MOTOR] Restored from NVS: Step %ld (Pos %d)\n", savedStep, savedPos);
}

void StepperController::savePositionToNvs() {
    Preferences prefs;
    prefs.begin("surf_step", false);
    prefs.putLong("beach_step", _stepper.currentPosition());
    prefs.putInt("beach_pos", _currentBeachPos);
    prefs.end();
    Serial.printf("[MOTOR] Persisted to NVS: Step %ld (Pos %d)\n", _stepper.currentPosition(), _currentBeachPos);
}

void StepperController::zeroDatum() {
    _stepper.stop();
    _stepper.setCurrentPosition(0);
    _isHomed = true;
    _currentBeachPos = 1;
    _homingState = HOMING_STATE_DONE;
    _stationaryStartTime = millis();
    savePositionToNvs();
    Serial.println("[MOTOR] Current position locked as 12 o'clock datum (Step 0) & saved to NVS!");
}
void StepperController::calibrateCurrentAsBeach(int pos) {
    long step = 0;
    const char* name = "Long Reef";
    switch (pos) {
        case 1:
        case 12: step = 0; name = "Long Reef"; break;
        case 2:  step = 359; name = "Dee Why"; break;
        case 3:  step = 677; name = "Curl Curl"; break;
        case 4:  step = 1345; name = "Freshie"; break;
        case 5:  step = 1682; name = "Queenscliff"; break;
        default:
            Serial.printf("[MOTOR] Invalid beach pos for calibration: %d\n", pos);
            return;
    }
    _stepper.stop();
    _stepper.setCurrentPosition(step);
    _currentBeachPos = pos;
    _isHomed = true;
    savePositionToNvs();
    Serial.printf("[MOTOR] 🎯 Current physical position calibrated as %s (Pos %d, Step %ld) & saved to NVS!\n",
                  name, pos, step);
}

void StepperController::enableCoils() {
    if (!_coilsEnergized) {
        _stepper.enableOutputs();
        _coilsEnergized = true;
    }
}

void StepperController::disableCoils() {
    _stepper.disableOutputs();
    digitalWrite(PIN_MOTOR_IN1, LOW);
    digitalWrite(PIN_MOTOR_IN2, LOW);
    digitalWrite(PIN_MOTOR_IN3, LOW);
    digitalWrite(PIN_MOTOR_IN4, LOW);
    _coilsEnergized = false;
}

void StepperController::setAllCoils(bool high) {
    _stepper.stop();
    pinMode(PIN_MOTOR_IN1, OUTPUT);
    pinMode(PIN_MOTOR_IN2, OUTPUT);
    pinMode(PIN_MOTOR_IN3, OUTPUT);
    pinMode(PIN_MOTOR_IN4, OUTPUT);
    digitalWrite(PIN_MOTOR_IN1, high ? HIGH : LOW);
    digitalWrite(PIN_MOTOR_IN2, high ? HIGH : LOW);
    digitalWrite(PIN_MOTOR_IN3, high ? HIGH : LOW);
    digitalWrite(PIN_MOTOR_IN4, high ? HIGH : LOW);
    _coilsEnergized = high;
    Serial.printf("[COILS] All 4 coils forced %s\n", high ? "HIGH" : "LOW");
}

void StepperController::holdCoils() {
    enableCoils();
    _keepHoldingTorque = true;
    Serial.println("[COILS] Holding torque enabled.");
}

long StepperController::normalizeStep(long step) const {
    long mod = step % STEPS_PER_REV;
    if (mod < 0) mod += STEPS_PER_REV;
    return mod;
}

void StepperController::startHoming(bool clockwise) {
    startSeek(clockwise);
}

void StepperController::startSeek(bool clockwise) {
    if (_hall.isTriggered()) {
        _stepper.stop();
        Serial.println("[SEEK] 🎯 Hall sensor ALREADY triggered! Locking step 0 at 12 o'clock.");
        _stepper.setCurrentPosition(0);
        _isHomed = true;
        _currentBeachPos = 1;
        _homingState = HOMING_STATE_DONE;
        _stationaryStartTime = millis();
        return;
    }

    _homingDirection = clockwise ? 1 : -1;
    Serial.printf("[SEEK] Crawling %s (720° / 4096 steps) seeking HW-477 Hall sensor...\n",
                  clockwise ? "CLOCKWISE (CW)" : "COUNTER-CLOCKWISE (CCW)");

    enableCoils();
    _stepper.setMaxSpeed(280.0f); // Steady crawl speed
    _stepper.setAcceleration(MOTOR_ACCELERATION);
    _homingStartStep = _stepper.currentPosition();
    _homingState = HOMING_STATE_SEEKING;
    // Move exactly 720° (2 full revolutions = 4096 steps)
    _stepper.moveTo(_homingStartStep + (_homingDirection * (2 * STEPS_PER_REV)));
}

bool StepperController::setBeachPosition(int pos) {
    float angle = 0.0f;
    const char* name = "Unknown";
    switch (pos) {
        case 1:
        case 12:
            angle = 0.0f; name = "Long Reef"; break;        // Step 0 (12:00 datum)
        case 2:
            angle = 63.1f; name = "Dee Why"; break;         // Step 359
        case 3:
            angle = 119.0f; name = "Curl Curl"; break;      // Step 677
        case 4:
            angle = 236.4f; name = "Freshie"; break;        // Step 1345
        case 5:
            angle = 295.7f; name = "Queenscliff"; break;    // Step 1682
        default:
            Serial.printf("[MOTOR] Invalid beach position: %d (use 1:LongReef, 2:DeeWhy, 3:CurlCurl, 4:Freshie, 5:Queenscliff)\n", pos);
            return false;
    }

    _currentBeachPos = pos;
    Serial.printf("[MOTOR] 🏄 %s (Pos %d, Target %.1f°)\n", name, pos, angle);
    return moveToAngle(angle);
}

bool StepperController::moveToAngle(float degrees) {
    while (degrees < 0.0f) degrees += 360.0f;
    while (degrees >= 360.0f) degrees -= 360.0f;

    enableCoils();
    _stepper.setMaxSpeed(MOTOR_MAX_SPEED);
    _stepper.setAcceleration(MOTOR_ACCELERATION);

    long targetDialStep = round((degrees / 360.0f) * (float)STEPS_PER_REV);
    long currentDialStep = normalizeStep(_stepper.currentPosition());

    long diff = targetDialStep - currentDialStep;
    if (diff > (STEPS_PER_REV / 2)) {
        diff -= STEPS_PER_REV;
    } else if (diff < -(STEPS_PER_REV / 2)) {
        diff += STEPS_PER_REV;
    }

    long targetAbsoluteStep = _stepper.currentPosition() + diff;
    _stepper.moveTo(targetAbsoluteStep);

    Serial.printf("[MOTOR] Angle: %.1f° | Dial Step: %ld | Travel: %+ld steps\n",
                  degrees, targetDialStep, diff);
    return true;
}

void StepperController::moveRelative(long steps) {
    enableCoils();
    _stepper.setMaxSpeed(MOTOR_MAX_SPEED);
    _stepper.setAcceleration(MOTOR_ACCELERATION);
    _stepper.move(steps);
    Serial.printf("[MOTOR] Moving relative %+ld steps\n", steps);
}

void StepperController::freeCoils() {
    _stepper.stop();
    _keepHoldingTorque = false;
    _sweepDemo = false;
    _homingState = HOMING_STATE_IDLE;
    disableCoils();
    Serial.println("[MOTOR] Stepper coils powered down.");
}

void StepperController::testCoilSequence() {
    Serial.println("[TEST] Cycling ULN2003 coil outputs (IN1 -> IN2 -> IN3 -> IN4)...");
    const uint8_t pins[] = {PIN_MOTOR_IN1, PIN_MOTOR_IN2, PIN_MOTOR_IN3, PIN_MOTOR_IN4};
    for (int p = 0; p < 4; p++) pinMode(pins[p], OUTPUT);
    for (int cycle = 0; cycle < 3; cycle++) {
        for (int p = 0; p < 4; p++) {
            for (int i = 0; i < 4; i++) digitalWrite(pins[i], (i == p) ? HIGH : LOW);
            Serial.printf("  LED/Coil IN%d active\n", p + 1);
            delay(400);
        }
    }
    disableCoils();
    Serial.println("[TEST] Coil test complete.");
}

void StepperController::toggleSweepDemo() {
    _sweepDemo = !_sweepDemo;
    if (_sweepDemo) {
        Serial.println("[DEMO] Continuous sweep demo STARTED.");
        _sweepTargetIndex = 0;
        setBeachPosition(1);
    } else {
        Serial.println("[DEMO] Sweep demo STOPPED.");
        freeCoils();
    }
}

void StepperController::update() {
    // 1. Handle Active Sensor Seeking
    if (_homingState == HOMING_STATE_SEEKING) {
        if (_hall.isTriggered()) {
            _stepper.stop();
            Serial.printf("[SEEK] 🎯 Hall sensor TRIPPED at step %ld! Locking step 0 at 12 o'clock.\n",
                          _stepper.currentPosition());
            _stepper.setCurrentPosition(0);
            _isHomed = true;
            _currentBeachPos = 1;
            _homingState = HOMING_STATE_DONE;
            _stationaryStartTime = millis();
        } else if (_stepper.distanceToGo() == 0) {
            _stepper.stop();
            Serial.println("[SEEK] 720° completed without Hall trigger. Locking Step 0 datum at 12 o'clock!");
            _stepper.setCurrentPosition(0);
            _isHomed = true;
            _currentBeachPos = 1;
            _homingState = HOMING_STATE_DONE;
            _stationaryStartTime = millis();
        }
    }

    // 2. Continuous Stepper Motion Pulse Generator
    _stepper.run();

    // 3. Continuous Sweep Demo Logic
    if (_sweepDemo && _stepper.distanceToGo() == 0) {
        if (_lastSweepStepTime == 0) {
            _lastSweepStepTime = millis();
        } else if (millis() - _lastSweepStepTime > 1500) {
            const int targets[] = {1, 4, 7, 10, 12};
            _sweepTargetIndex = (_sweepTargetIndex + 1) % 5;
            setBeachPosition(targets[_sweepTargetIndex]);
            _lastSweepStepTime = 0;
        }
    }

    // 4. Power Saving Logic
    if (_stepper.distanceToGo() == 0 && !_keepHoldingTorque && !_sweepDemo && _homingState != HOMING_STATE_SEEKING) {
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
