# SC—01 // OPEN-SOURCE SURF TELEMETRY CLOCK
## Complete Hardware, 3D Print, Firmware & Assembly Manual
**License:** CERN-OHL-S v2 (Hardware & STL Files) / MIT License (ESP32-S3 Firmware & Telemetry Software)
**Envelope Dimensions:** `184.0 × 230.0 × 46.0 mm`

---

## 1. BILL OF MATERIALS (BOM — EST. ~$28 USD TOTAL)

| # | Component | Specification | Qty | Est. Cost | Notes / Sourcing |
|---|-----------|---------------|-----|-----------|------------------|
| 1 | **Microcontroller** | ESP32-S3 DevKitC-1 (or XIAO ESP32-S3) | 1 | $6.50 | Built-in Wi-Fi BLE + 8KB RTC SRAM + NVS Flash |
| 2 | **Stepper Motors** | `28BYJ-48` 5V DC Reduction Stepper (`4096 steps/rev`) | 2 | $3.80 | `Ø28mm` body, `35mm` M3 mount pitch, `8mm` shaft offset |
| 3 | **Stepper Drivers** | `ULN2003A` Darlington Driver Board | 2 | $1.80 | Usually bundled with `28BYJ-48` motors |
| 4 | **Power / Data Cable** | USB-C 5V Braided Right-Angle Cable (`1.5m`) | 1 | $3.50 | Routes through bottom-rear `12 × 9 mm` strain-relief slot |
| 5 | **3D Filament — Bezel & Dial** | Matte PLA (`1.75mm`, Primary + Dial Face) | ~195g | $4.50 | Prusa MK4 / Bambu X1C / P1S / Any `200×240mm` bed |
| 6 | **3D Filament — Text Inlay** | Contrast Matte PLA (`1.75mm`, Typography + Arc) | ~8g | $0.50 | `0.60mm` raised relief via `M600` filament swap at `Z=2.60mm` |
| 7 | **3D Filament — Hands & Deck** | Accent PLA (`1.75mm`, Pointer Hands + Internal Deck) | ~45g | $1.50 | Signal Orange, Cobalt Blue, Forest Green, or Yellow |
| 8 | **3D Filament — Rear Window** | Clear / Translucent PETG or PLA (`1.75mm`) | ~42g | $1.50 | Shows internal skeleton bridge & ULN2003 LEDs |
| 9 | **Fasteners (Optional)** | `M3 × 6mm` Socket Head Cap Screws | 4 | $0.50 | For motor ears (`06_snap_lock_pins.stl` also included for screwless build) |

---

## 2. 3D PRINTING INSTRUCTIONS (STL FILES INCLUDED)

1. **`01_outer_bezel_chassis.stl` (`184 × 230 × 46 mm`)**
   - **Material:** Matte PLA | **Layer Height:** `0.20mm` Structural | **Infill:** `15% Gyroid` | **Supports:** None required (print front-bezel face down on Satin PEI sheet).
2. **`02_dial_faceplate_base.stl` (or your custom exported `SC01_Custom_Dial_<REGION>.stl`)**
   - **Material:** Matte PLA + Contrast Inlay PLA | **Layer Height:** `0.20mm`
   - **Two-Color Filament Swap (`M600`):** Slice with a pause/filament change at **`Z = 2.60 mm`** (Layer 13). Layers `0.00–2.40 mm` print in your Dial Face color; Layers `2.60–3.00 mm` (`+0.60 mm` relief) print in your Contrast Inlay color.
3. **`03_internal_engineering_deck.stl`**
   - **Material:** Accent PLA | **Layer Height:** `0.20mm` | **Infill:** `20% Grid` | **Supports:** None.
4. **`04_rear_cover_usb.stl`**
   - **Material:** Clear PETG or Translucent PLA (`100% Aligned Rectilinear` infill for crystal clarity).
5. **`05_pointer_hands_28byj48_capped.stl`**
   - **Material:** Accent PLA | **Layer Height:** `0.12mm` Detail (`0.4mm` or `0.25mm` nozzle) | **Brim:** `3mm` outer brim recommended.
   - Features precision `5.18 × 3.12 mm` double-flat keyed shaft bore with `0.5mm` lead-in chamfer and solid capped top.
6. **`06_snap_lock_pins.stl`**
   - **Material:** PETG or PLA | Press-fit retainers for tool-free assembly.

---

## 3. WIRING DIAGRAM (ESP32-S3 TO DUAL ULN2003A + 28BYJ-48)

| Function | ESP32-S3 Pin | Target Board | Target Pin | Notes |
|----------|--------------|--------------|------------|-------|
| **Upper Stepper (Beach Selector)** | `GPIO 4` | ULN2003 #1 (Top) | `IN1` | `Y = +32.0 mm` Upper Axis (`0°, ±60°, ±120°`) |
| **Upper Stepper (Beach Selector)** | `GPIO 5` | ULN2003 #1 (Top) | `IN2` | |
| **Upper Stepper (Beach Selector)** | `GPIO 6` | ULN2003 #1 (Top) | `IN3` | |
| **Upper Stepper (Beach Selector)** | `GPIO 7` | ULN2003 #1 (Top) | `IN4` | |
| **Lower Stepper (Conditions 1–10)** | `GPIO 15` | ULN2003 #2 (Bottom) | `IN1` | `Y = -56.0 mm` Lower Axis (`-90°` to `+90°`) |
| **Lower Stepper (Conditions 1–10)** | `GPIO 16` | ULN2003 #2 (Bottom) | `IN2` | |
| **Lower Stepper (Conditions 1–10)** | `GPIO 17` | ULN2003 #2 (Bottom) | `IN3` | |
| **Lower Stepper (Conditions 1–10)** | `GPIO 18` | ULN2003 #2 (Bottom) | `IN4` | |
| **5V Power Rail** | `5V / VBUS` | Both ULN2003 Boards | `+ (5V)` | Powered directly via USB-C 5V |
| **Common Ground** | `GND` | Both ULN2003 Boards | `- (GND)` | Common ground reference |

> **Important Coil De-Energize Feature:** The SC-01 firmware drives `IN1..IN4 = LOW` immediately after each move so the `28BYJ-48` motors draw `0 mA` while stationary and stay completely cool inside the PLA enclosure.

---

## 4. MAGNET-FREE ZEROING & CALIBRATION (`RTC_DATA_ATTR` + `NVS` FLASH)

No Hall sensors or neodymium magnets are required:
1. Flash `sc01_esp32s3_firmware.ino` to your ESP32-S3 using Arduino IDE or PlatformIO.
2. On first boot, the firmware initializes at `0 steps` (`12:00` vertical reference on both shafts).
3. Press both 3D-printed hands straight onto the `28BYJ-48` double-flat shafts pointing **straight up (`12:00`)**:
   - **Upper Beach Hand:** Pointing straight up at **Beach #1 (`0°` / Top Center)**.
   - **Lower Conditions Needle:** Pointing straight up at **`5.5` (`0°` / Mid-Scale)**.
4. Every movement updates both `RTC_DATA_ATTR` (persisting across `esp_deep_sleep_start()`) and `Preferences` (`NVS` flash, persisting across USB power loss).
