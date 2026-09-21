# SurfClock Hardware & Wiring Guide

This document details the complete electrical connections, pinouts, and assembly procedures for the **SurfClock** physical computing ambient display.

---

## 1. Pin Interface Mapping

| Component | Pin / Terminal | ESP32-S3 Pin | Function / Description |
| :--- | :--- | :--- | :--- |
| **ULN2003 Driver** | **IN1** | **GPIO 4** | Stepper Coil Phase A (Blue) |
| **ULN2003 Driver** | **IN2** | **GPIO 5** | Stepper Coil Phase B (Pink) |
| **ULN2003 Driver** | **IN3** | **GPIO 6** | Stepper Coil Phase C (Yellow) |
| **ULN2003 Driver** | **IN4** | **GPIO 7** | Stepper Coil Phase D (Orange) |
| **ULN2003 Driver** | **+ (VCC)** | **5V / VBUS** | 5V DC Motor Power Rail |
| **ULN2003 Driver** | **- (GND)** | **GND** | System Ground (Common) |
| **HW-477 Hall Sensor**| **OUT / S** | **GPIO 10** | Datum Trigger (`INPUT_PULLUP`, Active LOW) |
| **HW-477 Hall Sensor**| **+ (VCC)** | **3.3V** | Sensor Logic Power |
| **HW-477 Hall Sensor**| **- (GND)** | **GND** | Sensor Ground |

---

## 2. Power Distribution Architecture

```
                 [ 5V USB-C Power ]
                         │
         ┌───────────────┴───────────────┐
         ▼                               ▼
  [ ESP32-S3 Board ]             [ ULN2003 Driver ]
    • 5V / VBUS Pin                • + (5V VCC Pin)
    • GND Pin ─────────────────────• - (GND Pin)
    • 3.3V Out ──> HW-477 VCC
```

> [!NOTE]
> **Coil Heat Mitigation:**
> In normal operation, a 28BYJ-48 stepper continuously sinks ~240mA when coils are energized, generating unnecessary heat on an ambient wall clock.
> SurfClock firmware automatically disables coil outputs (`disableOutputs()`) 2 seconds after the hand reaches its target. Coils re-energize instantaneously when the next update begins.

---

## 3. Mechanical Assembly & Datum Setup

1. **Movement Replacement:** Remove the original battery-powered quartz movement from the wall clock.
2. **Motor Mounting:** Mount the 5V 28BYJ-48 stepper dead-centre behind the dial using M3 screws or hot-bracket mounting.
3. **HW-477 Hall Sensor Placement:** Affix the HW-477 sensor behind the clock dial directly at the **12 o'clock** mark.
4. **Pointer Hand & Magnet:**
   - Embed a small neodymium disc magnet (e.g. 3mm × 1mm) into the underside hub of the 3D-printed or custom clock hand.
   - Press-fit the hand onto the 5mm flatted shaft so that when the hand points to 12 o'clock, the magnet sweeps within 1–2 mm of the Hall sensor face.
5. **Homing Calibration:** On boot, the firmware crawls counter-clockwise until the magnet pulls GPIO 10 to LOW, backs off 40 steps, re-approaches slowly, and zeroes step 0 at 12 o'clock.

---

## 4. Interactive Serial Diagnostic Commands

Connect to the ESP32-S3 over USB at **115200 baud**:

- `status` : Print real-time step position, target, homing status, Hall pin reading, Wi-Fi status, and free RAM.
- `pos <1-12>` : Manually command the clock hand to a specific beach position (1 to 12).
- `home` : Re-run the calibration homing sweep seeking 12 o'clock datum.
- `hall` : Read real-time state of the Hall sensor (0 = Magnet detected, 1 = Idle).
- `test_coils` : Sequentially pulses IN1, IN2, IN3, IN4 to inspect the driver board LEDs.
- `step <N>` : Relative manual stepping (+ for CW, - for CCW).
- `wifi <SSID> <PASSWORD>` : Save and connect to local Wi-Fi (persists in flash memory).
- `api <URL>` : Save custom scoring API URL (persists in flash memory).
- `scan` : Scan and list 2.4GHz Wi-Fi networks in range with signal strengths.
- `poll` : Trigger an immediate HTTP GET request to the scoring server.
- `free` : Immediately power down stepper coils.
