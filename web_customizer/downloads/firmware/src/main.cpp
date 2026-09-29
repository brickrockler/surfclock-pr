#include <Arduino.h>
#include "config.h"
#include "hall_sensor.h"
#include "stepper_controller.h"
#include "conditions_gauge.h"
#include "network_manager.h"
#include "cli_handler.h"

// System instances (Dual Actuators)
HallSensor breakHallSensor(PIN_HALL_SENSOR);
StepperController breakStepper(breakHallSensor);
ConditionsGauge conditionsGauge(PIN_GAUGE_IN1, PIN_GAUGE_IN2, PIN_GAUGE_IN3, PIN_GAUGE_IN4, PIN_GAUGE_HALL);
NetworkManager networkManager;
CliHandler cliHandler(breakStepper, conditionsGauge, breakHallSensor, networkManager);

// Network update callback (Updates both physical arms!)
void onSurfUpdate(const SurfPayload& payload) {
    if (payload.valid) {
        if (breakStepper.getHomingState() == HOMING_STATE_SEEKING) {
            Serial.println("[MAIN] Break hand is actively seeking Hall sensor; postponing network update.");
            return;
        }

        Serial.printf("[MAIN] Applying new surf conditions:\n");
        Serial.printf("       • Break Hand ➔ Pos %d (%s)\n", payload.beach_pos, payload.beach_name.c_str());
        Serial.printf("       • Conditions ➔ %.1f / 10 (%s)\n", payload.conditions_rating, payload.wind_condition.c_str());

        // Update Motor 1 (Break dial 1-5)
        breakStepper.setBeachPosition(payload.beach_pos);

        // Update Motor 2 (Conditions gauge 1.0-10.0)
        conditionsGauge.setRating(payload.conditions_rating);
    }
}

void setup() {
    Serial.begin(SERIAL_BAUD_RATE);
    delay(1500);

    Serial.println("\n=======================================================");
    Serial.println("  🌊 SurfClock Dual Physical Computing Display");
    Serial.println("  Dial 1: Break Pointer (1-12) | Pins 4,5,6,7 | Hall 10");
    Serial.println("  Dial 2: Conditions (1-10)    | Pins 11-14   | Hall 15");
    Serial.println("=======================================================");

    // 1. Initialize Break Pointer (Motor 1)
    breakHallSensor.begin();
    breakStepper.begin();

    // 2. Initialize Conditions Gauge (Motor 2)
    conditionsGauge.begin();
    Serial.println("[INIT] Dual actuators initialized.");

    // 3. Initialize Network Manager & register callback
    networkManager.setCallback(onSurfUpdate);
    networkManager.begin();

    // 4. Initialize CLI Console
    cliHandler.begin();

    // 5. Calibration / Homing Sweeps
    // (Auto-homing disabled on boot; use 'seek cw' / 'seek ccw' or 'zero' via CLI)
    Serial.println("[INIT] Datums initialized: Main at 12 o'clock, Gauge at Rating 1.0.");

    Serial.println("[INIT] System ready. Type 'help' for commands.\n");
}

void loop() {
    // 1. High-frequency pulse timing for both steppers
    breakStepper.update();
    conditionsGauge.update();

    // 2. Asynchronous Wi-Fi & marine forecast polling
    networkManager.update();

    // 3. Interactive Serial CLI
    cliHandler.update();
}
