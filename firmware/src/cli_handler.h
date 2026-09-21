#pragma once
#include <Arduino.h>
#include "stepper_controller.h"
#include "conditions_gauge.h"
#include "hall_sensor.h"
#include "network_manager.h"

class CliHandler {
public:
    CliHandler(StepperController& stepper, ConditionsGauge& gauge, HallSensor& hall, NetworkManager& net);
    void begin();
    void update();

private:
    StepperController& _stepper;
    ConditionsGauge& _gauge;
    HallSensor& _hall;
    NetworkManager& _net;
    String _inputBuffer;

    void processCommand(const String& cmd);
    void printHelp();
    void printStatus();
};
