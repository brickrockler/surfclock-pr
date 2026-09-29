# 🤖 SurfClock AI Agent Operating Guide (AGENT.md)

This document is the operating manual for autonomous AI coding agents (Antigravity, Cursor, Claude Code, Windsurf, Devin, etc.) tasked with setting up, customizing, flashing, deploying, or calibrating a **SurfClock** physical display for a user.

---

## 🎯 Agent Mission

Your objective is to take the user from unboxed hardware to a fully calibrated, live-updating SurfClock on their wall with **zero manual coding required from the user**.

You will:
1. Identify which setup path the user is taking (Web Customizer ZIP vs. GitHub Repo).
2. Configure the 5 target surf breaks and physical dial angles.
3. Build and flash the firmware over USB using PlatformIO.
4. Configure Wi-Fi and deploy the Cloudflare Worker edge API.
5. Guide or execute the hand alignment calibration sequence.

---

## 🧭 Step 1: Detect Setup Path

Check the workspace for existing files and ask the user which path they are using:

### Path A: User Downloaded a Custom Kit from `surfclock.web.app` (Fastest)
If the user downloaded a package from the 3D Studio Customizer (e.g. `SurfClock_<REGION>_Custom_Kit.zip` or unzipped folder):
- The dial STL, C++ stepper angles, and Cloudflare Worker `SPOTS` array are **already hardcoded** for their 5 beaches.
- **Agent Action:** Proceed directly to [Firmware Flashing](#-step-3-build--flash-firmware), [Wi-Fi Configuration](#-step-4-wi-fi--api-configuration), and [Calibration](#-step-5-hand-alignment--zeroing-loop).

### Path B: User Cloned Directly from GitHub (Interactive Questionnaire)
If starting from the raw repository, **you must interview the user**. Ask these questions:

```text
1. "Which 5 beaches or surf breaks do you want on your clock dial (ordered clockwise from 12 o'clock, 2 o'clock, 4 o'clock, 8 o'clock, and 10 o'clock)?"
2. "What is your local Wi-Fi network SSID and password?"
3. "Do you want to deploy your own Cloudflare Worker (requires free Cloudflare account), or use the default public endpoint (https://surfclock.eggbot.net/api/surf)?"
```

Once the user answers:
1. **Look up GPS Coordinates:** Find exact `lat` and `lon` for each of the 5 beaches.
2. **Determine Coastal Geometry:**
   - `facing`: Compass direction looking from sand out to sea (0°=N, 90°=E, 180°=S, 270°=W).
   - `wind_min` / `wind_max`: Offshore wind window ($\text{facing} + 180^\circ \pm 35^\circ$).
   - `swell_min` / `swell_max`: Swell exposure entry window ($\text{facing} \pm 55^\circ$).
3. **Update `firmware/src/stepper_controller.cpp`:**
   Inject their 5 beach names and angles in `setBeachPosition(int pos)`:
   - Pos 1: $0.0^\circ$ (12 o'clock datum)
   - Pos 2: $60.0^\circ$ (2 o'clock)
   - Pos 3: $120.0^\circ$ (4 o'clock)
   - Pos 4: $240.0^\circ$ (8 o'clock)
   - Pos 5: $300.0^\circ$ (10 o'clock)
   And update `calibrateCurrentAsBeach(int pos)` with steps: `0, 341, 683, 1365, 1707`.
4. **Update `cloudflare-worker/src/index.js`:**
   Replace the `SPOTS` array with the 5 spots with their coordinates, facing, and swell/wind angles.
5. **Update `server/spots.json`:**
   Sync the JSON file for local server fallback.

---

## 🔌 Step 2: Verify Hardware & Connections

Verify the wiring connections with the user:

- **Motor 1 (Main Break Pointer):**
  - ULN2003 Driver 1: `IN1..IN4` ➔ ESP32-S3 **GPIO 4, 5, 6, 7**
  - Power: `+ (VCC)` ➔ **5V (VBUS)**, `- (GND)` ➔ **GND**
- **Motor 2 (Conditions Gauge):**
  - ULN2003 Driver 2: `IN1..IN4` ➔ ESP32-S3 **GPIO 11, 12, 13, 14**
  - Power: `+ (VCC)` ➔ **5V (VBUS)**, `- (GND)` ➔ **GND**
- **Sensors:** Remind the user that **no sensors or limit switches are required**. The firmware uses persistent NVS storage.

---

## ⚡ Step 3: Build & Flash Firmware

Execute the build using PlatformIO:

```bash
cd firmware
pio run -t upload
```

### Port Detection:
PlatformIO will auto-detect the serial port. If multiple devices are connected, list them:
- macOS: `ls /dev/cu.usbmodem*`
- Linux: `ls /dev/ttyACM* /dev/ttyUSB*`
- Windows: Inspect COM ports

If the board fails to enter flashing mode, instruct the user:
> *"Hold down the **BOOT** button on the ESP32-S3, press and release the **RESET** button, then release **BOOT**."*

---

## 🌐 Step 4: Wi-Fi & API Configuration

Open the serial connection at **115200 baud** (or instruct the user to run `pio device monitor -b 115200`):

1. **Send Wi-Fi credentials to NVS storage:**
   ```text
   wifi "SSID" "PASSWORD"
   ```
   *Note: Wi-Fi credentials persist in ESP32 flash memory across power cuts and reboots.*
2. **Configure API URL (if using a custom Cloudflare Worker):**
   ```text
   api https://<your-worker-name>.workers.dev/api/surf
   ```
3. **Verify connectivity:**
   ```text
   status
   ```
   Check that `Wi-Fi Status: CONNECTED` and an IP address is printed.

---

## 🎯 Step 5: Hand Alignment & Zeroing Loop

Because hands are press-fit manually, the agent should calibrate step 0:

### Vision-Assisted Alignment (If user provides webcam or photos):
1. Ask the user for a photo of the clock face or point a camera at it.
2. Inspect the pointer alignment relative to 12 o'clock (Position 1) and Rating 1.0 on the subdial.
3. Issue relative step nudges over serial:
   - `step <+/-N>`: Nudges Motor 1 forward (+) or backward (-)
   - `step2 <+/-N>`: Nudges Motor 2 forward (+) or backward (-)
4. Once needles align dead-centre:
   ```text
   zero
   zero2
   ```
5. Confirm by testing positions:
   ```text
   pos 2
   gauge 8.0
   pos 1
   gauge 1.0
   ```

### Manual Alignment (If no camera is available):
Instruct the user:
1. Physically turn the main hand to point straight up at **12 o'clock**.
2. Physically turn the subdial needle to **Rating 1.0**.
3. Send:
   ```text
   zero
   zero2
   ```

---

## ☁️ Step 6: Deploy Cloudflare Worker (Optional)

If the user wants their own serverless edge API:
```bash
cd cloudflare-worker
npx wrangler deploy
```
Wrangler will output the live URL (e.g. `https://surfclock-api.<account>.workers.dev`).
Set this URL on the clock using:
```text
api https://surfclock-api.<account>.workers.dev/api/surf
```

---

## 📋 Serial CLI Command Quick Reference

| Command | Arguments | What it does |
| :--- | :--- | :--- |
| `status` | – | Displays step positions, Wi-Fi status, and free heap |
| `pos` | `<1-5>` | Rotates main break hand to beach 1–5 |
| `angle` | `<0-360>` | Moves main hand directly to exact degree |
| `gauge` | `<1.0-10.0>` | Moves subdial needle to rating |
| `step` | `<+/-N>` | Relative step nudge for Motor 1 |
| `step2` | `<+/-N>` | Relative step nudge for Motor 2 |
| `zero` | – | Locks Motor 1 current position as 12 o'clock datum in NVS |
| `zero2` | – | Locks Motor 2 current position as Rating 1.0 datum in NVS |
| `cal_beach`| `<1-5>` | Calibrates current physical position as specific beach |
| `wifi` | `<SSID> <PWD>` | Saves Wi-Fi credentials to NVS flash |
| `api` | `<URL>` | Saves scoring API URL to NVS flash |
| `poll` | – | Forces immediate HTTP GET request to scoring server |
| `free` | – | Powers down stepper motor coils immediately |
| `demo` | – | Toggles continuous dial sweep demo |

---

## ⚠️ Troubleshooting Checklist for Agents

1. **Board not detected over USB:**
   - Make sure the cable is a **USB data cable**, not a power-only charging cable.
   - On Linux: ensure user has `dialout` group permissions (`sudo usermod -a -G dialout $USER`).
2. **Motor coils buzzing / hot:**
   - Coils automatically power down 2 seconds after completing a move.
   - If holding torque was left on, send `free` to de-energize coils immediately.
3. **Motors slipping or missing steps:**
   - Ensure ULN2003 driver `+ (VCC)` is connected to the **5V / VBUS** pin, NOT the 3.3V logic pin. Steppers require 5V for sufficient torque.
4. **Wi-Fi won't connect:**
   - ESP32-S3 only supports **2.4 GHz Wi-Fi** networks (802.11 b/g/n). It will not connect to 5 GHz-only bands.
