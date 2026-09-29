#include "hall_sensor.h"

HallSensor::HallSensor(uint8_t pin) : _pin(pin) {}

void HallSensor::begin() {
    pinMode(_pin, INPUT_PULLUP);
}

bool HallSensor::isTriggered() const {
    // HW-477 pulls LOW when the magnetic field is detected
    return digitalRead(_pin) == LOW;
}

int HallSensor::readRaw() const {
    return digitalRead(_pin);
}
