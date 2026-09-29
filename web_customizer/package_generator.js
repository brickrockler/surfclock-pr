/**
 * SURF CLOCK (SC-01) — FULL-STACK PACKAGE GENERATOR
 * Generates an end-to-end custom kit in browser memory using JSZip:
 * 1. 3D Print CAD/STLs with custom embossed dial & multi-material typography inlay
 * 2. ESP32-S3 Firmware with the 5 selected beaches & dial angles hardcoded in C++
 * 3. Cloudflare Worker Edge Backend with custom beach GPS coordinates & scoring pipeline
 * 4. Local Python Server with custom spots.json
 * 5. Complete custom hardware build, wiring, and firmware flashing guide
 */

const COMPASS_DEG = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
  E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
  W: 270, WNW: 292.5, NW: 315, NNW: 337.5
};

export function compassToDegrees(dirStr, defaultDeg = 90) {
  if (!dirStr) return defaultDeg;
  if (typeof dirStr === "number") return (dirStr % 360 + 360) % 360;
  const upper = String(dirStr).trim().toUpperCase();
  if (COMPASS_DEG[upper] != null) return COMPASS_DEG[upper];
  const parsed = parseFloat(upper);
  return isNaN(parsed) ? defaultDeg : (parsed % 360 + 360) % 360;
}

/**
 * Maps the 5 custom beaches from customizer state to clockwise dial positions (1 to 5):
 * Pos 1 = 12:00 (0°)   -> Slot 0
 * Pos 2 = 02:00 (60°)  -> Slot 2
 * Pos 3 = 04:00 (120°) -> Slot 4
 * Pos 4 = 08:00 (240°) -> Slot 3
 * Pos 5 = 10:00 (300°) -> Slot 1
 */
export function buildClockwiseSpots(beaches, region) {
  const slotOrder = [0, 2, 4, 3, 1];
  const angles = [0, 60, 120, 240, 300];
  const hours = [12, 2, 4, 8, 10];

  const regSwellDeg = compassToDegrees(region.swellDir, 135);
  const regWindDeg = compassToDegrees(region.windDir, 270);

  return slotOrder.map((slotIdx, i) => {
    const rawBeach = (beaches && beaches[slotIdx]) || {};
    const name = (rawBeach.name || `Beach ${i + 1}`).trim();
    const dial_text = name.toUpperCase();
    const angle = angles[i];
    const hour = hours[i];
    const lat = Number(rawBeach.lat || region.lat || -33.75);
    const lon = Number(rawBeach.lng || rawBeach.lon || region.lng || 151.30);

    // Calculate facing: beach faces towards open ocean
    let facing = 90;
    if (rawBeach.facing != null) {
      facing = compassToDegrees(rawBeach.facing, 90);
    } else if (rawBeach.idealWindDir != null) {
      facing = (compassToDegrees(rawBeach.idealWindDir) + 180) % 360;
    } else if (region.windDir && region.windDir !== "OFFSHORE") {
      facing = (regWindDeg + 180) % 360;
    } else {
      // East vs West coast of continents heuristic
      facing = (lon > 0 && lon < 170 && lat < 0) ? 90 : (lon < -60 ? 250 : 90);
    }

    const offshore = (facing + 180) % 360;
    const wind_min = Math.round((offshore - 35 + 360) % 360);
    const wind_max = Math.round((offshore + 35 + 360) % 360);
    const swell_min = Math.round((facing - 55 + 360) % 360);
    const swell_max = Math.round((facing + 55 + 360) % 360);
    const ideal_period = region.swellPeriodS || 12;

    return {
      pos: i + 1,
      slot_index: slotIdx,
      name,
      dial_text,
      hour,
      angle_deg: angle,
      lat: Number(lat.toFixed(4)),
      lon: Number(lon.toFixed(4)),
      facing_deg: Math.round(facing),
      optimal_swell_dir_min: swell_min,
      optimal_swell_dir_max: swell_max,
      optimal_wind_dir_min: wind_min,
      optimal_wind_dir_max: wind_max,
      min_swell_m: 0.7,
      max_swell_m: 3.5,
      ideal_period_s: ideal_period,
      description: `Custom break at ${name} (${hour} o'clock, ${angle}°)`
    };
  });
}

/**
 * Injects custom hardcoded beach positions & angles into StepperController C++ source
 */
export function customizeStepperControllerCpp(originalCpp, spots) {
  const switchCasesPos = spots.map((s) => {
    const angleFloat = s.angle_deg.toFixed(1);
    const stepVal = Math.round((s.angle_deg / 360.0) * 2048);
    const extraCase = s.pos === 1 ? "        case 12:\n" : "";
    return `${extraCase}        case ${s.pos}:\n            angle = ${angleFloat}f; name = "${s.name}"; break;        // Step ${stepVal} (${s.hour}:00)`;
  }).join("\n");

  const switchCasesCal = spots.map((s) => {
    const stepVal = Math.round((s.angle_deg / 360.0) * 2048);
    const extraCase = s.pos === 1 ? "        case 12: " : "";
    return `        ${extraCase}case ${s.pos}:  step = ${stepVal}; name = "${s.name}"; break;`;
  }).join("\n");

  let modified = originalCpp;

  // Replace setBeachPosition switch block
  const setBeachRegex = /(bool\s+StepperController::setBeachPosition\s*\(\s*int\s+pos\s*\)\s*\{[\s\S]*?switch\s*\(\s*pos\s*\)\s*\{)[\s\S]*?(\s*default:)/;
  if (setBeachRegex.test(modified)) {
    modified = modified.replace(setBeachRegex, `$1\n${switchCasesPos}\n$2`);
  }

  // Replace calibrateCurrentAsBeach switch block
  const calBeachRegex = /(void\s+StepperController::calibrateCurrentAsBeach\s*\(\s*int\s+pos\s*\)\s*\{[\s\S]*?switch\s*\(\s*pos\s*\)\s*\{)[\s\S]*?(\s*default:)/;
  if (calBeachRegex.test(modified)) {
    modified = modified.replace(calBeachRegex, `$1\n${switchCasesCal}\n$2`);
  }
  return modified;
}

/**
 * Injects custom spots array into Cloudflare Worker JavaScript source
 */
export function customizeWorkerJs(originalJs, spots) {
  const spotsJs = JSON.stringify(
    spots.map((s) => ({
      pos: s.pos,
      name: s.name,
      dial_text: s.dial_text,
      angle: s.angle_deg,
      lat: s.lat,
      lon: s.lon,
      facing: s.facing_deg,
      swell_min: s.optimal_swell_dir_min,
      swell_max: s.optimal_swell_dir_max,
      wind_min: s.optimal_wind_dir_min,
      wind_max: s.optimal_wind_dir_max,
      min_s: s.min_swell_m,
      max_s: s.max_swell_m,
      period: s.ideal_period_s
    })),
    null,
    2
  );

  const spotsRegex = /const\s+SPOTS\s*=\s*\[[\s\S]*?\];/;
  if (spotsRegex.test(originalJs)) {
    return originalJs.replace(spotsRegex, `const SPOTS = ${spotsJs};`);
  }
  return `const SPOTS = ${spotsJs};\n\n` + originalJs;
}

/**
 * Generates Markdown Build & Calibration Guide tailored for the user's setup
 */
export function generateBuildGuideMarkdown({ region, spots, colors }) {
  const fSw = colors?.bezel || { name: "Graphite Matte", hex: "#1A1A1A" };
  const dSw = colors?.dial || { name: "Chalk White", hex: "#F5F5F5" };
  const tSw = colors?.inlay || { name: "Laser Orange", hex: "#E85D26" };
  const hSw = colors?.hands || { name: "Anodized Orange", hex: "#E85D26" };

  return `# 🌊 SURF CLOCK (SC-01) — Custom Build & Setup Guide

**Target Coastline:** ${region.name || "Custom Coastline"} (${region.code || "CUSTOM"})  
**Generated On:** ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}  
**Open Source Repository:** [https://github.com/raphdixon/surfclock](https://github.com/raphdixon/surfclock)

---

## 🏄 Your 5 Clockwise Dial Beaches

| Position | Hour | Dial Angle | Beach Name | Lat, Lon | Facing | Offshore Wind |
| :---: | :---: | :---: | :--- | :--- | :---: | :---: |
${spots.map((s) => `| **${s.pos}** | ${s.hour}:00 | **${s.angle_deg}°** | **${s.name}** | \`${s.lat}, ${s.lon}\` | ${s.facing_deg}° | ${s.optimal_wind_dir_min}°–${s.optimal_wind_dir_max}° |`).join("\n")}
| **–** | 6:00 | **180°** | **Conditions Gauge** | Subdial Needle | – | 1.0 (Poor) to 10.0 (Epic) |

---

## 🎨 3D Print Setup (Selected Colorway)

- **Outer Bezel Chassis (\`01_outer_bezel_chassis.stl\`):** ${fSw.name} (${fSw.hex})
- **Dial Faceplate (\`02_custom_dial_faceplate.stl\`):** ${dSw.name} (${dSw.hex})
- **Dial Typography Inlay (\`02b_custom_typography_inlay.stl\`):** ${tSw.name} (${tSw.hex})
- **Pointer Hands (\`05_pointer_hands_28byj48_capped.stl\`):** ${hSw.name} (${hSw.hex})
- **Deck & Rear Cover (\`03\` & \`04\`):** Any durable filament (PETG or PLA)

### Dual-Color Printing Note:
If you are printing on a single-nozzle 3D printer without an AMS / MMU:
1. Slice \`02_custom_dial_faceplate.stl\` at **0.20mm layer height**.
2. Add a pause / filament color change at **Z = 2.60mm**.
3. Swap filament from **${dSw.name}** to **${tSw.name}** to produce crisp raised 3D lettering!

---

## ⚡ Electronics & Wiring

No optical or magnetic sensors are required. Connect the ULN2003 stepper driver boards to the ESP32-S3:

### Motor 1 (Beach Pointer)
- \`IN1\` ➔ **GPIO 4**
- \`IN2\` ➔ **GPIO 5**
- \`IN3\` ➔ **GPIO 6**
- \`IN4\` ➔ **GPIO 7**
- \`+ (VCC)\` / \`- (GND)\` ➔ **5V (VBUS) / GND**

### Motor 2 (Conditions Gauge)
- \`IN1\` ➔ **GPIO 11**
- \`IN2\` ➔ **GPIO 12**
- \`IN3\` ➔ **GPIO 13**
- \`IN4\` ➔ **GPIO 14**
- \`+ (VCC)\` / \`- (GND)\` ➔ **5V (VBUS) / GND**

---

## 🔌 1-Command Firmware Flashing

1. Connect your ESP32-S3 via USB-C.
2. Open terminal in the \`firmware/\` folder:
   \`\`\`bash
   cd firmware
   pio run -t upload
   pio device monitor -b 115200
   \`\`\`
3. Set your Wi-Fi credentials directly in the serial monitor:
   \`\`\`text
   wifi "Your-SSID" "Your-Password"
   \`\`\`
4. Manually align the break pointer to **12 o'clock** (${spots[0].name}) and the conditions needle to **1.0**, then lock them:
   \`\`\`text
   zero
   zero2
   \`\`\`
   The clock saves step 0 to persistent flash (NVS) and begins real-time telemetry updates!

---

## ☁️ Cloudflare Worker Edge Deployment

To deploy your serverless scoring engine for your 5 beaches:
\`\`\`bash
cd cloudflare-worker
npx wrangler deploy
\`\`\`
Point your clock to your newly deployed API:
\`\`\`text
api https://<your-worker>.workers.dev/api/surf
\`\`\`
`;
}

/**
 * Fetches static assets from relative path with fallback support
 */
async function fetchAssetBuffer(path) {
  try {
    const res = await fetch(path);
    if (res.ok) {
      return await res.arrayBuffer();
    }
  } catch (err) {
    console.warn(`[PackageGenerator] Could not fetch ${path}:`, err);
  }
  return null;
}

async function fetchAssetText(path) {
  try {
    const res = await fetch(path);
    if (res.ok) {
      return await res.text();
    }
  } catch (err) {
    console.warn(`[PackageGenerator] Could not fetch text ${path}:`, err);
  }
  return null;
}

/**
 * Main entry point: Generates and downloads the complete custom full-stack ZIP package
 */
export async function downloadFullStackCustomKit({ state, studio, onProgress = () => {} }) {
  if (typeof window.JSZip === "undefined") {
    throw new Error("JSZip library not loaded. Please ensure jszip.min.js is present.");
  }

  const zip = new window.JSZip();
  const region = state.activeRegion || { name: "Custom Region", code: "CUSTOM" };
  const cleanCode = (region.code || "CUSTOM").replace(/[^A-Za-z0-9_-]/g, "_").toUpperCase();
  const rootFolderName = `SurfClock_${cleanCode}_Custom_Kit`;
  const root = zip.folder(rootFolderName);

  onProgress("Resolving 5 beach coordinates & angles...", 10);
  const spots = buildClockwiseSpots(state.beaches, region);

  // 1. Generate Custom 3D STL files
  onProgress("Generating custom 3D dial faceplate & typography STL...", 25);
  const stlFolder = root.folder("stl");

  try {
    // Generate custom dial base + embossed text
    const customDialBuffer = studio.generateCustomDialSTLBuffer(true, cleanCode);
    stlFolder.file(`02_custom_dial_faceplate_${cleanCode}.stl`, customDialBuffer);

    // Generate custom typography inlay for multi-material printing
    const customInlayBuffer = studio.generateCustomDialSTLBuffer(false, cleanCode);
    stlFolder.file(`02b_custom_typography_inlay_${cleanCode}.stl`, customInlayBuffer);
  } catch (err) {
    console.error("[PackageGenerator] Failed to generate custom STLs:", err);
  }

  // Fetch static base STLs
  onProgress("Packaging 3D printable mechanical CAD chassis...", 45);
  const staticStls = [
    { name: "01_outer_bezel_chassis.stl", url: "./downloads/stl/01_outer_bezel_chassis.stl" },
    { name: "03_internal_engineering_deck.stl", url: "./downloads/stl/03_internal_engineering_deck.stl" },
    { name: "04_rear_cover_usb.stl", url: "./downloads/stl/04_rear_cover_usb.stl" },
    { name: "05_pointer_hands_28byj48_capped.stl", url: "./downloads/stl/05_pointer_hands_28byj48_capped.stl" },
    { name: "06_snap_lock_pins.stl", url: "./downloads/stl/06_snap_lock_pins.stl" }
  ];

  await Promise.all(
    staticStls.map(async (file) => {
      const buf = await fetchAssetBuffer(file.url);
      if (buf) stlFolder.file(file.name, buf);
    })
  );

  // 2. Custom Firmware Generation
  onProgress("Hardcoding custom beaches into ESP32 firmware...", 65);
  const fwFolder = root.folder("firmware");
  const fwSrcFolder = fwFolder.folder("src");
  const fwIncFolder = fwFolder.folder("include");

  // Fetch base firmware files
  const [
    baseStepperCpp,
    baseStepperH,
    baseMainCpp,
    baseCliCpp,
    baseCliH,
    baseGaugeCpp,
    baseGaugeH,
    baseNetCpp,
    baseNetH,
    baseHallCpp,
    baseHallH,
    baseConfigH,
    basePlatformIni
  ] = await Promise.all([
    fetchAssetText("./downloads/firmware/src/stepper_controller.cpp"),
    fetchAssetText("./downloads/firmware/src/stepper_controller.h"),
    fetchAssetText("./downloads/firmware/src/main.cpp"),
    fetchAssetText("./downloads/firmware/src/cli_handler.cpp"),
    fetchAssetText("./downloads/firmware/src/cli_handler.h"),
    fetchAssetText("./downloads/firmware/src/conditions_gauge.cpp"),
    fetchAssetText("./downloads/firmware/src/conditions_gauge.h"),
    fetchAssetText("./downloads/firmware/src/network_manager.cpp"),
    fetchAssetText("./downloads/firmware/src/network_manager.h"),
    fetchAssetText("./downloads/firmware/src/hall_sensor.cpp"),
    fetchAssetText("./downloads/firmware/src/hall_sensor.h"),
    fetchAssetText("./downloads/firmware/include/config.h"),
    fetchAssetText("./downloads/firmware/platformio.ini")
  ]);

  if (baseStepperCpp) {
    const customStepperCpp = customizeStepperControllerCpp(baseStepperCpp, spots);
    fwSrcFolder.file("stepper_controller.cpp", customStepperCpp);
  }
  if (baseStepperH) fwSrcFolder.file("stepper_controller.h", baseStepperH);
  if (baseMainCpp) fwSrcFolder.file("main.cpp", baseMainCpp);
  if (baseCliCpp) fwSrcFolder.file("cli_handler.cpp", baseCliCpp);
  if (baseCliH) fwSrcFolder.file("cli_handler.h", baseCliH);
  if (baseGaugeCpp) fwSrcFolder.file("conditions_gauge.cpp", baseGaugeCpp);
  if (baseGaugeH) fwSrcFolder.file("conditions_gauge.h", baseGaugeH);
  if (baseNetCpp) fwSrcFolder.file("network_manager.cpp", baseNetCpp);
  if (baseNetH) fwSrcFolder.file("network_manager.h", baseNetH);
  if (baseHallCpp) fwSrcFolder.file("hall_sensor.cpp", baseHallCpp);
  if (baseHallH) fwSrcFolder.file("hall_sensor.h", baseHallH);
  if (baseConfigH) fwIncFolder.file("config.h", baseConfigH);
  if (basePlatformIni) fwFolder.file("platformio.ini", basePlatformIni);

  // 3. Custom Cloudflare Worker Generation
  onProgress("Configuring Cloudflare Worker with custom buoy coordinates...", 80);
  const workerFolder = root.folder("cloudflare-worker");
  const workerSrcFolder = workerFolder.folder("src");

  const [baseWorkerJs, baseWorkerPkg, baseWorkerToml] = await Promise.all([
    fetchAssetText("./downloads/cloudflare-worker/src/index.js"),
    fetchAssetText("./downloads/cloudflare-worker/package.json"),
    fetchAssetText("./downloads/cloudflare-worker/wrangler.toml")
  ]);

  if (baseWorkerJs) {
    const customWorkerJs = customizeWorkerJs(baseWorkerJs, spots);
    workerSrcFolder.file("index.js", customWorkerJs);
  }
  if (baseWorkerPkg) workerFolder.file("package.json", baseWorkerPkg);
  if (baseWorkerToml) workerFolder.file("wrangler.toml", baseWorkerToml);

  // 4. Custom Server spots.json
  const serverFolder = root.folder("server");
  serverFolder.file("spots.json", JSON.stringify(spots, null, 2));

  const [baseServerPy, baseScorerPy] = await Promise.all([
    fetchAssetText("./downloads/server/server.py"),
    fetchAssetText("./downloads/server/scorer.py")
  ]);
  if (baseServerPy) serverFolder.file("server.py", baseServerPy);
  if (baseScorerPy) serverFolder.file("scorer.py", baseScorerPy);

  // 5. Documentation & Custom Build Guide
  onProgress("Generating custom build, wiring & flashing guide...", 90);
  const customGuideMd = generateBuildGuideMarkdown({
    region,
    spots,
    colors: state.colors
  });
  root.file("SURF_CLOCK_CUSTOM_BUILD_GUIDE.md", customGuideMd);

  const [baseReadme, baseWiring] = await Promise.all([
    fetchAssetText("./downloads/README.md"),
    fetchAssetText("./downloads/docs/WIRING.md")
  ]);
  if (baseReadme) root.file("README.md", baseReadme);
  const docsFolder = root.folder("docs");
  if (baseWiring) docsFolder.file("WIRING.md", baseWiring);

  // 6. Generate ZIP and trigger browser download
  onProgress("Compressing full-stack package...", 95);
  const zipBlob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });

  const zipFilename = `SurfClock_${cleanCode}_Custom_Kit.zip`;
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipFilename;
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 2500);

  onProgress("✅ Full-stack custom package ready!", 100);
  return zipFilename;
}
