#pragma once

// ============================================================================
// SurfClock Hardware Configuration (Dual Physical Actuators)
// Target Board: Freenove ESP32-S3 WROOM (8MB Flash / 8MB PSRAM)
// ============================================================================

// --- Motor 1: Surf Break Pointer (Full 360° Dial, 1-12) ---
#define PIN_MOTOR_IN1         4
#define PIN_MOTOR_IN2         5
#define PIN_MOTOR_IN3         6
#define PIN_MOTOR_IN4         7
#define PIN_HALL_SENSOR       10        // Break datum (12 o'clock)

// --- Motor 2: Conditions Gauge (180° Semi-circle Subdial, 1-10) ---
#define PIN_GAUGE_IN1         11
#define PIN_GAUGE_IN2         12
#define PIN_GAUGE_IN3         13
#define PIN_GAUGE_IN4         14
#define PIN_GAUGE_HALL        15        // Conditions datum (Rating 1 mark)

// --- Stepper Kinematics & Mechanics ---
#define STEPS_PER_REV         2048
#define GAUGE_SPAN_STEPS      1024      // 180-degree semi-circle span (rating 1 to 10)

#define MOTOR_MAX_SPEED       250.0f    // steps / second (lower speed = 2.5x higher torque)
#define MOTOR_ACCELERATION    150.0f    // steps / second^2
#define GAUGE_MAX_SPEED       200.0f    // steps / second
#define GAUGE_ACCELERATION    100.0f

#define COIL_POWERDOWN_DELAY  2000      // milliseconds

// --- Network & API Configuration ---
#define DEFAULT_WIFI_SSID     "YOUR_WIFI_SSID"
#define DEFAULT_WIFI_PASS     "YOUR_WIFI_PASSWORD"

// Public Cloudflare Worker scoring service (or your self-hosted instance)
#define DEFAULT_API_URL       "https://surfclock.eggbot.net/api/surf"

#define POLL_INTERVAL_MS      60000
#define SERIAL_BAUD_RATE      115200
