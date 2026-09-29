#pragma once
#include <Arduino.h>
#include <AccelStepper.h>
#include "config.h"
#include "hall_sensor.h"

enum HomingState {
    HOMING_STATE_IDLE,
    HOMING_STATE_SEEKING,
    HOMING_STATE_BACKOFF,
    HOMING_STATE_FINE,
    HOMING_STATE_DONE,
    HOMING_STATE_FAILED
};

class StepperController {
public:
    explicit StepperController(HallSensor& hall);
    void begin();
    void update(); // Must be called continuously in loop()

    // Homing & Sensor Seeking
    void startHoming(bool clockwise = false);
    void startSeek(bool clockwise);
    bool isHomed() const { return _isHomed; }
    bool isMoving() { return _stepper.isRunning(); }
    HomingState getHomingState() const { return _homingState; }

    // Navigation
    bool setBeachPosition(int pos); // 1 to 5 (or 12 for Long Reef)
    bool moveToAngle(float degrees); // 0.0 to 360.0 degrees
    int getCurrentBeachPos() const { return _currentBeachPos; }
    long getCurrentSteps() { return _stepper.currentPosition(); }
    long getTargetSteps() { return _stepper.targetPosition(); }

    // Manual motion & testing
    void moveRelative(long steps);
    void freeCoils();
    void holdCoils();
    void setHoldTorque(bool enabled) { _keepHoldingTorque = enabled; }
    bool isHoldTorqueEnabled() const { return _keepHoldingTorque; }
    void testCoilSequence();
    void setAllCoils(bool high);

    // Continuous sweep demo mode
    void toggleSweepDemo();
    bool isSweepDemoActive() const { return _sweepDemo; }

    // Manual datum lock
    void zeroDatum();
    void calibrateCurrentAsBeach(int pos);
    void savePositionToNvs();
    void loadPositionFromNvs();

private:
    HallSensor& _hall;
    AccelStepper _stepper;
    bool _isHomed;
    int _currentBeachPos;
    HomingState _homingState;
    long _homingStartStep;
    int _homingDirection; // +1 for CW, -1 for CCW
    unsigned long _stationaryStartTime;
    bool _coilsEnergized;
    bool _keepHoldingTorque;
    bool _sweepDemo;
    unsigned long _lastSweepStepTime;
    int _sweepTargetIndex;

    void enableCoils();
    void disableCoils();
    long normalizeStep(long step) const;
};
