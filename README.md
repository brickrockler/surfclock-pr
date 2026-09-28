# 🌊 SurfClock: Ambient Connected Physical Computing Display

SurfClock transforms a standard wall clock into an ambient, dual-actuator physical surf monitor. Rather than showing time, mechanical pointers dynamically track optimal local surf conditions in real-time, translating multi-factor marine buoy and meteorological telemetry into an instant physical glance.

```
 [Open-Meteo Marine & Weather APIs] (Swell Height, Period, Direction, Wind Speed/Direction)
                    │
                    ▼ (Free, no API key required)
   [Cloudflare Worker / Edge Pipeline] (Scores breaks & conditions -> /api/surf)
                    │
                    ▼ HTTP GET / Wi-Fi (every 60s)
               [ESP32-S3]
         ┌──────────┴──────────┐
         ▼                     ▼
[Motor 1: Break Pointer]   [Motor 2: Conditions Gauge]
(Full 360° Dial)           (180° Subdial: 1.0 – 10.0 Rating)
```

---

## 🛠 Required Components (Bill of Materials)

You do **not** need optical, physical, or magnetic sensors to build SurfClock. The firmware features persistent non-volatile flash storage (NVS) that remembers step counts across power cycles and reboots. Calibration is performed once during initial setup using simple CLI commands.

| Component | Quantity | Description | Approximate Cost |
| :--- | :---: | :--- | :--- |
| **ESP32-S3 Board** | 1 | Freenove ESP32-S3 WROOM (or standard ESP32 development board with ≥8 free GPIO pins and USB-C). | ~$5 – $8 |
| **28BYJ-48 5V Stepper Motors** | 2 | Geared unipolar 5V stepper motors (2048 steps/revolution, 5mm flatted shaft). Motor 1 drives the break pointer; Motor 2 drives the conditions subdial. | ~$4 – $6 (pair) |
| **ULN2003 Driver Boards** | 2 | Darlington transistor array stepper driver boards (typically bundled with 28BYJ-48 motors). | Bundled with motors |
| **5V USB Power Supply** | 1 | Standard 5V / 1A–2A USB wall brick and USB-C cable (powers the ESP32 and both stepper motors). | Common household item |
| **DuPont Jumper Wires** | 12–16 | Female-to-female jumper wires to connect the ESP32 GPIOs and 5V/GND power rails to the ULN2003 boards. | ~$2 |
| **Wall Clock Enclosure & Hands** | 1 | Any analog wall clock frame/case with the quartz movement removed. Pointer hands can be 3D printed, laser cut, or press-fit onto the motor shafts. | Repurposed or ~$10 |

> [!TIP]
> **Why No Sensors?**
> Physical Hall-effect sensors or limit switches are completely optional. The firmware saves the stepper coordinates to ESP32 flash (`Preferences` / NVS) after each movement. During first-time setup, you position the hands to 12 o'clock and rating 1.0, type `zero` and `zero2` into the serial monitor, and the clock stays permanently calibrated.

---

## ⚡ Wiring & Pinout

Connect the two ULN2003 stepper driver boards to the ESP32-S3:

### Motor 1: Surf Break Pointer (Main Dial)
| ULN2003 Driver 1 Pin | ESP32-S3 GPIO | Wire / Function |
| :--- | :--- | :--- |
| **IN1** | **GPIO 4** | Blue Wire |
| **IN2** | **GPIO 5** | Pink Wire |
| **IN3** | **GPIO 6** | Yellow Wire |
| **IN4** | **GPIO 7** | Orange Wire |
| **+ (VCC)** | **5V / VBUS** | 5V Power Rail |
| **- (GND)** | **GND** | Common Ground |

### Motor 2: Conditions Gauge Needle (Subdial)
| ULN2003 Driver 2 Pin | ESP32-S3 GPIO | Wire / Function |
| :--- | :--- | :--- |
| **IN1** | **GPIO 11** | Blue Wire |
| **IN2** | **GPIO 12** | Pink Wire |
| **IN3** | **GPIO 13** | Yellow Wire |
| **IN4** | **GPIO 14** | Orange Wire |
| **+ (VCC)** | **5V / VBUS** | 5V Power Rail |
| **- (GND)** | **GND** | Common Ground |

*Power Tip:* Both driver boards share the 5V rail and common GND with the ESP32. Stepper coils automatically power down 2 seconds after completing a move to keep the motors cool.

---

## 🔌 How to Flash the Firmware

SurfClock firmware is built with [PlatformIO](https://platformio.org/).

### 1. Prerequisites
- Install **VS Code** with the **PlatformIO IDE** extension, OR install PlatformIO CLI directly:
  ```bash
  pip install -U platformio
  ```

### 2. Connect Your ESP32-S3
Plug your ESP32-S3 into your computer via a USB-C data cable.

### 3. Build & Flash
Navigate to the `firmware/` directory and upload:
```bash
cd firmware
pio run -t upload
```

### 4. Open the Serial Monitor
```bash
pio device monitor -b 115200
```

### 5. First-Time Setup & Zeroing (No Sensors Needed!)
Once the serial monitor opens, run these interactive commands:

1. **Configure Wi-Fi** (saved directly to flash, no re-compiling required):
   ```
   wifi "Your-SSID" "Your-Password"
   ```
2. **Point hands to datum position**:
   - Manually turn the main break hand so it points straight up at **12 o'clock** (Position 1).
   - Manually turn the conditions gauge needle to **Rating 1.0** (or minimum mark).
3. **Lock zero positions into flash**:
   ```
   zero
   zero2
   ```
   The clock now locks these positions as Step 0 and remembers them through power cycles and reboots.
4. **Test the movement**:
   ```
   pos 2        # Rotates break pointer to spot 2
   gauge 7.5    # Moves conditions needle to 7.5 / 10
   status       # Displays current step positions and Wi-Fi state
   ```

---

## 🏄 How to Add Your Own Beaches

SurfClock uses the **Open-Meteo Marine & Weather API**—it is **100% free**, requires **no API key**, and covers ocean coordinates globally.

You can configure SurfClock for your local coastline in two places:
1. **The Backend Scoring Engine** (`cloudflare-worker/src/index.js` or `server/spots.json`): defines the geographic coordinates and oceanographic preferences for each spot.
2. **The Clock Dial Mapping** (`firmware/src/stepper_controller.cpp`): maps spot positions to angles on your clock face.

---

### Step 1: Define Your Beaches in the Backend

In `cloudflare-worker/src/index.js` (or `server/spots.json` for the local Python server), edit the `SPOTS` array:

```javascript
const SPOTS = [
  {
    pos: 1,                          // Unique index (1-12)
    name: "Trestles",                // Full beach name
    dial_text: "TRESTLES",           // Label on clock dial
    angle: 0,                        // Angle on dial (0° = 12 o'clock)
    lat: 33.385,                     // Latitude (decimal degrees)
    lon: -117.593,                   // Longitude (decimal degrees)
    facing: 220,                     // Beach facing direction (degrees from North)
    swell_min: 180,                  // Optimal swell window start (degrees)
    swell_max: 260,                  // Optimal swell window end (degrees)
    wind_min: 30,                    // Optimal offshore wind window start (degrees)
    wind_max: 90,                    // Optimal offshore wind window end (degrees)
    min_s: 0.8,                      // Minimum rideable wave height (meters)
    max_s: 3.5,                      // Maximum swell height before washing out (meters)
    period: 14                       // Ideal swell period (seconds)
  },
  // Add up to 12 spots around the dial...
];
```

#### How to Find Beach Parameters:
- **`lat` / `lon`**: Right-click the beach on Google Maps and copy the latitude/longitude coordinates.
- **`facing`**: The compass bearing looking straight out from the sand into the ocean (0° = North, 90° = East, 180° = South, 270° = West).
- **`wind_min` / `wind_max`**: Offshore winds blow from land out to sea (roughly 180° opposite of the beach facing direction $\pm 30^\circ$).
- **`swell_min` / `swell_max`**: Compass angles from which swells can reach the beach without getting blocked by headlands, islands, or points.

---

### Step 2: Map Dial Angles in the Firmware

In `firmware/src/stepper_controller.cpp`, locate `setBeachPosition(int pos)` and update the angles to match your clock face design:

```cpp
bool StepperController::setBeachPosition(int pos) {
    float angle = 0.0f;
    const char* name = "Unknown";
    switch (pos) {
        case 1:
            angle = 0.0f;   name = "Trestles"; break;       // 12 o'clock
        case 2:
            angle = 72.0f;  name = "Huntington"; break;     // ~2:25 on dial
        case 3:
            angle = 144.0f; name = "Malibu"; break;         // ~4:50 on dial
        case 4:
            angle = 216.0f; name = "Rincon"; break;         // ~7:10 on dial
        case 5:
            angle = 288.0f; name = "Steamer Lane"; break;   // ~9:35 on dial
        default:
            Serial.printf("[MOTOR] Invalid beach pos: %d\n", pos);
            return false;
    }
    _currentBeachPos = pos;
    return moveToAngle(angle);
}
```

*Note:* You can support anywhere from 2 to 12 spots on a single clock face!

---

### Step 3: Deploy the Backend

#### Option A: Cloudflare Worker (Recommended - Free Serverless Edge)
```bash
cd cloudflare-worker
npx wrangler deploy
```
This deploys your scoring API to `https://<your-worker-name>.workers.dev/api/surf`.

Set this URL on your clock via the serial monitor:
```
api https://<your-worker-name>.workers.dev/api/surf
```

#### Option B: Local Python Server (Self-Hosted)
If you prefer running a local server on a Raspberry Pi or home server:
```bash
cd server
pip install requests
python server.py
```
This runs the scoring engine at `http://<your-local-ip>:8000/api/surf`.

---

## 💻 Serial CLI Command Reference

Connect over USB at **115200 baud** to access real-time diagnostics:

| Command | Arguments | Description |
| :--- | :--- | :--- |
| `status` | – | Prints current step position, target position, Wi-Fi status, and free RAM. |
| `pos` | `<1-12>` | Moves the main break hand to a specific beach position. |
| `angle` | `<0-360>` | Rotates the main hand directly to an exact degree angle. |
| `gauge` | `<1.0-10.0>` | Moves the conditions subdial needle to a rating between 1.0 and 10.0. |
| `step` | `<+/-N>` | Manually nudges Motor 1 forward (+) or backward (-) by $N$ steps. |
| `step2` | `<+/-N>` | Manually nudges Motor 2 forward (+) or backward (-) by $N$ steps. |
| `zero` | – | Locks Motor 1's current position as 12 o'clock (Step 0) into flash (NVS). |
| `zero2` | – | Locks Motor 2's current position as Rating 1.0 (Step 0) into flash (NVS). |
| `wifi` | `<SSID> <PASS>` | Sets and saves Wi-Fi network credentials directly to flash. |
| `api` | `<URL>` | Sets and saves custom scoring API endpoint to flash. |
| `poll` | – | Forces an immediate HTTP GET request to the scoring server. |
| `free` | – | Immediately de-energizes all stepper motor coils. |
| `demo` | – | Toggles a continuous smooth dial sweep demonstration. |

---

## 📐 How Surf Quality is Scored

The scoring engine evaluates real-time buoy and weather telemetry to generate a composite quality score from **0 to 100**, mapped to the **1.0 to 10.0** gauge:

1. **Swell Height (0–35 pts)**: Evaluated against each beach's rideable envelope using Gaussian falloff.
2. **Swell Period (0–25 pts)**: Long-period groundswells (12s–16s+) get full points; weak short-period wind chop (<8s) is penalized.
3. **Swell Direction (0–15 pts)**: Evaluates swell approach angle relative to bay exposure and headland bathymetry.
4. **Wind & Cleanliness (-15 to +25 pts)**: Clean offshore winds groom wave faces (+25 pts); strong onshore winds cause chop and blowout penalties (-15 pts). Light/glassy winds score high neutral.

---

## 📄 License

MIT License. Open-source and free for all surfers, makers, and tinkerers.
