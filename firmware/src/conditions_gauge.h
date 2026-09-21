#pragma once
#include <Arduino.h>
#include <AccelStepper.h>
#include "config.h"

class ConditionsGauge {
public:
    ConditionsGauge(uint8_t in1, uint8_t in2, uint8_t in3, uint8_t in4, uint8_t hallPin);
    void begin();
    void update(); // Must be called in loop()

    // Gauge Motion & Homing
    void startHoming(bool clockwise = false);
    void startSeek(bool clockwise);
    bool setRating(float rating); // 1.0 to 10.0
    float getCurrentRating() const { return _currentRating; }
    long getCurrentSteps() { return _stepper.currentPosition(); }
    long getTargetSteps() { return _stepper.targetPosition(); }
    bool isMoving() { return _stepper.isRunning(); }
    bool isHomed() const { return _isHomed; }

    // Sensor reading
    bool isHallTriggered() const;
    int readHallRaw() const;
    void zeroDatum();

    // Manual coil controls
    void freeCoils();
    void holdCoils();
    void moveRelative(long steps);

private:
    uint8_t _in1, _in2, _in3, _in4, _hallPin;
    AccelStepper _stepper;
    bool _isHomed;
    float _currentRating;
    bool _isSeeking;
    int _seekDirection;
    unsigned long _stationaryStartTime;
    bool _coilsEnergized;
    bool _keepHoldingTorque;

    void enableCoils();
    void disableCoils();
};
