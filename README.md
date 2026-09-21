# 🌊 SurfClock: Ambient Connected Physical Computing Display

SurfClock transforms a wall clock into an ambient, dual-actuator physical surf monitor. Rather than showing time, mechanical pointers dynamically track optimal Northern Beaches surf conditions in real-time, translating multi-factor marine buoy telemetry into an instant physical glance.

```
 [Open-Meteo Marine & Weather APIs] (Swell Height, Period, Direction, Wind, Gusts)
                    │
                    ▼
   [Cloudflare Worker / Edge Pipeline] (Scores breaks & conditions -> surfclock.eggbot.net)
                    │
                    ▼ HTTP GET / Wi-Fi (every 60s)
          [Freenove ESP32-S3]
         ┌──────────┴──────────┐
         ▼                     ▼
[Motor 1: Break Pointer]   [Motor 2: Conditions Gauge]
(0°, 60°, 120°, 240°, 300°)   (180° Subdial, 1.0 – 10.0 Rating)
         ▲                     ▲
         │ (GPIO 10)           │ (GPIO 15)
[Break Hall Sensor]       [Gauge Hall Sensor]
```

---

## 🏄 Clock Face Layout

| Position | Break Name | Dial Angle | Optimal Swell | Optimal Wind |
| :---: | :--- | :---: | :--- | :--- |
| **1** | **Long Reef** | **0° (12 o'clock)** | E-NE swell | W-SW wind (Offshore) |
| **2** | **Dee Why** | **60° (2 o'clock)** | S-SE swell | W-NW wind |
| **3** | **Curl Curl** | **120° (4 o'clock)** | S swell magnet | W-SW wind |
| **4** | **Freshwater** | **240° (8 o'clock)** | E-SE swell | W-SW wind |
| **5** | **Queenscliff** | **300° (10 o'clock)** | S-SE swell | W-SW wind |
| **–** | **Conditions Gauge**| **180° (6 o'clock)** | *Subdial Needle* | *1.0 (Poor) to 10.0 (Epic)* |

---

## ⚡ Features & Architecture

- **Dual-Actuator Hardware**: Two 28BYJ-48 5V stepper motors driven by ULN2003 Darlington arrays.
- **Magnetic Datum Calibrations**: Two HW-477 / A3144 Hall-effect sensors ensure zero-drift homing on startup and periodic calibration.
- **Edge Serverless Scoring**: Scored on Cloudflare Workers deployed at [`https://surfclock.eggbot.net`](https://surfclock.eggbot.net) with `/api/surf`.
- **Local Fallback Pipeline**: Pure Python local server (`server/server.py`) for offline or development use.
- **Live Web Mirror**: Real-time web simulation mirroring the physical clock dial at `surfclock.eggbot.net` with "wait-time" minimal aesthetic and scoring breakdown tooltips.

---

## 🚀 Quick Start

### 1. Hardware Connections
See [docs/WIRING.md](docs/WIRING.md) for full schematics.
- **Motor 1 (Break Hand)**: IN1..IN4 ➔ GPIO 4, 5, 6, 7
- **Sensor 1 (Break Datum)**: Signal ➔ GPIO 10 (`INPUT_PULLUP`)
- **Motor 2 (Conditions Gauge)**: IN1..IN4 ➔ GPIO 11, 12, 13, 14
- **Sensor 2 (Gauge Datum)**: Signal ➔ GPIO 15 (`INPUT_PULLUP`)
- **Power**: 5V rail for stepper drivers, 3.3V for sensors, common ground across all modules.

### 2. Firmware (PlatformIO)
```bash
cd firmware
pio run -t upload
pio device monitor -b 115200
```
Interactive Serial CLI commands:
- `status` : Read step positions, target angles, sensor states, Wi-Fi status.
- `pos <1-5>` : Manually rotate main break hand.
- `gauge <1.0-10.0>` : Set conditions gauge rating.
- `home` : Perform dual-motor homing sequence.
- `wifi <SSID> <PASSWORD>` : Configure Wi-Fi credentials to NVS storage.
- `api <URL>` : Set custom API scoring URL.

### 3. Cloudflare Worker Deployment
```bash
cd cloudflare-worker
npx wrangler deploy
```

---

## 📐 Break Scoring Algorithm

Surf quality (0–100 total score, mapped to a 1.0–10.0 gauge rating) is calculated using:
1. **Swell Height (0–35 pts)**: Evaluated against each beach's ideal wave envelope.
2. **Swell Period (0–25 pts)**: Longer-period groundswell (11s – 16s+) rewards clean organized sets over wind chop.
3. **Swell Direction (0–15 pts)**: Rewards angles matching bay / headland bathymetry.
4. **Wind & Cleanliness (-15 to +25 pts)**: Clean offshore wind grooms faces (+25 pts); strong onshore incurs chop / blowout penalty (-15 pts).

---

by egg
