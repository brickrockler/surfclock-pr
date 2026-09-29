/**
 * SURF CLOCK (SC-01) — REAL-TIME 3D CUSTOMIZATION ENGINE (Three.js r160)
 * Loads `assets/surf_clock_v9_master.glb`, manages dynamic +0.60mm 3D extruded beach typography,
 * 9-tier coaxial exploded view, 28BYJ-48 stepper sweep physics, and 4 studio lighting rigs.
 */

import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";
import { RoomEnvironment } from "./vendor/RoomEnvironment.js";
import { DIAL_SLOTS } from "./surf_data.js?v=42";
import {
  buildDialTypographyGeometry,
  buildRearPlaqueTypographyGeometry,
  buildPureDialFaceplateGeometry,
  buildBinarySTLFromGeometries,
  FONT_STROKES,
  getCharWidthFactor,
  measureProportionalString,
} from "./glyphs_3d.js?v=42";
import { COMPONENT_SWATCHES, buildProceduralStudioTextures } from "./materials_and_presets.js?v=42";

/**
 * Mirrors a BufferGeometry across X (x -> -x) and reverses triangle winding so outward normals stay valid.
 * Used on `Duo_Rear_Root` children so that when viewed from the Rear Camera (-Z),
 * ESP32-S3 is on the LEFT, dual ULN2003 boards are on the RIGHT, and IC markings read left-to-right!
 */
function mirrorGeometryXInPlace(geom) {
  if (!geom) return;
  const pos = geom.attributes.position;
  if (pos) {
    for (let i = 0; i < pos.count; i++) {
      pos.setX(i, -pos.getX(i));
    }
    pos.needsUpdate = true;
  }
  const norm = geom.attributes.normal;
  if (norm) {
    for (let i = 0; i < norm.count; i++) {
      norm.setX(i, -norm.getX(i));
    }
    norm.needsUpdate = true;
  }
  if (geom.index) {
    const idx = geom.index.array;
    for (let i = 0; i < idx.length; i += 3) {
      const tmp = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = tmp;
    }
    geom.index.needsUpdate = true;
  } else if (pos) {
    // Non-indexed triangle list: swap vertex 1 and 2 of each triangle
    for (let i = 0; i < pos.count; i += 3) {
      const x1 = pos.getX(i + 1), y1 = pos.getY(i + 1), z1 = pos.getZ(i + 1);
      const x2 = pos.getX(i + 2), y2 = pos.getY(i + 2), z2 = pos.getZ(i + 2);
      pos.setXYZ(i + 1, x2, y2, z2);
      pos.setXYZ(i + 2, x1, y1, z1);
      if (norm) {
        const nx1 = norm.getX(i + 1), ny1 = norm.getY(i + 1), nz1 = norm.getZ(i + 1);
        const nx2 = norm.getX(i + 2), ny2 = norm.getY(i + 2), nz2 = norm.getZ(i + 2);
        norm.setXYZ(i + 1, nx2, ny2, nz2);
        norm.setXYZ(i + 2, nx1, ny1, nz1);
      }
    }
  }
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
}


/**
 * Generates clean millimeter-scaled triplanar UV coordinates for CAD/STL meshes
 * so normalMap, bumpMap, roughnessMap, and grainColorMap render with crisp tactile fidelity on all faces & chamfers.
 */
function ensureTriplanarUVs(geom, scalePerMm = 0.026) {
  if (!geom || !geom.attributes || !geom.attributes.position) return;
  if (!geom.attributes.normal) {
    geom.computeVertexNormals();
  }
  const pos = geom.attributes.position;
  const norm = geom.attributes.normal;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = norm ? Math.abs(norm.getX(i)) : 0;
    const ny = norm ? Math.abs(norm.getY(i)) : 0;
    const nz = norm ? Math.abs(norm.getZ(i)) : 1;
    let u, v;
    if (nz >= nx && nz >= ny) {
      u = x * scalePerMm;
      v = y * scalePerMm;
    } else if (nx >= ny) {
      u = z * scalePerMm;
      v = y * scalePerMm;
    } else {
      u = x * scalePerMm;
      v = z * scalePerMm;
    }
    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }
  geom.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
}

export class SurfClockStudio3D {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.onBeachClick = callbacks.onBeachClick || (() => {});
    this.onExplodeChange = callbacks.onExplodeChange || (() => {});
    this.onReady = callbacks.onReady || (() => {});

    this.clockGroup = new THREE.Group();
    this.explodedGuidesGroup = new THREE.Group();
    this.hitTargetsGroup = new THREE.Group();
    this.basinAOGroup = new THREE.Group();
    this.clockGroup.add(this.explodedGuidesGroup);
    this.clockGroup.add(this.hitTargetsGroup);
    this.clockGroup.add(this.basinAOGroup);

    this.meshesByName = {};
    this.basePositions = new Map();
    this.explodedOffsetsZ = new Map();
    this.dShaftMeshes = [];

    // Dynamic state
    this.beachNames = ["LONG REEF", "QUEENSCLIFF", "DEE WHY", "FRESHIE", "CURL CURL"];
    this.regionTitle = "SYDNEY";
    this.subdialMode = "worth_it";
    this.activeBeachIndex = 2;
    this.swellHeightM = 1.9;
    this.swellPeriodS = 13;
    this.swellDir = "SSE";
    this.worthItScore = 8.2;
    this.explodeCurrent = 0.0;
    this.explodeTarget = 0.0;
    this.rearCoverVisible = true;
    this.cordVisible = false;
    this.lightingMode = "atelier"; // 'atelier' | 'raking' | 'gallery' | 'dawn'

    // Stepper motor physics state (degrees clockwise from 12 o'clock)
    this.upperAngleCurrent = 60.0; // DEE WHY (+60°)
    this.upperAngleTarget = 60.0;
    this.upperVelocity = 0.0;

    this.lowerAngleCurrent = 52.0; // YEAH (+52°)
    this.lowerAngleTarget = 52.0;
    this.lowerVelocity = 0.0;

    // Camera animation state
    this.camAnim = null;

    this.swColors = {
      bezel: "#DCD7CD",
      dial: "#E5DFD3",
      inlay: "#141619",
      hands: "#E33004",
      deck: "#CF2F04",
      bezelTransmission: 0.0,
      dialTransmission: 0.0,
    };

    this.softwareMode = false;
    try {
      this._initRendererAndScene();
      this._initMaterials();
      this._initStudioEnvironment();
      this._initRecessedBasinAO();
      this._initExplodedAxisGuides();
      this._initDialHitTargets();
      this._bindInteraction();
      this._loadMasterGLB();
    } catch (err) {
      console.warn("WebGL unavailable, activating 60fps 3D Software Projection Engine:", err);
      this.softwareMode = true;
    }

    if (this.softwareMode) {
      this._initSoftware3DEngine();
    }

    this._lastTime = performance.now();
    this._animate = this._animate.bind(this);
    this._animLoopStarted = true;
    requestAnimationFrame(this._animate);
  }

  _buildStudioSoftboxEnv(pmrem) {
    const envScene = new RoomEnvironment();
    // Add high-contrast studio softbox light panels in the front (+Z) & overhead hemispheres
    // so orbiting the clock sweeps crisp specular reflections across the bezel, dial, +0.6mm letters & hands!
    const addSoftbox = (w, h, x, y, z, rx, ry, rz, hex, intensity) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(intensity), side: THREE.DoubleSide })
      );
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      envScene.add(m);
    };
    // Frontal mirror-reflection studio window softbox (sits directly on R = reflect(-V, N) for Front Hero camera!)
    addSoftbox(5.2, 11.5, 2.1, 2.2, 9.6, -0.14, 0.20, 0.18, 0xfffaf0, 8.8);
    // Second window pane separated by architectural mullion gap for realistic studio window reflection across Alabaster bezel & dial
    addSoftbox(4.4, 11.5, -3.8, 2.6, 9.2, -0.16, -0.32, 0.15, 0xfff8eb, 6.5);
    // Overhead specular strip bank
    addSoftbox(12.0, 4.5, 0.0, 9.5, 3.5, Math.PI * 0.45, 0.0, 0.0, 0xffffff, 7.2);
    // Right grazing rim reflector
    addSoftbox(6.5, 10.0, 8.2, 2.0, 5.5, 0.0, 0.72, 0.0, 0xe8f2ff, 5.2);
    // Lower tabletop warm bounce card
    addSoftbox(10.0, 6.0, 0.0, -6.5, 5.0, -Math.PI * 0.42, 0.0, 0.0, 0xf5ebd8, 2.6);
    return pmrem.fromScene(envScene, 0.025).texture;
  }

  _initRendererAndScene() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        preserveDrawingBuffer: true,
      });
    } catch (_) {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: false,
      });
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.84;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe4dfd5);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = this._buildStudioSoftboxEnv(pmrem);
    this.scene.environment = this.envTexture;
    this.scene.environmentIntensity = 0.35;

    this.camera = new THREE.PerspectiveCamera(34, w / h, 5.0, 4000.0);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.065;
    this.resize();
    this.setCameraPreset("front", true);
    this.controls.minDistance = 120.0;
    this.controls.maxDistance = 1150.0;
    this.controls.maxPolarAngle = Math.PI * 0.54;
    this.controls.minPolarAngle = 0.12;
    this.controls.update();

    this.scene.add(this.clockGroup);
    this.resize();
  }

  _initMaterials() {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.procTextures = buildProceduralStudioTextures(THREE, maxAniso);

    // 1. Customizable Outer Bezel Material (Tactile Bead-Blasted Mineral + Satin Studio Reflection)
    this.bezelMat = new THREE.MeshPhysicalMaterial({
      color: 0xe0d9cb,
      map: this.procTextures.grainColorMap,
      roughness: 0.24,
      roughnessMap: this.procTextures.microRoughnessMap,
      bumpMap: this.procTextures.microRoughnessMap,
      bumpScale: 0.042,
      metalness: 0.06,
      reflectivity: 0.74,
      clearcoat: 0.38,
      clearcoatRoughness: 0.16,
      clearcoatNormalMap: this.procTextures.microNormalMap,
      clearcoatNormalScale: new THREE.Vector2(0.09, 0.09),
      envMapIntensity: 0.48,
      normalMap: this.procTextures.microNormalMap,
      normalScale: new THREE.Vector2(0.18, 0.18),
    });

    // 2. Customizable Recessed Dial Faceplate Material (Tactile Honed Ceramic Matte + Grazing Specular Sheen)
    this.dialMat = new THREE.MeshPhysicalMaterial({
      color: 0xe6dfd2,
      map: this.procTextures.grainColorMap,
      roughness: 0.27,
      roughnessMap: this.procTextures.microRoughnessMap,
      bumpMap: this.procTextures.microRoughnessMap,
      bumpScale: 0.032,
      metalness: 0.04,
      reflectivity: 0.66,
      clearcoat: 0.30,
      clearcoatRoughness: 0.18,
      clearcoatNormalMap: this.procTextures.microNormalMap,
      clearcoatNormalScale: new THREE.Vector2(0.07, 0.07),
      envMapIntensity: 0.42,
      normalMap: this.procTextures.microNormalMap,
      normalScale: new THREE.Vector2(0.14, 0.14),
    });

    // 3. Customizable +0.6mm Raised Typography & Connected Arch Material (High-Contrast Matte Braun Instrument Ink)
    this.inlayMat = new THREE.MeshPhysicalMaterial({
      color: 0x111316,
      roughness: 0.52,
      metalness: 0.04,
      clearcoat: 0.05,
      clearcoatRoughness: 0.35,
      envMapIntensity: 0.30,
    });

    // 4. Customizable Stepper Hands Material (High-Gloss Lacquered Instrument Baton)
    this.handsMat = new THREE.MeshPhysicalMaterial({
      color: 0xe83505,
      emissive: 0x3a0900,
      emissiveIntensity: 0.16,
      roughness: 0.08,
      metalness: 0.04,
      clearcoat: 0.96,
      clearcoatRoughness: 0.03,
      envMapIntensity: 1.5,
    });

    // 5. Customizable Internal Engineering Deck & C-Clips Material
    this.deckMat = new THREE.MeshPhysicalMaterial({
      color: 0xcf2f04,
      roughness: 0.28,
      metalness: 0.04,
      clearcoat: 0.22,
      clearcoatRoughness: 0.18,
      normalMap: this.procTextures.microNormalMap,
      normalScale: new THREE.Vector2(0.24, 0.24),
    });

    // Fixed authentic internal hardware materials
    this.hwMats = {
      shadowMoat: new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.85, metalness: 0.1 }),
      brushedSteel: new THREE.MeshPhysicalMaterial({
        color: 0xc4c9cf,
        roughness: 0.24,
        metalness: 0.88,
        clearcoat: 0.25,
        normalMap: this.procTextures.microNormalMap,
        normalScale: new THREE.Vector2(0.12, 0.12),
      }),
      turnedBrass: new THREE.MeshPhysicalMaterial({
        color: 0xd8ad48,
        roughness: 0.20,
        metalness: 0.92,
        clearcoat: 0.30,
      }),
      blackPcb: new THREE.MeshPhysicalMaterial({
        color: 0x121518,
        roughness: 0.28,
        metalness: 0.22,
        clearcoat: 0.45,
      }),
      epoxyIc: new THREE.MeshStandardMaterial({ color: 0x181a1d, roughness: 0.35, metalness: 0.15 }),
      whiteNylon: new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.30, metalness: 0.05 }),
      handCapWhite: new THREE.MeshPhysicalMaterial({
        color: 0xf6f4ee,
        roughness: 0.14,
        metalness: 0.04,
        clearcoat: 0.85,
      }),
      blueBoot: new THREE.MeshStandardMaterial({ color: 0x2266b8, roughness: 0.35, metalness: 0.08 }),
      goldPin: new THREE.MeshPhysicalMaterial({ color: 0xe5b842, roughness: 0.15, metalness: 0.95 }),
      amberLed: new THREE.MeshStandardMaterial({
        color: 0xffc438,
        emissive: 0xff7b00,
        emissiveIntensity: 4.8,
        roughness: 0.10,
      }),
      wireBlue: new THREE.MeshStandardMaterial({ color: 0x2668c4, roughness: 0.36, metalness: 0.08 }),
      wirePink: new THREE.MeshStandardMaterial({ color: 0xd44272, roughness: 0.36, metalness: 0.08 }),
      wireYellow: new THREE.MeshStandardMaterial({ color: 0xe2a822, roughness: 0.36, metalness: 0.08 }),
      wireOrange: new THREE.MeshStandardMaterial({ color: 0xd95318, roughness: 0.36, metalness: 0.08 }),
      wireRed: new THREE.MeshStandardMaterial({ color: 0xc42420, roughness: 0.36, metalness: 0.08 }),
      braidedCord: new THREE.MeshStandardMaterial({
        color: 0x454340,
        roughness: 0.68,
        metalness: 0.12,
        normalMap: this.procTextures.infillNormalMap,
        normalScale: new THREE.Vector2(0.35, 0.35),
      }),
      rearAcrylic: new THREE.MeshPhysicalMaterial({
        color: 0xf8fbff,
        roughness: 0.05,
        metalness: 0.02,
        transmission: 0.84,
        transparent: true,
        opacity: 0.36,
        ior: 1.49,
        clearcoat: 1.0,
        clearcoatRoughness: 0.03,
        depthWrite: false,
      }),
      rearAcrylicEdge: new THREE.MeshPhysicalMaterial({
        color: 0xe8eff5,
        roughness: 0.22,
        metalness: 0.10,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    };
  }

  /**
   * Adds subtle perimeter contact ambient occlusion inside the 4.6mm recessed gallery basin
   * so the inner step between the bezel and dial faceplate has deep architectural shadow depth.
   */
  _initRecessedBasinAO() {
    const aoCanvas = document.createElement("canvas");
    aoCanvas.width = 512;
    aoCanvas.height = 640;
    this.basinAOCanvas = aoCanvas;
    this.basinAOCtx = aoCanvas.getContext("2d");
    this.basinAOTex = new THREE.CanvasTexture(aoCanvas);
    this.basinAOTex.colorSpace = THREE.SRGBColorSpace;

    this._redrawBasinAO(false);

    // Matches the exact 167.9 x 213.9mm recessed dial opening at Z = -4.60mm
    const aoGeo = new THREE.PlaneGeometry(167.9, 213.9);
    this.basinAOMat = new THREE.MeshBasicMaterial({
      map: this.basinAOTex,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      toneMapped: false,
    });
    const aoMesh = new THREE.Mesh(aoGeo, this.basinAOMat);
    aoMesh.position.set(0.0, 0.0, -4.44);
    aoMesh.renderOrder = 1;
    this.basinAOGroup.add(aoMesh);
    this.basinAOGroup.visible = false;
    this.glbLoaded = false;
  }

  _redrawBasinAO(isNight = false) {
    if (!this.basinAOCtx || !this.basinAOCanvas) return;
    const ctx = this.basinAOCtx;
    const w = this.basinAOCanvas.width;
    const h = this.basinAOCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // 1. Top inner bezel lip cast shadow onto recessed dial
    const topGrad = ctx.createLinearGradient(0, 0, 0, 62);
    topGrad.addColorStop(0.0, isNight ? "rgba(2, 6, 16, 0.66)" : "rgba(18, 16, 14, 0.38)");
    topGrad.addColorStop(0.42, isNight ? "rgba(2, 6, 16, 0.26)" : "rgba(18, 16, 14, 0.14)");
    topGrad.addColorStop(1.0, "rgba(0, 0, 0, 0.0)");
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, w, 62);

    // 2. Primary raking side bezel wall shadow (Right wall in Daylight from upper-right keyLight; Left wall in Nightlight)
    if (!isNight) {
      const rightGrad = ctx.createLinearGradient(w, 0, w - 56, 0);
      rightGrad.addColorStop(0.0, "rgba(18, 16, 14, 0.36)");
      rightGrad.addColorStop(0.45, "rgba(18, 16, 14, 0.13)");
      rightGrad.addColorStop(1.0, "rgba(0, 0, 0, 0.0)");
      ctx.fillStyle = rightGrad;
      ctx.fillRect(w - 56, 0, 56, h);

      const leftContact = ctx.createLinearGradient(0, 0, 24, 0);
      leftContact.addColorStop(0.0, "rgba(18, 16, 14, 0.18)");
      leftContact.addColorStop(1.0, "rgba(0, 0, 0, 0.0)");
      ctx.fillStyle = leftContact;
      ctx.fillRect(0, 0, 24, h);
    } else {
      const leftGrad = ctx.createLinearGradient(0, 0, 60, 0);
      leftGrad.addColorStop(0.0, "rgba(2, 6, 16, 0.62)");
      leftGrad.addColorStop(0.45, "rgba(2, 6, 16, 0.24)");
      leftGrad.addColorStop(1.0, "rgba(0, 0, 0, 0.0)");
      ctx.fillStyle = leftGrad;
      ctx.fillRect(0, 0, 60, h);
    }

    // 3. Bottom inner bezel crease contact AO
    const botGrad = ctx.createLinearGradient(0, h, 0, h - 26);
    botGrad.addColorStop(0.0, isNight ? "rgba(2, 6, 16, 0.38)" : "rgba(18, 16, 14, 0.18)");
    botGrad.addColorStop(1.0, "rgba(0, 0, 0, 0.0)");
    ctx.fillStyle = botGrad;
    ctx.fillRect(0, h - 26, w, 26);

    // 4. Subtle contact & drop shadow under the Upper (Y=+25.3mm) and Lower (Y=-78.2mm) Stepper Hand Bosses
    const drawHubAO = (mmX, mmY, rPx) => {
      const cx = (mmX / 167.9 + 0.5) * w + (isNight ? 5 : -5);
      const cy = (0.5 - mmY / 213.9) * h + 5;
      const g = ctx.createRadialGradient(cx, cy, rPx * 0.15, cx, cy, rPx);
      g.addColorStop(0.0, isNight ? "rgba(2, 6, 16, 0.48)" : "rgba(18, 16, 14, 0.30)");
      g.addColorStop(0.55, isNight ? "rgba(2, 6, 16, 0.16)" : "rgba(18, 16, 14, 0.10)");
      g.addColorStop(1.0, "rgba(0, 0, 0, 0.0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
      ctx.fill();
    };
    drawHubAO(0.0, 25.3, 24);
    drawHubAO(0.0, -78.2, 18);

    if (this.basinAOTex) this.basinAOTex.needsUpdate = true;
  }

  /**
   * Builds the Studio Cyclorama Environment + True 3D Blender / AutoCAD Perspective Floor Grid with Subtle Live Swell Undulation
   */
  _initStudioEnvironment() {
    this.swellHeightM = 1.9;
    this.swellPeriodS = 13;
    this.swellDir = "SSE";
    this.worthItScore = 8.2;
    this.wavePulseTime = -99.0;
    this.wavePulseStrength = 0.0;

    // 1. Pure Scene Background (Zero 2048x1024 offscreen canvas overhead)

    // 2. TRUE 3D BLENDER / AUTOCAD PERSPECTIVE FLOOR GRID + SUBTLE LIVE 3D SWELL UNDULATION + GROUND CONTACT SHADOW
    // True 3D Blender / AutoCAD Perspective Ground Grid with Subtle Real-Time Ocean Swell Undulation
    // Sits horizontally at Y = -115.4mm (the exact bottom of the 184x230x46mm clock monolith) and fades smoothly
    // behind the base so it never climbs up behind the middle of the clock!
    this.swellAccentCurrent = new THREE.Color(0xff4f00);
    this.swellAccentTarget = new THREE.Color(0xff4f00);
    this.swellAccentHex = "#FF4F00";
    this.swellBgColor = new THREE.Color(0xfaf8f4);

    this.swellUniforms = {
      uTime: { value: 0.0 },
      uSwellHeight: { value: 1.9 },
      uSwellPeriod: { value: 13.0 },
      uWorthIt: { value: 8.2 },
      uSwellAngle: { value: 0.38 },
      uAccentColor: { value: new THREE.Color(0xff4f00) },
      uBgColor: { value: new THREE.Color(0xfaf8f4) },
      uIsNight: { value: 0.0 },
      uMacroFade: { value: 1.0 },
      uExplodeFade: { value: 0.0 },
      uPulseTime: { value: -99.0 },
      uPulseStrength: { value: 0.0 },
    };

    const swellGeo = new THREE.PlaneGeometry(1480, 620, 128, 56);
    swellGeo.rotateX(-Math.PI * 0.5); // True horizontal X-Z studio ground plane

    this.swellMat = new THREE.ShaderMaterial({
      uniforms: this.swellUniforms,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      side: THREE.DoubleSide,
      extensions: { derivatives: true },
      vertexShader: `
        uniform float uTime;
        uniform float uSwellHeight;
        uniform float uSwellPeriod;
        uniform float uWorthIt;
        uniform float uSwellAngle;
        uniform float uExplodeFade;
        uniform float uPulseTime;
        uniform float uPulseStrength;

        varying vec3 vWorldPos;
        varying float vHeaveNorm;
        varying float vCalmMask;

        void main() {
          vec3 pos = position;
          vec4 worldPos4 = modelMatrix * vec4(pos, 1.0);
          vec2 xz = worldPos4.xz;

          // Keep the studio floor directly beneath the clock base (R < 95mm) calm & level so the monolith sits flush
          float footDist = length((xz - vec2(0.0, -4.0)) * vec2(0.82, 1.65));
          float calmMask = smoothstep(68.0, 165.0, footDist);

          // Subtle distance attenuation toward horizon edges
          float radialDist = length(xz * vec2(0.55, 1.15));
          float distFade = 1.0 - smoothstep(220.0, 620.0, radialDist);

          // Propagate swell along the beach's real compass swell angle
          vec2 swellDir = vec2(cos(uSwellAngle), sin(uSwellAngle));
          vec2 crossDir = vec2(-swellDir.y, swellDir.x);

          float freq = 0.015 / max(0.60, uSwellPeriod * 0.082);
          float speed = (1.10 + clamp(uWorthIt, 1.0, 10.0) * 0.05) * (10.5 / max(5.0, uSwellPeriod));
          float phase = dot(xz, swellDir) * freq - uTime * speed;
          float crossPhase = dot(xz, crossDir) * (freq * 0.52) + uTime * speed * 0.34;

          // Whisper-subtle, hypnotic 3D groundswell undulation (1.4mm on small days -> 5.5mm on solid groundswells)
          float amp = (0.65 + clamp(uSwellHeight, 0.25, 4.5) * 1.45) * calmMask * distFade * (1.0 - uExplodeFade * 0.65);

          float w1 = sin(phase);
          float w2 = 0.28 * sin(phase * 1.95 + crossPhase * 0.75 + 0.8);
          float w3 = 0.14 * cos(crossPhase * 1.35 - uTime * 0.45);
          float heave = (w1 + w2 + w3) * amp;

          // Interactive concentric ripple when switching beaches or colorways
          float pAge = uTime - uPulseTime;
          float pulseBoost = 0.0;
          if (pAge >= 0.0 && pAge < 3.0 && uPulseStrength > 0.001) {
            float rDist = length(xz);
            float ringRadius = pAge * 260.0;
            float ringEnv = exp(-pow((rDist - ringRadius) * 0.015, 2.0)) * exp(-pAge * 1.35);
            float ripple = sin((rDist - ringRadius) * 0.075) * ringEnv * 3.8 * uPulseStrength * calmMask;
            heave += ripple;
            pulseBoost = ringEnv * 0.65;
          }

          pos.y += heave;
          vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
          vHeaveNorm = clamp((w1 + w2 + 1.25) / 2.5 + pulseBoost, 0.0, 1.0);
          vCalmMask = calmMask;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uAccentColor;
        uniform vec3 uBgColor;
        uniform float uIsNight;
        uniform float uMacroFade;
        uniform float uExplodeFade;

        varying vec3 vWorldPos;
        varying float vHeaveNorm;
        varying float vCalmMask;

        void main() {
          if (uMacroFade <= 0.004) discard;

          // 1. Confine the 3D Blender/AutoCAD floor grid strictly to the studio floor plane (Z > -145mm)
          // so it dissolves cleanly behind the clock base and NEVER rises up behind the middle of the clock!
          float backFade = smoothstep(-88.0, -14.0, vWorldPos.z);
          float frontFade = 1.0 - smoothstep(260.0, 440.0, vWorldPos.z);
          float sideFade = 1.0 - smoothstep(280.0, 680.0, abs(vWorldPos.x));
          float horizonFade = backFade * frontFade * sideFade;
          if (horizonFade <= 0.002) discard;

          // 2. Blender / AutoCAD Derivative-Anti-Aliased 3D Floor Grid (24mm Minor Cells, 120mm Major Cells)
          vec2 coordMinor = vWorldPos.xz / 24.0;
          vec2 fwMinor = max(fwidth(coordMinor), vec2(0.0001));
          vec2 gridMinor = abs(fract(coordMinor - 0.5) - 0.5) / fwMinor;
          float lineMinor = 1.0 - smoothstep(0.0, 1.15, min(gridMinor.x, gridMinor.y));
          float minorLod = 1.0 - smoothstep(0.14, 0.36, max(fwMinor.x, fwMinor.y));
          lineMinor *= minorLod;

          vec2 coordMajor = vWorldPos.xz / 120.0;
          vec2 fwMajor = max(fwidth(coordMajor), vec2(0.0001));
          vec2 gridMajor = abs(fract(coordMajor - 0.5) - 0.5) / fwMajor;
          float lineMajor = 1.0 - smoothstep(0.0, 1.28, min(gridMajor.x, gridMajor.y));
          float majorLod = 1.0 - smoothstep(0.20, 0.50, max(fwMajor.x, fwMajor.y));
          lineMajor *= majorLod;

          // Subtle horizontal X-datum baseline directly aligned with the clock front face (Z = 0)
          vec2 fwWorld = max(fwidth(vWorldPos.xz), vec2(0.001));
          float axisX = (1.0 - smoothstep(0.0, 1.35, abs(vWorldPos.z) / fwWorld.y)) * majorLod;

          // 3. Whisper-subtle Colorway Accent Illumination on Rising 3D Swell Crests
          float crestGlow = smoothstep(0.50, 0.90, vHeaveNorm) * vCalmMask;
          vec3 cadMinorCol = mix(vec3(0.64, 0.61, 0.57), vec3(0.18, 0.27, 0.42), uIsNight);
          vec3 cadMajorCol = mix(vec3(0.46, 0.44, 0.40), vec3(0.26, 0.40, 0.62), uIsNight);

          float accentMix = clamp(crestGlow * 0.72 + axisX * 0.55 + lineMajor * crestGlow * 0.35, 0.0, 1.0);
          vec3 baseGridCol = mix(cadMinorCol, cadMajorCol, clamp(lineMajor + axisX, 0.0, 1.0));
          vec3 gridColor = mix(baseGridCol, uAccentColor, accentMix);

          float minorAlpha = lineMinor * mix(0.095, 0.14, uIsNight);
          float majorAlpha = lineMajor * mix(0.19, 0.28, uIsNight);
          float datumAlpha = axisX * mix(0.28, 0.38, uIsNight);
          float crestBoost = (lineMinor * 0.12 + lineMajor * 0.22) * crestGlow;
          float gridAlpha = clamp(max(max(minorAlpha, majorAlpha), datumAlpha) + crestBoost, 0.0, 0.68);

          // 4. Grounded 3D Contact AO + Directional Cast Shadow Strictly Under the Clock Base (Y = -115.4mm)
          vec2 pContact = (vWorldPos.xz - vec2(0.0, -3.5)) / vec2(94.0, 25.0);
          float dContact = length(max(abs(pContact) - vec2(0.76, 0.54), 0.0));
          float contactAO = exp(-dContact * dContact * 8.2) * mix(0.54, 0.76, uIsNight);

          vec2 castDir = mix(vec2(-46.0, -24.0), vec2(48.0, -22.0), uIsNight);
          vec2 pCast = (vWorldPos.xz - castDir) / vec2(118.0, 52.0);
          float dCast = length(max(abs(pCast) - vec2(0.48, 0.32), 0.0));
          float castSoft = exp(-dCast * dCast * 2.6) * mix(0.26, 0.42, uIsNight);

          float shadowStrength = (1.0 - uExplodeFade * 0.85);
          float floorShadowAlpha = clamp((contactAO + castSoft) * shadowStrength, 0.0, 0.78);
          vec3 shadowColor = mix(vec3(0.09, 0.08, 0.07), vec3(0.01, 0.02, 0.05), uIsNight);

          // Composite CAD floor grid + grounded clock contact shadow
          float outAlpha = clamp(gridAlpha * horizonFade + floorShadowAlpha * (1.0 - gridAlpha * 0.25), 0.0, 0.88) * uMacroFade;
          vec3 outColor = mix(gridColor, shadowColor, floorShadowAlpha / max(0.001, gridAlpha * horizonFade + floorShadowAlpha));

          gl_FragColor = vec4(outColor, outAlpha);
        }
      `,
    });

    this.swellMesh = new THREE.Mesh(swellGeo, this.swellMat);
    // True horizontal studio floor plane directly under the clock base (Y = -115.0mm)
    this.swellMesh.position.set(0.0, -115.5, 0.0);
    this.swellMesh.rotation.set(-0.045, 0.0, 0.0);
    this.swellMesh.renderOrder = -1;
    this.scene.add(this.swellMesh);

    this._updateWallWaveform(0.0);

    // 3. Sculptural Studio & Twilight Lighting Rig (Smoothly interpolates between Daylight & Nightlight!)
    this.keyLight = new THREE.DirectionalLight(0xfffaf0, 1.95);
    this.keyLight.position.set(280.0, 152.0, 142.0);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.width = 2048;
    this.keyLight.shadow.mapSize.height = 2048;
    this.keyLight.shadow.camera.near = 50.0;
    this.keyLight.shadow.camera.far = 700.0;
    const d = 132.0;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.00045;
    this.keyLight.shadow.normalBias = 0.018;
    this.keyLight.shadow.radius = 1.45;
    this.scene.add(this.keyLight);

    this.goboGroup = new THREE.Group();
    this.goboGroup.visible = false;

    this.fillLight = new THREE.DirectionalLight(0xe8eef5, 0.14);
    this.fillLight.position.set(-250.0, 40.0, 160.0);
    this.scene.add(this.fillLight);

    this.rimLight = new THREE.DirectionalLight(0xffe8cc, 1.18);
    this.rimLight.position.set(-220.0, 190.0, -160.0);
    this.scene.add(this.rimLight);

    this.rearBayLight = new THREE.DirectionalLight(0xfff8ee, 1.65);
    this.rearBayLight.position.set(140.0, 120.0, -340.0);
    this.scene.add(this.rearBayLight);

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.10);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0xe8e2d6, 0.28);
    this.scene.add(this.hemiLight);

    this.bounceLight = new THREE.DirectionalLight(0xfff8ee, 0.34);
    this.bounceLight.position.set(-50.0, -210.0, 220.0);
    this.scene.add(this.bounceLight);

    // Near-field localized studio/twilight PointLight for diagonal surface sheen & nocturnal instrument glow
    this.frontSheenLight = new THREE.PointLight(0xfffaf2, 1.35, 295.0, 0.0);
    this.frontSheenLight.position.set(-108.0, 128.0, 138.0);
    this.scene.add(this.frontSheenLight);

    // Dedicated Nightlight grazing top-left lunar rim & lower-right warm sunset/instrument light
    this.twilightRimLight = new THREE.PointLight(0xff7a22, 0.0, 260.0, 0.0);
    this.twilightRimLight.position.set(132.0, -95.0, 96.0);
    this.scene.add(this.twilightRimLight);

    this.wavePulseTime = -99.0;
    this.wavePulseStrength = 0.0;

    this.setLightingMode("daylight", true);
  }

  /**
   * Dynamically sets the 3D Ocean Swell key color to match the user's active colorway!
   */
  setSwellAccentColor(hexStr, immediate = false) {
    if (!hexStr) return;
    this.swellAccentHex = hexStr;
    const c = new THREE.Color(hexStr);
    // In Nightlight mode, boost luminosity slightly so dark/muted swatches still glow clearly against the midnight stage
    const hsl = {};
    c.getHSL(hsl);
    if (this.lightingMode === "nightlight") {
      if (hsl.s < 0.15) {
        c.setHex(0x38bdf8); // Sleek lunar cyan-blue for pure monochrome black/white/slate in night mode
      } else {
        c.setHSL(hsl.h, Math.min(1.0, hsl.s * 1.18 + 0.12), Math.max(0.56, Math.min(0.72, hsl.l * 1.25)));
      }
    } else {
      if (hsl.l > 0.82 && hsl.s < 0.25) {
        c.setHex(0xff4f00); // Fallback to Braun orange if a very pale neutral was passed
      } else if (hsl.l < 0.18) {
        c.setHSL(hsl.h, hsl.s, 0.28);
      }
    }
    this.swellAccentTarget.copy(c);
    if (immediate) {
      this.swellAccentCurrent.copy(c);
      if (this.swellUniforms) {
        this.swellUniforms.uAccentColor.value.copy(c);
      }
    }
    this._redrawBackdropCyclorama();
  }

  /**
   * Updates live swell telemetry & triggers immediate waveform update
   */
  setSwellTelemetry({ swellHeightM, swellPeriodS, swellDir, worthItScore, activeBeachIndex }) {
    if (swellHeightM != null) this.swellHeightM = Number(swellHeightM);
    if (swellPeriodS != null) this.swellPeriodS = Number(swellPeriodS);
    if (swellDir != null) this.swellDir = String(swellDir);
    if (worthItScore != null) this.worthItScore = Number(worthItScore);
    if (activeBeachIndex != null) this.activeBeachIndex = Number(activeBeachIndex);
    if (this.swellUniforms) {
      this.swellUniforms.uSwellHeight.value = this.swellHeightM || 1.9;
      this.swellUniforms.uSwellPeriod.value = this.swellPeriodS || 13.0;
      this.swellUniforms.uWorthIt.value = this.worthItScore || 8.2;
      const dirMap = {
        N: 0.0, NNE: 0.39, NE: 0.78, ENE: 1.18, E: 1.57, ESE: 1.96, SE: 2.35, SSE: 2.75,
        S: 3.14, SSW: 3.53, SW: 3.92, WSW: 4.32, W: 4.71, WNW: 5.10, NW: 5.50, NNW: 5.89
      };
      const baseAng = dirMap[this.swellDir] ?? 0.38;
      const slotOffset = ((this.activeBeachIndex || 0) - 2) * 0.24;
      this.swellUniforms.uSwellAngle.value = baseAng + slotOffset;
    }
  }

  triggerWavePulse(strength = 1.0) {
    this.wavePulseTime = performance.now() * 0.001;
    this.wavePulseStrength = strength;
    if (this.swellUniforms) {
      this.swellUniforms.uPulseTime.value = this.wavePulseTime;
      this.swellUniforms.uPulseStrength.value = this.wavePulseStrength;
    }
  }

  triggerPartyWaveSalute(onComplete) {
    if (this._saluteTimers && this._saluteTimers.length) {
      this._saluteTimers.forEach((id) => clearTimeout(id));
    }
    this._saluteTimers = [];
    this.triggerWavePulse(1.85);
    const seq = [
      { u: -120, l: -75, t: 0 },
      { u: 120, l: 75, t: 280 },
      { u: -60, l: 45, t: 560 },
      { u: 60, l: -45, t: 820 },
      { u: 0, l: 65, t: 1080 },
    ];
    seq.forEach((step) => {
      this._saluteTimers.push(
        setTimeout(() => {
          this.upperAngleTarget = step.u;
          this.lowerAngleTarget = step.l;
        }, step.t)
      );
    });
    this._saluteTimers.push(
      setTimeout(() => {
        this._saluteTimers = [];
        this.pointToBeachSlot(this.activeBeachIndex || 0);
        this.setWorthItScore(this.worthItScore || 8.2);
        if (onComplete) onComplete();
      }, 1420)
    );
  }

  _redrawBackdropCyclorama() {
    if (!this.wallCtx || !this.wallCanvas) return;
    const ctx = this.wallCtx;
    const w = this.wallCanvas.width;
    const h = this.wallCanvas.height;
    const isNight = this.lightingMode === "nightlight" || this.lightingMode === "dawn";

    // Pure Gallery-White Studio in Daylight; Deep Twilight Midnight Sky in Nightlight
    const bgTop = isNight ? "#04070F" : "#FDFCF9";
    const bgMid = isNight ? "#0A1222" : "#F8F6F0";
    const bgBot = isNight ? "#060A13" : "#EFECE4";

    const grad = ctx.createLinearGradient(0, h * 0.18, 0, h * 0.84);
    grad.addColorStop(0.0, bgTop);
    grad.addColorStop(0.52, bgMid);
    grad.addColorStop(1.0, bgBot);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle twilight horizon glow in Nightlight; crisp white studio softbox halo in Daylight
    const ac = this.swellAccentTarget || new THREE.Color(0xff4f00);
    const r = Math.round(ac.r * 255);
    const g = Math.round(ac.g * 255);
    const b = Math.round(ac.b * 255);

    const glowGrad = ctx.createRadialGradient(w * 0.5, h * 0.50, 20, w * 0.5, h * 0.50, 440);
    if (isNight) {
      glowGrad.addColorStop(0.0, `rgba(${r}, ${g}, ${b}, 0.15)`);
      glowGrad.addColorStop(0.48, "rgba(28, 64, 148, 0.08)");
      glowGrad.addColorStop(1.0, "rgba(0, 0, 0, 0.0)");
    } else {
      glowGrad.addColorStop(0.0, "rgba(255, 255, 255, 0.95)");
      glowGrad.addColorStop(0.60, "rgba(255, 254, 250, 0.45)");
      glowGrad.addColorStop(1.0, "rgba(255, 255, 255, 0.0)");
    }
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, w, h);

    if (this.wallTex) {
      this.wallTex.needsUpdate = true;
    }
  }

  _updateWallWaveform(nowSec = 0.0) {
    if (this.swellUniforms) {
      this.swellUniforms.uTime.value = nowSec;
      this.swellAccentCurrent.lerp(this.swellAccentTarget, 0.12);
      this.swellUniforms.uAccentColor.value.copy(this.swellAccentCurrent);
      let macroTarget = 1.0;
      if (this.camera) {
        const camDist = this.camera.position.length();
        // Smoothly fade out background swell when zooming in close (Close-Up / Sub-Dial) or in Rear view
        const zoomFade = Math.max(0.0, Math.min(1.0, (camDist - 255.0) / 140.0));
        const rearFade = this.camera.position.z < -80.0 ? 0.18 : 1.0;
        const expFade = Math.max(0.15, 1.0 - (this.explodeCurrent || 0.0) * 0.65);
        macroTarget = zoomFade * rearFade * expFade;
      }
      this.swellUniforms.uMacroFade.value += (macroTarget - this.swellUniforms.uMacroFade.value) * 0.16;
      if (this.swellMesh) {
        this.swellMesh.visible = this.swellUniforms.uMacroFade.value > 0.004;
      }
    }
    if (this.frontSheenLight && this.lightingMode !== "nightlight") {
      this.frontSheenLight.position.x = 78.0 + Math.sin(nowSec * 0.85) * 24.0;
      this.frontSheenLight.position.y = 88.0 + Math.cos(nowSec * 0.65) * 18.0;
    }
  }

  _initExplodedAxisGuides() {
    // 6 Coaxial Dashed Brushed-Gold Alignment Rods (Upper Shaft, Lower Shaft, 4 Corner M3 Screws)
    const guideMat = new THREE.MeshBasicMaterial({
      color: 0xc59b38,
      transparent: true,
      opacity: 0.75,
    });
    const axes = [
      [0.0, 25.3, -145.0, 165.0],
      [0.0, -78.2, -145.0, 165.0],
      [-80.96, -103.96, -290.0, 5.0],
      [80.96, -103.96, -290.0, 5.0],
      [-80.96, 103.96, -290.0, 5.0],
      [80.96, 103.96, -290.0, 5.0],
    ];
    const dashGeo = new THREE.BoxGeometry(0.65, 0.65, 4.8);
    for (const [ax, ay, z0, z1] of axes) {
      for (let z = z0; z < z1; z += 9.0) {
        const m = new THREE.Mesh(dashGeo, guideMat);
        m.position.set(ax, ay, z + 2.4);
        this.explodedGuidesGroup.add(m);
      }
    }
    this.explodedGuidesGroup.visible = false;
  }

  _initDialHitTargets() {
    // Invisible raycast discs on the 5 beach positions so clicking a beach on the 3D clock sweeps the hand!
    const hitGeo = new THREE.CircleGeometry(18.5, 24);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    DIAL_SLOTS.forEach((slot, idx) => {
      const mesh = new THREE.Mesh(hitGeo, hitMat);
      mesh.position.set(slot.cx * 0.85, slot.cy, -3.5);
      mesh.userData = { slotIndex: idx };
      this.hitTargetsGroup.add(mesh);
    });
  }

  _bindInteraction() {
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    this.canvas.addEventListener("pointerdown", (e) => {
      downX = e.clientX;
      downY = e.clientY;
    });

    let lastHoverCheck = 0;
    let lastCursor = "grab";
    this.canvas.addEventListener("pointermove", (e) => {
      if (e.buttons !== 0 || e.pointerType === "touch") return;
      const now = performance.now();
      if (now - lastHoverCheck < 32) return;
      lastHoverCheck = now;
      const rect = this._canvasRect || this.canvas.getBoundingClientRect();
      this._canvasRect = rect;
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.hitTargetsGroup.children, false);
      const nextCursor = hits.length > 0 ? "pointer" : "grab";
      if (nextCursor !== lastCursor) {
        lastCursor = nextCursor;
        this.canvas.style.cursor = nextCursor;
      }
    });

    this.canvas.addEventListener("pointerup", (e) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.hitTargetsGroup.children, false);
      if (hits.length > 0) {
        const idx = hits[0].object.userData.slotIndex;
        if (idx != null) {
          this.pointToBeachSlot(idx);
          this.onBeachClick(idx);
        }
      }
    });

    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    if (this.camera) {
      const aspect = w / Math.max(1, h);
      this.camera.aspect = aspect;
      this.camera.fov = aspect < 0.78 ? Math.min(52, 34 / Math.pow(aspect, 0.54)) : aspect < 1.0 ? Math.min(45, 34 / Math.pow(aspect, 0.35)) : 34;
      this.camera.updateProjectionMatrix();
    }
    this._canvasRect = null;
    if (this.renderer) {
      this.renderer.setSize(w, h, false);
    }
  }

  _loadMasterGLB() {
    const loader = new GLTFLoader();
    loader.load(
      "./assets/surf_clock_v9_master.glb",
      (gltf) => {
        const root = gltf.scene;

        // First, un-mirror Duo_Rear_Root children along X so that when viewed from the back (-Z),
        // ESP32-S3 is on the LEFT, dual ULN2003 boards are on the RIGHT, and IC markings read left-to-right!
        const duoRearRoot = root.getObjectByName("Duo_Rear_Root");
        if (duoRearRoot) {
          const seenGeoms = new Set();
          duoRearRoot.children.forEach((child) => {
            // Coiled tabletop cord stays in world space; mirror all internal rear bay components
            if (child.name && child.name.includes("Coiled_Tabletop_USBC_Cord")) return;
            child.position.x = -child.position.x;
            child.traverse((m) => {
              if (m.isMesh && m.geometry && !seenGeoms.has(m.geometry)) {
                seenGeoms.add(m.geometry);
                mirrorGeometryXInPlace(m.geometry);
              }
            });
          });
        }

        root.traverse((obj) => {
          if (!obj.isMesh) return;
          ensureTriplanarUVs(obj.geometry, 0.026);
          const nm = [obj.name, obj.parent ? obj.parent.name : ""].filter(Boolean).join("__");
          this.meshesByName[nm] = obj;
          // If this mesh is a primitive inside a multi-material CAD Group under Duo_Rear_Root / Left_Clock_Root,
          // apply explosion Z offsets to the CAD Group itself so rotated Groups move along World Z (not Local Z)!
          const moveTarget =
            obj.parent &&
            obj.parent !== root &&
            obj.parent.name !== "Duo_Rear_Root" &&
            obj.parent.name !== "Left_Clock_Root"
              ? obj.parent
              : obj;
          if (!this.basePositions.has(moveTarget)) {
            this.basePositions.set(moveTarget, moveTarget.position.clone());
          }
          const isExteriorShadowCaster = nm.includes('bezel') || nm.includes('dial_v2_flush') || nm.includes('Ticks_And_Arch') || nm.includes('beach_hand') || nm.includes('cond_hand');
          obj.castShadow = isExteriorShadowCaster;
          obj.receiveShadow = isExteriorShadowCaster;

          // Assign materials & 9-tier coaxial explosion Z offsets (in Three.js: +Z is front, -Z is rear)
          if (nm.includes("SurfClock_Master_60fps_Rig_bezel")) {
            obj.material = this.bezelMat;
            obj.receiveShadow = true;
            this.bezelMesh = obj;
            this.explodedOffsetsZ.set(moveTarget, -78.0);
            const skirtGroup = new THREE.Group();
            const wallDepth = 3.1;
            const wallZ = -3.12;
            const topW = new THREE.Mesh(new THREE.BoxGeometry(174.0, 3.2, wallDepth), this.bezelMat);
            topW.position.set(0.0, 106.95 + 1.6, wallZ);
            const botW = new THREE.Mesh(new THREE.BoxGeometry(174.0, 3.2, wallDepth), this.bezelMat);
            botW.position.set(0.0, -106.95 - 1.6, wallZ);
            const leftW = new THREE.Mesh(new THREE.BoxGeometry(3.2, 220.0, wallDepth), this.bezelMat);
            leftW.position.set(-83.95 - 1.6, 0.0, wallZ);
            const rightW = new THREE.Mesh(new THREE.BoxGeometry(3.2, 220.0, wallDepth), this.bezelMat);
            rightW.position.set(83.95 + 1.6, 0.0, wallZ);
            for (const wMesh of [topW, botW, leftW, rightW]) {
              wMesh.castShadow = false;
              wMesh.receiveShadow = false;
              skirtGroup.add(wMesh);
            }
            this.clockGroup.add(skirtGroup);
            this.basePositions.set(skirtGroup, new THREE.Vector3(0, 0, 0));
            this.explodedOffsetsZ.set(skirtGroup, -78.0);

          } else if (nm.includes("SurfClock_Master_60fps_Rig_dial_v2_flush")) {
            // Replace baked Sydney dial mesh with a 100% pure blank recessed faceplate so zero ghost text exists!
            const oldGeo = obj.geometry;
            obj.geometry = buildPureDialFaceplateGeometry(THREE);
            ensureTriplanarUVs(obj.geometry, 0.026);
            if (oldGeo) oldGeo.dispose();
            obj.material = this.dialMat;
            this.explodedOffsetsZ.set(moveTarget, 96.0);
          } else if (nm.includes("Dial_Shadow_Moat_Backer")) {
            obj.visible = false;
            obj.castShadow = false;
            obj.receiveShadow = false;
            this.shadowMoatMesh = obj;
            this.explodedOffsetsZ.set(moveTarget, 24.0);
          } else if (nm.includes("Static_Dial_Ticks_And_Arch")) {
            // Use the genuine 160-segment Blender-beveled 9 upper ticks & connected L-corner arch from surf_clock_v9_master.glb!
            obj.visible = true;
            obj.material = this.inlayMat;
            obj.castShadow = true;
            obj.receiveShadow = true;
            this.staticTicksMesh = obj;
            this.explodedOffsetsZ.set(moveTarget, 144.0);
          } else if (nm.includes("SurfClock_Master_60fps_Rig_beach_hand")) {
            obj.material = this.handsMat;
            this.beachHandMesh = moveTarget;
            this.explodedOffsetsZ.set(moveTarget, 198.0);
          } else if (nm.includes("SurfClock_Master_60fps_Rig_cond_hand")) {
            obj.material = this.handsMat;
            this.condHandMesh = moveTarget;
            this.explodedOffsetsZ.set(moveTarget, 198.0);
          } else if (nm.includes("Front_") && nm.includes("DShaft")) {
            obj.material = this.hwMats.turnedBrass;
            const bp = this.basePositions.get(moveTarget);
            bp.z = -6.20;
            moveTarget.position.z = -6.20;
            moveTarget.visible = false;
            this.dShaftMeshes.push(moveTarget);
            this.explodedOffsetsZ.set(moveTarget, 124.0);
          } else if (
            nm.includes("carrier") ||
            nm.includes("Ribbed_Engineering_Deck") ||
            nm.includes("Orange_Clips") ||
            nm.includes("Carrier_Boss_Threads")
          ) {
            obj.material = this.deckMat;
            this.explodedOffsetsZ.set(moveTarget, 36.0);
          } else if (nm.includes("Data_Plaques")) {
            obj.material = this.hwMats.blackPcb;
            this.explodedOffsetsZ.set(moveTarget, 36.0);
          } else if (nm.includes("Molded_Spec_Text") || nm.includes("IC_Markings")) {
            // Replaced by dynamic un-mirrored `this.rearPlaqueTypoMesh`
            obj.visible = false;
            obj.castShadow = false;
            this.explodedOffsetsZ.set(moveTarget, 36.0);
          } else if (nm.includes("Stepper_BrassHub") || nm.includes("Shaft_Axis_Marker")) {
            obj.material = this.hwMats.turnedBrass;
            this.explodedOffsetsZ.set(moveTarget, -16.0);
          } else if (nm.includes("Stepper_boot")) {
            obj.material = this.hwMats.blueBoot;
            this.explodedOffsetsZ.set(moveTarget, -16.0);
          } else if (nm.includes("Stepper_")) {
            obj.material = this.hwMats.brushedSteel;
            this.explodedOffsetsZ.set(moveTarget, -16.0);
          } else if (nm.includes("Wire_")) {
            if (nm.endsWith("_0")) obj.material = this.hwMats.wireBlue;
            else if (nm.endsWith("_1")) obj.material = this.hwMats.wirePink;
            else if (nm.endsWith("_2")) obj.material = this.hwMats.wireYellow;
            else if (nm.endsWith("_3")) obj.material = this.hwMats.wireOrange;
            else obj.material = this.hwMats.wireRed;
            if (!this.wireMeshes) this.wireMeshes = [];
            this.wireMeshes.push(obj);
            this.explodedOffsetsZ.set(moveTarget, -142.0);
          } else if (nm.includes("USBC_Cord") || nm.includes("USBC_Lead") || nm.includes("USBC_Strain_Boot")) {
            // Completely hide the disconnected USB cable!
            obj.visible = false;
            obj.castShadow = false;
            obj.receiveShadow = false;
            if (moveTarget) moveTarget.visible = false;
          } else if (nm.includes("ESP32_Shield") || nm.includes("ESP_Metal_Parts")) {
            obj.material = this.hwMats.brushedSteel;
            this.explodedOffsetsZ.set(moveTarget, -182.0);
          } else if (nm.includes("Gold_Header_Pins")) {
            obj.material = this.hwMats.goldPin;
            this.explodedOffsetsZ.set(moveTarget, -182.0);
          } else if (nm.includes("ULN_XH") || nm.includes("ESP_White_Mount")) {
            obj.material = this.hwMats.whiteNylon;
            this.explodedOffsetsZ.set(moveTarget, -182.0);
          } else if (nm.includes("ULN_IC")) {
            obj.material = this.hwMats.epoxyIc;
            this.explodedOffsetsZ.set(moveTarget, -182.0);
          } else if (nm.includes("_led_")) {
            obj.material = this.hwMats.amberLed;
            const bp = this.basePositions.get(moveTarget);
            bp.z = -22.35;
            moveTarget.position.z = -22.35;
            moveTarget.scale.set(1.35, 1.35, 1.35);
            this.explodedOffsetsZ.set(moveTarget, -182.0);
          } else if (nm.includes("ESP32_S3") || nm.includes("ULN_") || nm.includes("Dupont") || nm.includes("PCB_")) {
            obj.material = this.hwMats.blackPcb;
            this.explodedOffsetsZ.set(moveTarget, -182.0);
          } else if (nm.includes("RearCover")) {
            obj.material = this.hwMats.rearAcrylic;
            obj.castShadow = false;
            this.rearCoverMesh = moveTarget;
            this.explodedOffsetsZ.set(moveTarget, -232.0);
          } else if (nm.includes("Machined_Hardware")) {
            obj.material = this.hwMats.brushedSteel;
            this.explodedOffsetsZ.set(moveTarget, -264.0);
          }
        });



        // Both SurfClock_Master_60fps_Rig_beach_hand and SurfClock_Master_60fps_Rig_cond_hand already have
        // the 128-segment sculpted one-piece crowned Signal Orange hub & integral chamfered boss built into their GLB geometry!

        this.clockGroup.add(root);

        // 1. Create dynamic +0.60mm 3D Beach, Tick Ring & Sub-dial Typography Mesh
        this.dynamicTypoMesh = new THREE.Mesh(
          buildDialTypographyGeometry(THREE, this.beachNames, this.subdialMode),
          this.inlayMat
        );
        this.dynamicTypoMesh.castShadow = true;
        this.dynamicTypoMesh.receiveShadow = true;
        this.clockGroup.add(this.dynamicTypoMesh);
        this.basePositions.set(this.dynamicTypoMesh, new THREE.Vector3(0, 0, 0));
        this.explodedOffsetsZ.set(this.dynamicTypoMesh, 144.0);

        // 2. Create dynamic Rear Plaque 3D Typography Mesh (un-mirrored, facing -Z!)
        this.rearPlaqueTypoMesh = new THREE.Mesh(
          buildRearPlaqueTypographyGeometry(THREE, this.regionTitle),
          this.hwMats.whiteNylon
        );
        this.clockGroup.add(this.rearPlaqueTypoMesh);
        this.basePositions.set(this.rearPlaqueTypoMesh, new THREE.Vector3(0, 0, 0));
        this.explodedOffsetsZ.set(this.rearPlaqueTypoMesh, 36.0);

        this.glbLoaded = true;
        if (this.basinAOGroup) {
          this.basinAOGroup.visible = (this.explodeCurrent <= 0.04);
        }
        this._applyHandRotations();
        this._applyExplodeOffsets(this.explodeCurrent);
        this.setLightingMode(this.lightingMode, true);
        this.onReady();
        if (!this._animLoopStarted) {
          this._animLoopStarted = true;
          this._lastTime = performance.now();
          requestAnimationFrame(this._animate);
        }
      },
      undefined,
      (err) => {
        console.error("Failed to load Surf Clock Master GLB:", err);
        if (!this._animLoopStarted) {
          this._animLoopStarted = true;
          this._lastTime = performance.now();
          requestAnimationFrame(this._animate);
        }
      }
    );
  }

  /**
   * Regenerates the 3D extruded Braun/DIN beach labels, sub-dial legend, and rear telemetry plaque (< 2ms)
   */
  updateDialTypography(beachNames5, subdialMode = this.subdialMode, regionTitle = this.regionTitle) {
    if (Array.isArray(beachNames5) && beachNames5.length === 5) {
      this.beachNames = beachNames5.map((s) => (s || "LOCAL REEF").toUpperCase());
    }
    this.subdialMode = subdialMode;
    if (regionTitle) {
      this.regionTitle = regionTitle;
    }
    if (this.dynamicTypoMesh) {
      const oldGeo = this.dynamicTypoMesh.geometry;
      this.dynamicTypoMesh.geometry = buildDialTypographyGeometry(THREE, this.beachNames, this.subdialMode);
      if (oldGeo) oldGeo.dispose();
    }
    if (this.rearPlaqueTypoMesh) {
      const oldRearGeo = this.rearPlaqueTypoMesh.geometry;
      this.rearPlaqueTypoMesh.geometry = buildRearPlaqueTypographyGeometry(THREE, this.regionTitle);
      if (oldRearGeo) oldRearGeo.dispose();
    }
  }

  /**
   * Sweeps the upper 28BYJ-48 stepper hand to one of the 5 radial beach slots (0..4)
   */
  pointToBeachSlot(slotIndex) {
    const slot = DIAL_SLOTS[slotIndex];
    if (!slot) return;
    this.activeBeachIndex = slotIndex;
    this.upperAngleTarget = slot.angleDeg;
  }

  /**
   * Sweeps the lower 180-deg sub-dial stepper hand according to a 1..10 Worth It / Conditions score
   */
  setWorthItScore(score1to10) {
    const clamped = Math.max(1.0, Math.min(10.0, Number(score1to10) || 8.0));
    this.worthItScore = clamped;
    // Map 1.0 -> -76° (NAH), 10.0 -> +76° (YEAH)
    const deg = -76.0 + ((clamped - 1.0) / 9.0) * 152.0;
    this.lowerAngleTarget = deg;
  }

  /**
   * Applies a swatch from COMPONENT_SWATCHES[part] to the live 3D material
   */
  setComponentSwatch(part, swatchId) {
    const list = COMPONENT_SWATCHES[part];
    if (!list) return null;
    const sw = list.find((x) => x.id === swatchId) || list[0];
    if (sw && this.swColors) {
      this.swColors[part] = sw.hex;
      if (part === "bezel") this.swColors.bezelTransmission = sw.transmission || 0.0;
      if (part === "dial") this.swColors.dialTransmission = sw.transmission || 0.0;
    }
    if (this.softwareMode) return sw;
    const targetMat =
      part === "bezel"
        ? this.bezelMat
        : part === "dial"
        ? this.dialMat
        : part === "inlay"
        ? this.inlayMat
        : part === "hands"
        ? this.handsMat
        : part === "deck"
        ? this.deckMat
        : null;

    if (targetMat && sw) {
      targetMat.color.setHex(sw.color);
      targetMat.roughness = sw.roughness;
      targetMat.metalness = sw.metalness;
      targetMat.clearcoat = sw.clearcoat ?? 0.2;
      targetMat.clearcoatRoughness = sw.clearcoatRoughness ?? 0.18;

      if (sw.emissive !== undefined) {
        targetMat.emissive.setHex(sw.emissive);
        targetMat.emissiveIntensity = sw.emissiveIntensity ?? 0.14;
      } else {
        targetMat.emissive.setHex(0x000000);
        targetMat.emissiveIntensity = 0.0;
      }

      if (sw.transmission) {
        targetMat.transmission = sw.transmission;
        targetMat.transparent = true;
        targetMat.opacity = sw.opacity ?? 0.72;
        targetMat.ior = sw.ior ?? 1.49;
        targetMat.normalMap = this.procTextures.infillNormalMap;
        targetMat.normalScale.set(0.28, 0.28);
      } else {
        targetMat.transmission = 0.0;
        targetMat.transparent = false;
        targetMat.opacity = 1.0;
        if (part === "bezel" || part === "dial" || part === "deck") {
          targetMat.map = this.procTextures.grainColorMap;
          targetMat.roughnessMap = this.procTextures.microRoughnessMap;
          targetMat.bumpMap = this.procTextures.microRoughnessMap;
          targetMat.bumpScale = part === "bezel" ? 0.042 : 0.032;
          targetMat.normalMap = this.procTextures.microNormalMap;
          targetMat.normalScale.set(part === "bezel" ? 0.18 : 0.14, part === "bezel" ? 0.18 : 0.14);
          targetMat.clearcoatNormalMap = this.procTextures.microNormalMap;
          targetMat.clearcoatNormalScale.set(0.08, 0.08);
          targetMat.roughness = sw.roughness;
        }
      }
      targetMat.envMapIntensity = this.lightingMode === "nightlight" ? 0.14 : 0.42;
      targetMat.needsUpdate = true;
    }
    return sw;
  }

  /**
   * Switches between the 4 studio lighting environments
   */

  _setMaterialsEnvIntensity(envInt) {
    const mats = [
      this.bezelMat,
      this.dialMat,
      this.inlayMat,
      this.handsMat,
      this.deckMat,
      ...(this.hwMats ? Object.values(this.hwMats) : []),
    ];
    for (const m of mats) {
      if (m) {
        m.envMapIntensity = envInt;
      }
    }
    if (this.clockGroup) {
      this.clockGroup.traverse((obj) => {
        if (obj.isMesh && obj.material) {
          obj.material.envMapIntensity = envInt;
        }
      });
    }
  }

  setLightingMode(mode, immediate = false) {
    const isNight = mode === "nightlight" || mode === "dawn" || mode === "night";
    this.lightingMode = isNight ? "nightlight" : "daylight";
    if (this.softwareMode) return;
    this.goboGroup.visible = false;
    this._redrawBasinAO(isNight);

    if (!isNight) {
      // =========================================================================
      // ☀ DAYLIGHT MODE:
      // Bright Gallery-White Studio + Dramatic Pointed Raking Key Light from Upper-Right
      // =========================================================================
      this.scene.background.setHex(0xf8f6f0);
      // Crisp directional raking sun/key light casting architectural bezel & hand shadows
      this.keyLight.color.setHex(0xfffdf8);
      this.keyLight.intensity = 2.05;
      this.keyLight.position.set(245.0, 168.0, 115.0);
      this.keyLight.shadow.radius = 1.45;

      this.fillLight.color.setHex(0xe2eaf4);
      this.fillLight.intensity = 0.10;
      this.fillLight.position.set(-250.0, -40.0, 150.0);

      this.rimLight.color.setHex(0xffffff);
      this.rimLight.intensity = 1.35;
      this.rimLight.position.set(-220.0, 190.0, -160.0);

      if (this.rearBayLight) {
        this.rearBayLight.intensity = 1.65;
      }

      this.ambientLight.color.setHex(0xffffff);
      this.ambientLight.intensity = 0.06;

      if (this.hemiLight) {
        this.hemiLight.color.setHex(0xffffff);
        this.hemiLight.groundColor.setHex(0xdcd4c6);
        this.hemiLight.intensity = 0.18;
      }
      if (this.bounceLight) {
        this.bounceLight.color.setHex(0xfff8ee);
        this.bounceLight.intensity = 0.24;
      }
      if (this.frontSheenLight) {
        // Localized studio key highlight on upper-right bezel & dial (decay=0.0 in mm units!) without washing out recessed shadows
        this.frontSheenLight.color.setHex(0xfffdf6);
        this.frontSheenLight.intensity = 0.62;
        this.frontSheenLight.distance = 285.0;
        this.frontSheenLight.decay = 0.0;
        this.frontSheenLight.position.set(78.0, 86.0, 122.0);
      }
      if (this.twilightRimLight) {
        // Subtle cool shadow-side contrast on lower-left
        this.twilightRimLight.color.setHex(0xdbeafe);
        this.twilightRimLight.intensity = 0.22;
        this.twilightRimLight.distance = 240.0;
        this.twilightRimLight.decay = 0.0;
        this.twilightRimLight.position.set(-118.0, -85.0, 95.0);
      }
      this.scene.environmentIntensity = 0.30;
      this._setMaterialsEnvIntensity(0.30);
      if (this.swellUniforms) {
        this.swellUniforms.uIsNight.value = 0.0;
        this.swellUniforms.uBgColor.value.setHex(0xf8f6f0);
      }
    } else {
      // =========================================================================
      // ☾ NIGHTLIGHT MODE (TRUE TWILIGHT / NOCTURNAL CHIAROSCURO LIGHTING ON THE CLOCK):
      // - Turns off daytime studio floodlights and drops environmentIntensity to 0.02
      //   so the Alabaster clock itself enters moody twilight shadow!
      // - Positions keyLight at an extreme grazing raking angle (-265, 175, 28) so the
      //   bezel walls, +0.6mm raised letters, and hands cast long, dramatic diagonal
      //   shadows across the dial face!
      // - Uses two close-range inverse-square (1/r^2) twilight PointLights:
      //   1. Cool lunar twilight blue (-115, 130, 52) illuminating the upper-left bezel & beach dial
      //   2. Warm golden-amber instrument glow (+95, -82, 48) skimming the lower-right sub-dial & hands!
      // =========================================================================
      this.scene.background.setHex(0x060a13);
      // Low grazing directional moonlight for long diagonal shadows across the recessed basin,
      // paired with close-range 1/r^2 PointLights so the dial face has a dramatic chiaroscuro gradient!
      this.keyLight.color.setHex(0x93c5fd);
      this.keyLight.intensity = 0.62;
      this.keyLight.position.set(-265.0, 172.0, 56.0);
      this.keyLight.shadow.radius = 2.2;

      this.fillLight.color.setHex(0x1e3a8a);
      this.fillLight.intensity = 0.06;
      this.fillLight.position.set(220.0, -80.0, 120.0);

      this.rimLight.color.setHex(0x38bdf8);
      this.rimLight.intensity = 2.40;
      this.rimLight.position.set(-210.0, 185.0, -90.0);

      if (this.rearBayLight) {
        this.rearBayLight.intensity = 0.18;
      }

      this.ambientLight.color.setHex(0x091020);
      this.ambientLight.intensity = 0.03;

      if (this.hemiLight) {
        this.hemiLight.color.setHex(0x1e40af);
        this.hemiLight.groundColor.setHex(0x04070e);
        this.hemiLight.intensity = 0.06;
      }
      if (this.bounceLight) {
        this.bounceLight.color.setHex(0xff7a1a);
        this.bounceLight.intensity = 0.24;
      }
      if (this.frontSheenLight) {
        // Warm golden-amber nocturnal instrument pool focused on the lower-right sub-dial & hands (cutoffDistance=235mm, decay=0.0!)
        this.frontSheenLight.color.setHex(0xff9838);
        this.frontSheenLight.intensity = 1.55;
        this.frontSheenLight.distance = 235.0;
        this.frontSheenLight.decay = 0.0;
        this.frontSheenLight.position.set(62.0, -58.0, 82.0);
      }
      if (this.twilightRimLight) {
        // Cool lunar blue-white spotlight pool focused on the upper-left bezel chamfer & beach dial (cutoffDistance=265mm, decay=0.0!)
        this.twilightRimLight.color.setHex(0xdbeafe);
        this.twilightRimLight.intensity = 1.75;
        this.twilightRimLight.distance = 265.0;
        this.twilightRimLight.decay = 0.0;
        this.twilightRimLight.position.set(-66.0, 78.0, 88.0);
      }
      this.scene.environmentIntensity = 0.04;
      this._setMaterialsEnvIntensity(0.04);
      if (this.swellUniforms) {
        this.swellUniforms.uIsNight.value = 1.0;
        this.swellUniforms.uBgColor.value.setHex(0x060a13);
      }
    }
    this.setSwellAccentColor(this.swellAccentHex || "#FF4F00", true);
    this._redrawBackdropCyclorama();
  }

    setExplodeFactor(val, immediate = false) {
    this.explodeTarget = Math.max(0.0, Math.min(1.0, Number(val) || 0.0));
    if (immediate) {
      this.explodeCurrent = this.explodeTarget;
      this._applyExplodeOffsets(this.explodeCurrent);
    }
  }

  setRearCoverVisible(vis) {
    this.rearCoverVisible = Boolean(vis);
    if (this.rearCoverMesh) {
      this.rearCoverMesh.visible = this.rearCoverVisible;
    }
  }

  /**
   * Smoothly animates camera & orbit target to one of the 5 studio inspection views
   */
  setCameraPreset(preset, immediate = false) {
    this.activeCameraPreset = preset;
    const w = this.canvas ? (this.canvas.clientWidth || window.innerWidth) : window.innerWidth;
    const h = this.canvas ? (this.canvas.clientHeight || window.innerHeight) : window.innerHeight;
    const isPortraitMobile = (w / Math.max(1, h)) < 0.82;
    let pos, tgt, explodeAfter = null;
    if (preset === "front") {
      pos = isPortraitMobile
        ? new THREE.Vector3(-38.0, 10.0, 645.0)
        : new THREE.Vector3(-88.0, 14.0, 495.0);
      tgt = isPortraitMobile
        ? new THREE.Vector3(0.0, -8.0, -6.0)
        : new THREE.Vector3(0.0, -8.0, -8.0);
      if (this.explodeTarget > 0.5) explodeAfter = 0.0;
    } else if (preset === "macro") {
      // Level-horizon grazing macro skimming +0.60mm 3D beach letters & crowned hand boss
      pos = new THREE.Vector3(-56.0, 28.0, 194.0);
      tgt = new THREE.Vector3(2.0, 28.0, -4.0);
      explodeAfter = 0.0;
    } else if (preset === "subdial") {
      // Close-up on lower 180° connected L-corner WORTH IT? arch
      pos = new THREE.Vector3(-24.0, -68.0, 175.0);
      tgt = new THREE.Vector3(0.0, -75.0, -4.0);
      explodeAfter = 0.0;
    } else if (preset === "rear") {
      // 180° Rear Electronics Bay view: full framing of all 4 corner M3 counterbores + bottom cord
      pos = new THREE.Vector3(46.0, -6.0, -525.0);
      tgt = new THREE.Vector3(0.0, -10.0, -20.0);
      if (this.explodeTarget > 0.5) explodeAfter = 0.0;
    } else if (preset === "exploded") {
      // True 60° Isometric 9-Tier Coaxial Exploded View showing every internal layer clearly
      pos = new THREE.Vector3(-575.0, 162.0, 295.0);
      tgt = new THREE.Vector3(0.0, -8.0, -35.0);
      if (this.explodeTarget < 0.25) explodeAfter = 1.0;
    } else {
      return;
    }

    if (explodeAfter !== null) {
      this.setExplodeFactor(explodeAfter, immediate);
    }

    if (immediate) {
      this.camera.position.copy(pos);
      this.controls.target.copy(tgt);
      this.controls.update();
      this.camAnim = null;
      if (this.swellUniforms) {
        this.swellUniforms.uMacroFade.value = (preset === "macro" || preset === "subdial") ? 0.0 : 1.0;
      }
    } else {
      this.camAnim = {
        startPos: this.camera.position.clone(),
        endPos: pos,
        startTgt: this.controls.target.clone(),
        endTgt: tgt,
        t0: performance.now(),
        duration: 720,
      };
    }
  }

  /**
   * Generates a real Binary .STL file of the user's customized 5-beach dial right in the browser
   * and triggers a browser download.
   * @param {string} regionCode - Short region code for the filename
   * @param {boolean} includeBasePlate - true = 2.4mm baseplate + 0.6mm raised text; false = 0.6mm inlay only
   */
  exportCustomDialSTL(regionCode = "CUSTOM", includeBasePlate = true) {
    const cleanCode = (regionCode || "CUSTOM").replace(/[^A-Za-z0-9_-]/g, "_").toUpperCase();
    const typoGeo = buildDialTypographyGeometry(THREE, this.beachNames, this.subdialMode, true);
    const geoms = [];
    if (includeBasePlate) {
      geoms.push(buildPureDialFaceplateGeometry(THREE, true));
    }
    geoms.push(typoGeo);

    const stlBuffer = buildBinarySTLFromGeometries(
      geoms,
      `SC01_${cleanCode}_${this.beachNames.join("_")}`,
      includeBasePlate ? 7.0 : 4.6
    );

    const blob = new Blob([stlBuffer], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = includeBasePlate
      ? `SC01_Custom_Dial_Faceplate_${cleanCode}.stl`
      : `SC01_Custom_Typography_Inlay_${cleanCode}.stl`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    for (const g of geoms) { if (g && g.dispose) g.dispose(); }
  }

  /**
   * Generates and returns the raw ArrayBuffer for the custom binary STL
   * without triggering a direct browser download. Used for full-stack ZIP packaging.
   * @param {boolean} includeBasePlate - true = baseplate + text; false = typography inlay only
   * @param {string} regionCode - Region code identifier
   * @returns {ArrayBuffer}
   */
  generateCustomDialSTLBuffer(includeBasePlate = true, regionCode = "CUSTOM") {
    const cleanCode = (regionCode || "CUSTOM").replace(/[^A-Za-z0-9_-]/g, "_").toUpperCase();
    const typoGeo = buildDialTypographyGeometry(THREE, this.beachNames, this.subdialMode, true);
    const geoms = [];
    if (includeBasePlate) {
      geoms.push(buildPureDialFaceplateGeometry(THREE, true));
    }
    geoms.push(typoGeo);

    const stlBuffer = buildBinarySTLFromGeometries(
      geoms,
      `SC01_${cleanCode}_${this.beachNames.join("_")}`,
      includeBasePlate ? 7.0 : 4.6
    );

    for (const g of geoms) { if (g && g.dispose) g.dispose(); }
    return stlBuffer;
  }

  /**
   * Captures a high-resolution PNG render of the live 3D customizer canvas
   */
  captureStudioSnapshotPNG(filename = "SC01_Custom_Surf_Clock_Render.png") {
    if (this.softwareMode) {
      this._renderSoftware3D();
    } else if (this.renderer) {
      this.renderer.render(this.scene, this.camera);
    }
    const dataUrl = this.canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return dataUrl;
  }

  _applyHandRotations() {
    if (this.beachHandMesh) {
      this.beachHandMesh.rotation.set(0, 0, -THREE.MathUtils.degToRad(this.upperAngleCurrent));
    }
    if (this.condHandMesh) {
      this.condHandMesh.rotation.set(0, 0, -THREE.MathUtils.degToRad(this.lowerAngleCurrent));
    }
  }

  _applyExplodeOffsets(fac) {
    if (this.softwareMode) {
      this.onExplodeChange(fac);
      return;
    }
    const isExploded = fac > 0.04;
    this.explodedGuidesGroup.visible = isExploded;
    this.basinAOGroup.visible = !isExploded;
    if (this.swellUniforms && this.swellUniforms.uExplodeFade) {
      this.swellUniforms.uExplodeFade.value = Math.min(1.0, fac * 1.25);
    }

    if (this.shadowMoatMesh) {
      // Hide black shadow moat rectangle during exploded view so internal tiers aren't occluded
      this.shadowMoatMesh.visible = false;
    }
    if (this.dynamicTypoMesh) {
      // Prevent floating +0.6mm inlay letters from casting detached ghost shadows onto the white dial plate when exploded!
      this.dynamicTypoMesh.castShadow = !isExploded;
    }
    if (this.staticTicksMesh) {
      this.staticTicksMesh.castShadow = !isExploded;
    }
    for (const dShaft of this.dShaftMeshes) {
      // Show brass stepper D-shafts only when exploded so blind-capped orange hand hubs stay 100% solid when assembled
      dShaft.visible = isExploded;
    }
    if (this.wireMeshes) {
      for (const wMesh of this.wireMeshes) {
        wMesh.visible = !isExploded;
      }
    }
    if (this.cordMesh) {
      this.cordMesh.visible = this.cordVisible && fac < 0.15;
    }
    if (this.goboGroup) {
      this.goboGroup.visible = this.lightingMode === "atelier" && fac < 0.15;
    }

    for (const [obj, basePos] of this.basePositions.entries()) {
      const dz = this.explodedOffsetsZ.get(obj) || 0.0;
      obj.position.set(basePos.x, basePos.y, basePos.z + dz * fac);
    }

    this.onExplodeChange(fac);
  }

  _animate(now) {
    requestAnimationFrame(this._animate);
    const dt = Math.min(0.05, (now - this._lastTime) / 1000.0);
    this._lastTime = now;

    // 1. Camera preset interpolation
    if (this.camAnim) {
      const uRaw = (now - this.camAnim.t0) / this.camAnim.duration;
      if (uRaw >= 1.0) {
        this.camera.position.copy(this.camAnim.endPos);
        this.controls.target.copy(this.camAnim.endTgt);
        this.camAnim = null;
      } else {
        const u = 0.5 - 0.5 * Math.cos(Math.PI * uRaw);
        this.camera.position.lerpVectors(this.camAnim.startPos, this.camAnim.endPos, u);
        this.controls.target.lerpVectors(this.camAnim.startTgt, this.camAnim.endTgt, u);
      }
    }

    // 2. Authentic 28BYJ-48 Stepper Motor Spring-Damper Physics (subtle settle overshoot)
    const stiffness = 68.0;
    const damping = 11.5;
    const dUpper = this.upperAngleTarget - this.upperAngleCurrent;
    const dLower = this.lowerAngleTarget - this.lowerAngleCurrent;
    if (Math.abs(dUpper) > 0.01 || Math.abs(this.upperVelocity) > 0.01) {
      this.upperVelocity += (dUpper * stiffness - this.upperVelocity * damping) * dt;
      this.upperAngleCurrent += this.upperVelocity * dt;
      this._applyHandRotations();
    }
    if (Math.abs(dLower) > 0.01 || Math.abs(this.lowerVelocity) > 0.01) {
      this.lowerVelocity += (dLower * stiffness - this.lowerVelocity * damping) * dt;
      this.lowerAngleCurrent += this.lowerVelocity * dt;
      this._applyHandRotations();
    }

    // 3. Smooth Coaxial 9-Tier Explosion Interpolation
    if (Math.abs(this.explodeTarget - this.explodeCurrent) > 0.001) {
      this.explodeCurrent += (this.explodeTarget - this.explodeCurrent) * Math.min(1.0, dt * 10.0);
      this._applyExplodeOffsets(this.explodeCurrent);
    }

    if (this.softwareMode) {
      this._renderSoftware3D(now * 0.001);
      return;
    }
    this._updateWallWaveform(now * 0.001);
    this.controls.update();
    if (this.swellMesh) {
      this.swellMesh.position.set(0.0, -115.5, 0.0);
      this.swellMesh.rotation.set(-0.045, 0.0, 0.0);
    }
    this.renderer.render(this.scene, this.camera);
  }

  // ============================================================================
  // BUILT-IN 60FPS 3D PERSPECTIVE SOFTWARE ENGINE (Canvas2D Fallback when WebGL is disabled)
  // Provides full 360° 3D orbit, zoom, 9-tier coaxial explosion, 4 lighting modes,
  // dynamic +0.60mm 3D beach typography, rear ESP32-S3/ULN2003 bay, and beach click hit-testing!
  // ============================================================================
  _initSoftware3DEngine() {
    this.ctx2d = this.canvas.getContext("2d");
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(32, w / h, 5.0, 4000.0);
    // Slightly angled 3/4 studio hero view so 3D depth, inner bevels & light reflections shine
    this.camera.position.set(-88.0, 16.0, 515.0);
    this.controls = {
      target: new THREE.Vector3(0.0, -8.0, -6.0),
      update: () => {
        this.camera.lookAt(this.controls.target);
        this.camera.updateMatrixWorld(true);
      },
    };
    this.controls.update();

    // Build subtle tactile micro-grain pattern canvas for realistic surface texture
    const grainC = document.createElement("canvas");
    grainC.width = 128;
    grainC.height = 128;
    const gCtx = grainC.getContext("2d");
    const gImg = gCtx.createImageData(128, 128);
    let seed = 42;
    for (let i = 0; i < 128 * 128 * 4; i += 4) {
      seed = (seed * 16807) % 2147483647;
      const v = (seed & 1) ? 255 : 0;
      gImg.data[i] = v;
      gImg.data[i + 1] = v;
      gImg.data[i + 2] = v;
      gImg.data[i + 3] = 7;
    }
    gCtx.putImageData(gImg, 0, 0);
    this.grainPattern = this.ctx2d.createPattern(grainC, "repeat");

    this.swBeachHitPts = [];
    let isDragging = false;
    let downX = 0, downY = 0, lastX = 0, lastY = 0;

    this.canvas.addEventListener("pointerdown", (e) => {
      isDragging = true;
      downX = lastX = e.clientX;
      downY = lastY = e.clientY;
      this.canvas.style.cursor = "grabbing";
    });

    window.addEventListener("pointermove", (e) => {
      if (!isDragging) {
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const hit = (this.swBeachHitPts || []).some((p) => Math.hypot(p.x - mx, p.y - my) < 30);
        this.canvas.style.cursor = hit ? "pointer" : "grab";
        return;
      }
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      const offset = this.camera.position.clone().sub(this.controls.target);
      const sph = new THREE.Spherical().setFromVector3(offset);
      sph.theta -= dx * 0.0065;
      sph.phi = Math.max(0.18, Math.min(Math.PI - 0.18, sph.phi - dy * 0.0065));
      offset.setFromSpherical(sph);
      this.camera.position.copy(this.controls.target).add(offset);
      this.controls.update();
    });

    window.addEventListener("pointerup", (e) => {
      if (!isDragging) return;
      isDragging = false;
      this.canvas.style.cursor = "grab";
      if (Math.hypot(e.clientX - downX, e.clientY - downY) <= 6) {
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        let bestIdx = null, bestD = 34;
        for (const pt of this.swBeachHitPts || []) {
          const d = Math.hypot(pt.x - mx, pt.y - my);
          if (d < bestD) {
            bestD = d;
            bestIdx = pt.idx;
          }
        }
        if (bestIdx !== null) {
          this.pointToBeachSlot(bestIdx);
          this.onBeachClick(bestIdx);
        }
      }
    });

    this.canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const offset = this.camera.position.clone().sub(this.controls.target);
        const dist = offset.length();
        const nextDist = Math.max(145, Math.min(1050, dist * (1 + e.deltaY * 0.001)));
        offset.setLength(nextDist);
        this.camera.position.copy(this.controls.target).add(offset);
        this.controls.update();
      },
      { passive: false }
    );

    window.addEventListener("resize", () => this.resize());
    setTimeout(() => this.onReady(), 10);
  }

  _shadeHex(hexStr, factor) {
    const h = (hexStr || "#cccccc").replace("#", "");
    const num = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16) || 0xcccccc;
    const r = Math.min(255, Math.max(0, Math.round(((num >> 16) & 255) * factor)));
    const g = Math.min(255, Math.max(0, Math.round(((num >> 8) & 255) * factor)));
    const b = Math.min(255, Math.max(0, Math.round((num & 255) * factor)));
    return `rgb(${r},${g},${b})`;
  }

  _renderSoftware3D() {
    const ctx = this.ctx2d;
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = this.canvas.clientWidth || window.innerWidth;
    const ch = this.canvas.clientHeight || window.innerHeight;
    if (this.canvas.width !== Math.round(cw * dpr) || this.canvas.height !== Math.round(ch * dpr)) {
      this.canvas.width = Math.round(cw * dpr);
      this.canvas.height = Math.round(ch * dpr);
    }
    ctx.save();
    ctx.scale(dpr, dpr);

    this.camera.aspect = cw / ch;
    this.camera.updateProjectionMatrix();
    this.controls.update();

    const viewProj = new THREE.Matrix4().multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse
    );
    const camPos = this.camera.position;

    const project = (x, y, z) => {
      const v = new THREE.Vector3(x, y, z);
      const dist = v.distanceTo(camPos);
      v.applyMatrix4(viewProj);
      return {
        x: (v.x * 0.5 + 0.5) * cw,
        y: (-v.y * 0.5 + 0.5) * ch,
        z: v.z,
        dist,
        clipped: v.z < -1.0 || v.z > 1.0,
      };
    };

    // 1. Studio Backdrop, Plinth Horizon & Giant Architectural "SURF CLOCK" Backdrop Watermark
    const bgPalettes = {
      atelier: { top: "#EFECE6", mid: "#E2DDD3", plinth: "#EBE6DC", plinthBot: "#D6CFC2", text: "rgba(20,22,24,0.045)" },
      raking:  { top: "#D8D4CC", mid: "#C4BFB6", plinth: "#D4D0C8", plinthBot: "#B8B3AA", text: "rgba(20,22,24,0.055)" },
      gallery: { top: "#F7F5F0", mid: "#EAE6DF", plinth: "#F2EFE9", plinthBot: "#DFDBD2", text: "rgba(20,22,24,0.04)" },
      dawn:    { top: "#1C222B", mid: "#12161C", plinth: "#1F242D", plinthBot: "#0E1116", text: "rgba(255,255,255,0.038)" },
    };
    const pal = bgPalettes[this.lightingMode] || bgPalettes.atelier;
    const horizonY = ch * 0.72;

    const wallGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
    wallGrad.addColorStop(0, pal.top);
    wallGrad.addColorStop(1, pal.mid);
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, cw, horizonY);

    // Subtle radial studio spotlight glow on backdrop wall behind the clock
    const spotGrad = ctx.createRadialGradient(cw * 0.5, ch * 0.42, 40, cw * 0.5, ch * 0.42, cw * 0.55);
    spotGrad.addColorStop(0, this.lightingMode === "dawn" ? "rgba(255,160,80,0.09)" : "rgba(255,252,245,0.48)");
    spotGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = spotGrad;
    ctx.fillRect(0, 0, cw, horizonY);

    // Giant "SURF CLOCK" Architectural Studio Backdrop Typography behind the 3D clock
    ctx.save();
    const bgCenter = project(0, 28, -90);
    const fontSize = Math.max(82, Math.min(210, Math.round(cw * 0.145)));
    ctx.font = `800 ${fontSize}px "Space Grotesk", -apple-system, BlinkMacSystemFont, "Inter", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = this.lightingMode === "dawn" ? "rgba(255,255,255,0.06)" : "rgba(17,18,20,0.075)";
    ctx.fillText("SURF CLOCK", cw * 0.5 + (bgCenter.x - cw * 0.5) * 0.22, ch * 0.18);
    ctx.restore();

    // Tabletop Plinth with depth gradient
    const plinthGrad = ctx.createLinearGradient(0, horizonY, 0, ch);
    plinthGrad.addColorStop(0, pal.plinth);
    plinthGrad.addColorStop(1, pal.plinthBot);
    ctx.fillStyle = plinthGrad;
    ctx.fillRect(0, horizonY, cw, ch - horizonY);

    // Subtle horizon seam line
    ctx.strokeStyle = this.lightingMode === "dawn" ? "rgba(255,255,255,0.06)" : "rgba(20,22,24,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(cw, horizonY);
    ctx.stroke();

    const exp = this.explodeCurrent;

    // 2. Ground Ambient Occlusion & Cast Shadow under the 184x230x46mm Monolith on the Plinth
    if (exp < 0.35) {
      const sL = project(-92, -115, -23);
      const sR = project(92, -115, 23);
      const shCx = (sL.x + sR.x) * 0.5 + 14;
      const shCy = Math.max(sL.y, sR.y) + 4;
      const shRx = Math.max(60, Math.abs(sR.x - sL.x) * 0.68);
      const shRy = 22;
      ctx.save();
      ctx.translate(shCx, shCy);
      ctx.scale(1, shRy / shRx);
      const aoGrad = ctx.createRadialGradient(0, 0, shRx * 0.15, 0, 0, shRx);
      aoGrad.addColorStop(0, "rgba(15, 14, 12, 0.34)");
      aoGrad.addColorStop(0.55, "rgba(15, 14, 12, 0.14)");
      aoGrad.addColorStop(1, "rgba(15, 14, 12, 0)");
      ctx.fillStyle = aoGrad;
      ctx.beginPath();
      ctx.arc(0, 0, shRx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 3. 3D Lighting & Specular Reflection Vector Math
    const lightDir =
      this.lightingMode === "raking"
        ? new THREE.Vector3(-0.84, 0.38, 0.42).normalize()
        : this.lightingMode === "dawn"
        ? new THREE.Vector3(-0.72, 0.32, 0.62).normalize()
        : new THREE.Vector3(-0.52, 0.55, 0.65).normalize();

    const viewDir = camPos.clone().sub(this.controls.target).normalize();
    const halfVec = new THREE.Vector3().addVectors(lightDir, viewDir).normalize();

    const polys = [];
    const pushQuad = (p0, p1, p2, p3, baseHex, alpha = 1.0, strokeHex = null, depthBias = 0.0, shininess = 28.0, specStrength = 0.28) => {
      const a = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
      const b = new THREE.Vector3(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]);
      const normal = new THREE.Vector3().crossVectors(a, b).normalize();
      const cx = (p0[0] + p1[0] + p2[0] + p3[0]) * 0.25;
      const cy = (p0[1] + p1[1] + p2[1] + p3[1]) * 0.25;
      const cz = (p0[2] + p1[2] + p2[2] + p3[2]) * 0.25;
      const toCam = new THREE.Vector3(camPos.x - cx, camPos.y - cy, camPos.z - cz);
      if (normal.dot(toCam) < 0 && alpha >= 0.98) return;

      const s0 = project(p0[0], p0[1], p0[2]);
      const s1 = project(p1[0], p1[1], p1[2]);
      const s2 = project(p2[0], p2[1], p2[2]);
      const s3 = project(p3[0], p3[1], p3[2]);
      if (s0.clipped && s1.clipped && s2.clipped && s3.clipped) return;

      const ndotl = Math.max(-0.15, normal.dot(lightDir));
      const ndoth = Math.max(0.0, normal.dot(halfVec));
      const spec = Math.pow(ndoth, shininess) * specStrength;
      const shadeA = 0.78 + ndotl * 0.28 + spec * 0.85;
      const shadeB = 0.70 + ndotl * 0.22 - spec * 0.15;

      polys.push({
        pts: [s0, s1, s2, s3],
        fillA: this._shadeHex(baseHex, shadeA),
        fillB: this._shadeHex(baseHex, shadeB),
        specPop: spec,
        alpha,
        stroke: strokeHex,
        depth: toCam.length() + depthBias,
      });
    };

    const pushBox3D = (cx, cy, cz, w, h, d, hex, alpha = 1.0, strokeHex = "rgba(20,22,24,0.14)", depthBias = 0.0, shininess = 32.0, specStrength = 0.30) => {
      const x0 = cx - w / 2, x1 = cx + w / 2;
      const y0 = cy - h / 2, y1 = cy + h / 2;
      const z0 = cz - d / 2, z1 = cz + d / 2;
      pushQuad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], hex, alpha, strokeHex, depthBias, shininess, specStrength);
      pushQuad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], hex, alpha, strokeHex, depthBias, shininess, specStrength);
      pushQuad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], hex, alpha, strokeHex, depthBias, shininess, specStrength);
      pushQuad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], hex, alpha, strokeHex, depthBias, shininess, specStrength);
      pushQuad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], hex, alpha, strokeHex, depthBias, shininess, specStrength);
      pushQuad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], hex, alpha, strokeHex, depthBias, shininess, specStrength);
    };

    const pushHollowFrame3D = (zCenter, outerW, outerH, innerW, innerH, depth, hex, alpha = 1.0, shininess = 36.0, specStrength = 0.35) => {
      const barT = (outerH - innerH) * 0.5;
      const sideW = (outerW - innerW) * 0.5;
      pushBox3D(0, (outerH - barT) * 0.5, zCenter, outerW, barT, depth, hex, alpha, "rgba(20,22,24,0.12)", 0, shininess, specStrength);
      pushBox3D(0, -(outerH - barT) * 0.5, zCenter, outerW, barT, depth, hex, alpha, "rgba(20,22,24,0.12)", 0, shininess, specStrength);
      pushBox3D(-(outerW - sideW) * 0.5, 0, zCenter, sideW, innerH, depth, hex, alpha, "rgba(20,22,24,0.12)", 0, shininess, specStrength);
      pushBox3D((outerW - sideW) * 0.5, 0, zCenter, sideW, innerH, depth, hex, alpha, "rgba(20,22,24,0.12)", 0, shininess, specStrength);

      // 45-degree Inner Bezel Chamfer Faces (catches overhead & side studio light!)
      const zFront = zCenter + depth * 0.5;
      const zRecess = zFront - 5.2;
      const iw = innerW * 0.5, ih = innerH * 0.5;
      const cwIn = iw - 2.2, chIn = ih - 2.2;
      // Bottom inner chamfer (faces +Y and +Z -> catches bright overhead key light!)
      pushQuad([-iw, -ih, zFront], [iw, -ih, zFront], [cwIn, -chIn, zRecess], [-cwIn, -chIn, zRecess], hex, alpha, null, -0.5, 48.0, 0.55);
      // Top inner chamfer (faces -Y -> in deep architectural shadow)
      pushQuad([iw, ih, zFront], [-iw, ih, zFront], [-cwIn, chIn, zRecess], [cwIn, chIn, zRecess], this._shadeHex(hex, 0.68), alpha, null, -0.5, 24.0, 0.15);
      // Left inner chamfer (faces +X)
      pushQuad([-iw, ih, zFront], [-iw, -ih, zFront], [-cwIn, -chIn, zRecess], [-cwIn, chIn, zRecess], this._shadeHex(hex, 0.82), alpha, null, -0.5, 36.0, 0.30);
      // Right inner chamfer (faces -X -> catches key light from left!)
      pushQuad([iw, -ih, zFront], [iw, ih, zFront], [cwIn, chIn, zRecess], [cwIn, -chIn, zRecess], this._shadeHex(hex, 1.06), alpha, null, -0.5, 48.0, 0.50);
    };

    const zBezel = 0.0;
    const zDial = -5.8 + 54.0 * exp;
    const zInlay = -4.0 + 104.0 * exp;
    const zHands = -2.0 + 154.0 * exp;
    const zDeck = -14.0 - 62.0 * exp;
    const zMotors = -17.5 - 136.0 * exp;
    const zWires = -19.5 - 172.0 * exp;
    const zPcbs = -20.5 - 208.0 * exp;
    const zRear = -22.5 - 256.0 * exp;

    // TIER 6: Outer Monolith Bezel Frame (184 x 230 x 46 mm)
    const bzAlpha = this.swColors.bezelTransmission ? 0.58 : 1.0;
    pushHollowFrame3D(zBezel, 184, 230, 156, 202, 46, this.swColors.bezel, bzAlpha, 42.0, 0.42);

    // Shadow Moat Perimeter (when assembled)
    if (exp < 0.08) {
      pushHollowFrame3D(-4.2, 156, 202, 150.5, 196.5, 2.2, "#121417", 1.0, 16.0, 0.1);
    }

    // TIER 7: Recessed Dial Faceplate (152 x 198 x 2.4 mm)
    const dlAlpha = this.swColors.dialTransmission ? 0.65 : 1.0;
    pushBox3D(0, 0, zDial, 152, 198, 2.4, this.swColors.dial, dlAlpha, "rgba(20,22,24,0.22)", -1.5, 36.0, 0.34);

    // TIER 5: Internal Ribbed Engineering Deck
    pushHollowFrame3D(zDeck, 150, 196, 126, 166, 3.2, this.swColors.deck, 1.0, 32.0, 0.30);
    pushBox3D(0, 25.3, zDeck, 148, 26, 3.2, this.swColors.deck, 1.0);
    pushBox3D(0, -68.0, zDeck, 148, 26, 3.2, this.swColors.deck, 1.0);
    pushBox3D(0, 78.8, zDeck, 148, 24, 3.2, this.swColors.deck, 1.0);
    pushBox3D(44, 78.8, zDeck - 1.8, 54, 16, 0.8, "#141618", 1.0);
    pushBox3D(-44, 78.8, zDeck - 1.8, 54, 16, 0.8, "#141618", 1.0);

    // TIER 4: Dual 28BYJ-48 Stepper Motors
    pushBox3D(0, 17.3, zMotors, 28, 28, 19, "#C4C9D0", 1.0, "rgba(20,22,24,0.25)", 0, 64.0, 0.55);
    pushBox3D(0, 2.3, zMotors, 14, 8, 16, "#2858B8", 1.0);
    pushBox3D(0, -70.2, zMotors, 28, 28, 19, "#C4C9D0", 1.0, "rgba(20,22,24,0.25)", 0, 64.0, 0.55);
    pushBox3D(0, -55.2, zMotors, 14, 8, 16, "#2858B8", 1.0);

    // TIER 2: ESP32-S3 & Dual ULN2003A Driver Boards
    pushBox3D(44, -12, zPcbs, 28, 58, 3.0, "#141619", 1.0);
    pushBox3D(44, -5, zPcbs - 1.8, 18, 20, 1.5, "#D0D5DC", 1.0, "rgba(0,0,0,0.2)", 0, 64.0, 0.6);
    pushBox3D(-44, 22, zPcbs, 32, 36, 3.0, "#141619", 1.0);
    pushBox3D(-44, -52, zPcbs, 32, 36, 3.0, "#141619", 1.0);

    // TIER 1: Clear Caseback + 4x Corner M3 Bosses
    if (this.rearCoverVisible) {
      pushBox3D(0, 0, zRear, 152, 198, 2.0, "#E2F2F8", 0.20, "rgba(120,160,180,0.45)", -4.0, 96.0, 0.75);
    }
    for (const [bx, by] of [[-70, 92], [70, 92], [-70, -92], [70, -92]]) {
      pushBox3D(bx, by, zRear - 1.0, 10, 10, 3.0, "#D8D3C8", 1.0);
    }

    // Sort & draw 3D polygons with per-face linear specular gradients + micro-grain texture overlay
    polys.sort((a, b) => b.depth - a.depth);
    for (const poly of polys) {
      ctx.save();
      ctx.globalAlpha = poly.alpha;
      ctx.beginPath();
      ctx.moveTo(poly.pts[0].x, poly.pts[0].y);
      for (let i = 1; i < poly.pts.length; i++) {
        ctx.lineTo(poly.pts[i].x, poly.pts[i].y);
      }
      ctx.closePath();

      const fg = ctx.createLinearGradient(poly.pts[0].x, poly.pts[0].y, poly.pts[2].x, poly.pts[2].y);
      fg.addColorStop(0, poly.fillA);
      fg.addColorStop(0.45, this._shadeHex(poly.fillA, 0.97));
      fg.addColorStop(1, poly.fillB);
      ctx.fillStyle = fg;
      ctx.fill();

      // Tactile micro-grain texture overlay on opaque surfaces
      if (this.grainPattern && poly.alpha >= 0.9) {
        ctx.fillStyle = this.grainPattern;
        ctx.fill();
      }

      if (poly.stroke) {
        ctx.strokeStyle = poly.stroke;
        ctx.lineWidth = 0.85;
        ctx.stroke();
      }
      // Crisp specular bevel catchlight on top & left lit edges
      if (poly.alpha >= 0.9 && poly.pts.length === 4) {
        ctx.beginPath();
        ctx.moveTo(poly.pts[3].x, poly.pts[3].y);
        ctx.lineTo(poly.pts[2].x, poly.pts[2].y);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.42)";
        ctx.lineWidth = 1.15;
        ctx.stroke();
      }
      ctx.restore();
    }

    // Helper to stroke 3D segments & proportional vector strings with 3D relief shadow
    const drawSeg3D = (x1, y1, z1, x2, y2, z2, color, widthPx) => {
      const p1 = project(x1, y1, z1);
      const p2 = project(x2, y2, z2);
      if (p1.clipped && p2.clipped) return;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = widthPx;
      ctx.lineCap = "round";
      ctx.stroke();
    };

    const drawString3D = (text, cx, cy, zPlane, capH, swMm, color, maxW = 999, tracking = 0.30, xDir = 1.0, withRelief = true) => {
      const clean = (text || "").toUpperCase().trim();
      if (!clean) return;
      let effCapH = capH, effTracking = tracking;
      let totalW = measureProportionalString(clean, effCapH, effTracking);
      if (totalW > maxW) {
        const scale = maxW / totalW;
        effCapH *= scale;
        totalW = measureProportionalString(clean, effCapH, effTracking);
      }
      const pRef = project(cx, cy, zPlane);
      const pRef2 = project(cx + swMm, cy, zPlane);
      const pxWidth = Math.max(1.25, Math.hypot(pRef2.x - pRef.x, pRef2.y - pRef.y));

      ctx.save();
      if (withRelief) {
        ctx.shadowColor = "rgba(10, 12, 14, 0.28)";
        ctx.shadowBlur = 1.5;
        ctx.shadowOffsetX = 0.8;
        ctx.shadowOffsetY = 1.2;
      }

      let cursor = -totalW * 0.5;
      for (let i = 0; i < clean.length; i++) {
        const chChar = clean[i];
        const cwChar = effCapH * getCharWidthFactor(chChar);
        const segs = FONT_STROKES[chChar] || [];
        for (const [[u1, v1], [u2, v2]] of segs) {
          const lx1 = cursor + (chChar === "I" ? 0.5 : u1) * cwChar;
          const lx2 = cursor + (chChar === "I" ? 0.5 : u2) * cwChar;
          const px1 = cx + lx1 * xDir;
          const py1 = cy + v1 * effCapH;
          const px2 = cx + lx2 * xDir;
          const py2 = cy + v2 * effCapH;
          drawSeg3D(px1, py1, zPlane, px2, py2, zPlane, color, pxWidth);
        }
        cursor += cwChar + effCapH * effTracking;
      }
      ctx.restore();
    };

    const viewingFront = camPos.z >= -20.0 || exp > 0.15;
    const viewingRear = camPos.z < 20.0 || exp > 0.15;

    // Coaxial Dashed Alignment Guides when Exploded
    if (exp > 0.05) {
      ctx.save();
      ctx.setLineDash([4, 4]);
      for (const [ax, ay] of [[0, 25.3], [0, -78.2], [-70, 92], [70, 92], [-70, -92], [70, -92]]) {
        drawSeg3D(ax, ay, zRear - 10, ax, ay, zHands + 10, "rgba(224,60,11,0.55)", 1.1);
      }
      ctx.restore();
    }

    // Rear Electronics Wire Harness, LEDs & Rear Plaque Text
    if (viewingRear) {
      const wireColors = ["#2868D8", "#E85898", "#E8C828", "#E87818", "#D82828"];
      for (let w = 0; w < 4; w++) {
        const wy1 = 18 + w * 2.2;
        const wy2 = -48 - w * 2.2;
        drawSeg3D(30, -4 + w * 2, zWires, -28, wy1, zWires, wireColors[w], 1.8);
        drawSeg3D(30, -18 - w * 2, zWires, -28, wy2, zWires, wireColors[w], 1.8);
        const pLed1 = project(-52 + w * 4.5, 34, zPcbs - 2.0);
        const pLed2 = project(-52 + w * 4.5, -40, zPcbs - 2.0);
        ctx.fillStyle = "#FF6A00";
        ctx.beginPath();
        ctx.arc(pLed1.x, pLed1.y, 2.5, 0, Math.PI * 2);
        ctx.arc(pLed2.x, pLed2.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      const zPlaque = zDeck - 2.4;
      const shortReg = (this.regionTitle || "SYDNEY").split(",")[0].trim().slice(0, 14).toUpperCase();
      drawString3D("SURF CLOCK // SC-01", 44.0, 83.2, zPlaque, 2.15, 0.38, "#F4F1EA", 46.0, 0.26, -1.0, false);
      drawString3D("OPEN SOURCE HARDWARE", 44.0, 78.8, zPlaque, 1.85, 0.34, "#F4F1EA", 46.0, 0.26, -1.0, false);
      drawString3D("DUAL 28BYJ-48 STEPPER", 44.0, 74.6, zPlaque, 1.75, 0.32, "#F4F1EA", 46.0, 0.26, -1.0, false);
      drawString3D(`${shortReg} TELEMETRY`, -44.0, 83.2, zPlaque, 2.15, 0.38, "#F4F1EA", 46.0, 0.26, -1.0, false);
      drawString3D("ESP32-S3 // NVS RTC", -44.0, 78.8, zPlaque, 1.85, 0.34, "#F4F1EA", 46.0, 0.26, -1.0, false);
      drawString3D("GPIO 4-7 // GPIO 11-14", -44.0, 74.6, zPlaque, 1.75, 0.32, "#F4F1EA", 46.0, 0.26, -1.0, false);
      drawString3D("ESP32-S3", 44.0, -5.2, zPcbs - 2.8, 1.95, 0.32, "#141618", 22.0, 0.24, -1.0, false);
      drawString3D("ULN2003A", -44.0, 22.0, zPcbs - 2.2, 1.65, 0.28, "#F4F1EA", 20.0, 0.24, -1.0, false);
      drawString3D("ULN2003A", -44.0, -52.0, zPcbs - 2.2, 1.65, 0.28, "#F4F1EA", 20.0, 0.24, -1.0, false);
    }

    // Front Dial Recessed Basin AO, Typography, Graduation Ticks, Sub-Dial Arch & Tapered 3D Hands
    if (viewingFront) {
      // 1. Deep Recessed Basin Perimeter Ambient Occlusion Shadow (top & left inner frame shadow onto dial)
      if (exp < 0.12) {
        const dTL = project(-75, 98, zDial + 1.3);
        const dTR = project(75, 98, zDial + 1.3);
        const dBL = project(-75, -98, zDial + 1.3);
        const dBR = project(75, -98, zDial + 1.3);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(dTL.x, dTL.y);
        ctx.lineTo(dTR.x, dTR.y);
        ctx.lineTo(dBR.x, dBR.y);
        ctx.lineTo(dBL.x, dBL.y);
        ctx.closePath();
        ctx.clip();

        // Top inner shadow
        const topSh = ctx.createLinearGradient(0, dTL.y, 0, dTL.y + 28);
        topSh.addColorStop(0, "rgba(10, 10, 12, 0.32)");
        topSh.addColorStop(0.45, "rgba(10, 10, 12, 0.10)");
        topSh.addColorStop(1, "rgba(10, 10, 12, 0)");
        ctx.fillStyle = topSh;
        ctx.fillRect(dTL.x - 10, dTL.y - 2, dTR.x - dTL.x + 20, 32);

        // Left inner shadow
        const leftSh = ctx.createLinearGradient(dTL.x, 0, dTL.x + 24, 0);
        leftSh.addColorStop(0, "rgba(10, 10, 12, 0.26)");
        leftSh.addColorStop(0.5, "rgba(10, 10, 12, 0.08)");
        leftSh.addColorStop(1, "rgba(10, 10, 12, 0)");
        ctx.fillStyle = leftSh;
        ctx.fillRect(dTL.x - 2, dTL.y - 10, 28, dBL.y - dTL.y + 20);

        // Directional Key-Light Specular Sheen across the Dial Faceplate
        const dialW = dTR.x - dTL.x;
        const dialH = dBL.y - dTL.y;
        const keyGlow = ctx.createRadialGradient(
          dTL.x + dialW * 0.28,
          dTL.y + dialH * 0.24,
          10,
          dTL.x + dialW * 0.45,
          dTL.y + dialH * 0.48,
          Math.max(dialW, dialH) * 0.85
        );
        keyGlow.addColorStop(0, "rgba(255, 252, 245, 0.22)");
        keyGlow.addColorStop(0.55, "rgba(255, 252, 245, 0.04)");
        keyGlow.addColorStop(1, "rgba(10, 12, 16, 0.10)");
        ctx.fillStyle = keyGlow;
        ctx.fillRect(dTL.x, dTL.y, dialW, dialH);


        ctx.restore();
      }

      const zT = zInlay + 0.8;
      const inlayCol = this.swColors.inlay || "#141619";
      const UPPER_Y = 25.3;
      const LOWER_Y = -78.2;

      // 12 Radial Upper Ticks
      for (let i = 0; i < 12; i++) {
        const rad = (i * 30 * Math.PI) / 180.0;
        const isMajor = i % 2 === 0;
        const r0 = isMajor ? 18.8 : 20.8;
        const r1 = 25.2;
        drawSeg3D(
          Math.sin(rad) * r0,
          UPPER_Y + Math.cos(rad) * r0,
          zT,
          Math.sin(rad) * r1,
          UPPER_Y + Math.cos(rad) * r1,
          zT,
          inlayCol,
          isMajor ? 2.1 : 1.3
        );
      }

      // 5 Dynamic Beach Labels + Screen Hit Targets
      const layout = [
        { idx: 0, cx: 0.0, cy: 64.5, capH: 4.55, sw: 0.86, maxW: 68.0 },
        { idx: 1, cx: -50.8, cy: 40.5, capH: 3.30, sw: 0.64, maxW: 41.0 },
        { idx: 2, cx: 48.0, cy: 38.8, capH: 3.45, sw: 0.68, maxW: 42.0 },
        { idx: 3, cx: -49.5, cy: -1.8, capH: 3.45, sw: 0.68, maxW: 42.0 },
        { idx: 4, cx: 48.0, cy: -1.8, capH: 3.45, sw: 0.68, maxW: 42.0 },
      ];
      this.swBeachHitPts = [];
      for (const item of layout) {
        const label = this.beachNames[item.idx] || DIAL_SLOTS[item.idx].defaultBeach;
        drawString3D(label, item.cx, item.cy, zT, item.capH, item.sw, inlayCol, item.maxW, 0.30, 1.0, true);
        const hp = project(item.cx, item.cy, zT);
        this.swBeachHitPts.push({ idx: item.idx, x: hp.x, y: hp.y });
      }

      // Lower 180-deg Sub-Dial Arch & Ticks
      const ARCH_R = 23.0;
      for (let s = 0; s < 36; s++) {
        const a0 = (-90 + (180 * s) / 36) * (Math.PI / 180);
        const a1 = (-90 + (180 * (s + 1)) / 36) * (Math.PI / 180);
        drawSeg3D(
          Math.sin(a0) * ARCH_R,
          LOWER_Y + Math.cos(a0) * ARCH_R,
          zT,
          Math.sin(a1) * ARCH_R,
          LOWER_Y + Math.cos(a1) * ARCH_R,
          zT,
          inlayCol,
          1.75
        );
      }
      drawSeg3D(-ARCH_R - 4.2, LOWER_Y, zT, -ARCH_R + 2.8, LOWER_Y, zT, inlayCol, 1.85);
      drawSeg3D(ARCH_R - 2.8, LOWER_Y, zT, ARCH_R + 4.2, LOWER_Y, zT, inlayCol, 1.85);
      for (let deg = -72; deg <= 72; deg += 18) {
        const rad = (deg * Math.PI) / 180.0;
        const r1 = deg === 0 ? ARCH_R + 3.4 : ARCH_R + 2.0;
        drawSeg3D(
          Math.sin(rad) * ARCH_R,
          LOWER_Y + Math.cos(rad) * ARCH_R,
          zT,
          Math.sin(rad) * r1,
          LOWER_Y + Math.cos(rad) * r1,
          zT,
          inlayCol,
          deg === 0 ? 1.85 : 1.25
        );
      }

      if (this.subdialMode === "conditions") {
        drawString3D("1", -41.0, LOWER_Y - 1.2, zT, 3.10, 0.60, inlayCol, 20.0);
        drawString3D("10", 42.5, LOWER_Y - 1.2, zT, 3.10, 0.60, inlayCol, 20.0);
        drawString3D("CONDITIONS", 0.0, LOWER_Y - 13.8, zT, 2.75, 0.54, inlayCol, 68.0);
      } else if (this.subdialMode === "swell") {
        drawString3D("FLAT", -44.5, LOWER_Y - 1.2, zT, 2.85, 0.56, inlayCol, 26.0);
        drawString3D("EPIC", 45.5, LOWER_Y - 1.2, zT, 2.85, 0.56, inlayCol, 26.0);
        drawString3D("SWELL", 0.0, LOWER_Y - 13.8, zT, 2.85, 0.56, inlayCol, 60.0);
      } else {
        drawString3D("NAH", -44.5, LOWER_Y - 1.2, zT, 2.85, 0.56, inlayCol, 26.0);
        drawString3D("YEAH", 45.5, LOWER_Y - 1.2, zT, 2.85, 0.56, inlayCol, 26.0);
        drawString3D("WORTH IT?", 0.0, LOWER_Y - 13.8, zT, 2.75, 0.54, inlayCol, 68.0);
      }

      // TIER 9: Tapered 3D Lacquered Stepper Hands with Cast Shadows & Crowned Center Bosses
      const handCol = this.swColors.hands || "#E83505";
      const drawTaperedHand3D = (cx, cy, angleDeg, tipLen, tailLen, wBase, wTip, hubR) => {
        const rad = (angleDeg * Math.PI) / 180.0;
        const ux = Math.sin(rad), uy = Math.cos(rad);
        const nx = -uy, ny = ux;

        const pTailL = project(cx - ux * tailLen - nx * wBase, cy - uy * tailLen - ny * wBase, zHands);
        const pTailR = project(cx - ux * tailLen + nx * wBase, cy - uy * tailLen + ny * wBase, zHands);
        const pTipR  = project(cx + ux * tipLen + nx * wTip,  cy + uy * tipLen + ny * wTip,  zHands);
        const pTipL  = project(cx + ux * tipLen - nx * wTip,  cy + uy * tipLen - ny * wTip,  zHands);

        ctx.save();
        ctx.shadowColor = "rgba(12, 14, 16, 0.34)";
        ctx.shadowBlur = 6.5;
        ctx.shadowOffsetX = 2.8;
        ctx.shadowOffsetY = 4.2;

        ctx.beginPath();
        ctx.moveTo(pTailL.x, pTailL.y);
        ctx.lineTo(pTailR.x, pTailR.y);
        ctx.lineTo(pTipR.x, pTipR.y);
        ctx.lineTo(pTipL.x, pTipL.y);
        ctx.closePath();

        const hg = ctx.createLinearGradient(pTailL.x, pTailL.y, pTipR.x, pTipR.y);
        hg.addColorStop(0, this._shadeHex(handCol, 0.92));
        hg.addColorStop(0.45, this._shadeHex(handCol, 1.14));
        hg.addColorStop(1, handCol);
        ctx.fillStyle = hg;
        ctx.fill();
        ctx.restore();

        // Specular ridge along the center of the baton
        drawSeg3D(
          cx - ux * (tailLen * 0.7),
          cy - uy * (tailLen * 0.7),
          zHands + 0.2,
          cx + ux * (tipLen * 0.92),
          cy + uy * (tipLen * 0.92),
          zHands + 0.2,
          "rgba(255,255,255,0.28)",
          1.1
        );

        // 3D Crowned Center Hub Cap with Specular Highlight
        const pHub = project(cx, cy, zHands + 0.6);
        const pEdge = project(cx + hubR, cy, zHands + 0.6);
        const rPx = Math.max(4.5, Math.hypot(pEdge.x - pHub.x, pEdge.y - pHub.y));

        ctx.save();
        ctx.shadowColor = "rgba(10, 12, 14, 0.32)";
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1.5;
        ctx.shadowOffsetY = 2.2;
        const capGrad = ctx.createRadialGradient(pHub.x - rPx * 0.3, pHub.y - rPx * 0.3, rPx * 0.1, pHub.x, pHub.y, rPx);
        capGrad.addColorStop(0, this._shadeHex(handCol, 1.32));
        capGrad.addColorStop(0.65, handCol);
        capGrad.addColorStop(1, this._shadeHex(handCol, 0.72));
        ctx.beginPath();
        ctx.arc(pHub.x, pHub.y, rPx, 0, Math.PI * 2);
        ctx.fillStyle = capGrad;
        ctx.fill();
        ctx.restore();
      };

      drawTaperedHand3D(0.0, UPPER_Y, this.upperAngleCurrent, 37.5, 10.2, 1.45, 0.72, 3.8);
      drawTaperedHand3D(0.0, LOWER_Y, this.lowerAngleCurrent, 22.0, 4.8, 1.10, 0.58, 2.8);

      // Anti-Reflective Sapphire/Mineral Glass Crystal Specular Reflection Band (glides as you orbit!)
      if (this.rearCoverVisible && exp < 0.12) {
        const gTL = project(-77, 100, 1.5);
        const gTR = project(77, 100, 1.5);
        const gBR = project(77, -100, 1.5);
        const gBL = project(-77, -100, 1.5);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(gTL.x, gTL.y);
        ctx.lineTo(gTR.x, gTR.y);
        ctx.lineTo(gBR.x, gBR.y);
        ctx.lineTo(gBL.x, gBL.y);
        ctx.closePath();
        ctx.clip();

        const orbitShift = (camPos.x / 180.0) * 90.0 + (camPos.y / 180.0) * 45.0;
        const glGrad = ctx.createLinearGradient(
          gTL.x + orbitShift - 40,
          gTL.y - 20,
          gBR.x + orbitShift + 40,
          gBR.y + 20
        );
        glGrad.addColorStop(0.0, "rgba(255, 255, 255, 0.0)");
        glGrad.addColorStop(0.32, "rgba(255, 255, 255, 0.02)");
        glGrad.addColorStop(0.44, "rgba(255, 255, 255, 0.14)");
        glGrad.addColorStop(0.49, "rgba(255, 255, 255, 0.22)");
        glGrad.addColorStop(0.53, "rgba(255, 255, 255, 0.03)");
        glGrad.addColorStop(1.0, "rgba(255, 255, 255, 0.0)");
        ctx.fillStyle = glGrad;
        ctx.fillRect(Math.min(gTL.x, gBL.x) - 20, Math.min(gTL.y, gTR.y) - 20, Math.abs(gTR.x - gTL.x) + 60, Math.abs(gBL.y - gTL.y) + 60);
        ctx.restore();
      }
    }

    ctx.restore();
  }
}
