#pragma once
#include <Arduino.h>

class HallSensor {
public:
    explicit HallSensor(uint8_t pin);
    void begin();
    
    // Returns true when magnet triggers the sensor (active LOW)
    bool isTriggered() const;

    // Returns raw digital reading (0 = LOW, 1 = HIGH)
    int readRaw() const;

private:
    uint8_t _pin;
};
