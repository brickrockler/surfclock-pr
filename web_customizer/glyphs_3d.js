/**
 * SURF CLOCK (SC-01) — HIGH-PRECISION PROPORTIONAL DIN 1451 / BRAUN 3D STROKE ENGINE
 * Features:
 *   1. Smooth multi-segment spline/arc strokes for curved glyphs (B, C, D, G, J, O, P, Q, R, S, U, 0, 2, 3, 5, 6, 8, 9, ?)
 *   2. 10-sided beveled pillar caps at every stroke vertex (eliminating protruding corner boxes in macro zoom)
 *   3. Proportional DIN 1451 character advance widths (eliminating wide gaps around 'I' in PIPELINE / WAIMEA / HALEIWA / LANIAKEA)
 *   4. Procedural 12-tick upper radial index ring + lower 180° connected L-corner sub-dial arch (zero baked ghost text collision)
 *   5. Pure blank recessed dial faceplate & perimeter AO shadow frame builder
 */

import { DIAL_SLOTS } from "./surf_data.js?v=42";

// Helper to sample circular/elliptical arc segments [[u1,v1],[u2,v2]]
function arcSegs(cx, cy, rx, ry, degStart, degEnd, steps = 8) {
  const out = [];
  const r0 = (degStart * Math.PI) / 180.0;
  const r1 = (degEnd * Math.PI) / 180.0;
  for (let i = 0; i < steps; i++) {
    const t0 = r0 + ((r1 - r0) * i) / steps;
    const t1 = r0 + ((r1 - r0) * (i + 1)) / steps;
    out.push([
      [cx + Math.cos(t0) * rx, cy + Math.sin(t0) * ry],
      [cx + Math.cos(t1) * rx, cy + Math.sin(t1) * ry],
    ]);
  }
  return out;
}

export const CHAR_WIDTH_FACTORS = {
  I: 0.16,
  "1": 0.44,
  "'": 0.16,
  ".": 0.18,
  "-": 0.46,
  "/": 0.48,
  " ": 0.40,
  L: 0.54,
  F: 0.56,
  E: 0.58,
  T: 0.60,
  J: 0.52,
  P: 0.60,
  B: 0.62,
  R: 0.62,
  S: 0.60,
  C: 0.62,
  D: 0.64,
  G: 0.64,
  O: 0.66,
  Q: 0.66,
  U: 0.62,
  H: 0.62,
  N: 0.62,
  A: 0.66,
  V: 0.64,
  X: 0.64,
  Y: 0.64,
  Z: 0.60,
  K: 0.62,
  M: 0.78,
  W: 0.80,
};

export function getCharWidthFactor(ch) {
  return CHAR_WIDTH_FACTORS[ch] ?? 0.62;
}

export const FONT_STROKES = {
  A: [[[0.0, 0.0], [0.5, 1.0]], [[0.5, 1.0], [1.0, 0.0]], [[0.18, 0.34], [0.82, 0.34]]],
  B: [
    [[0.0, 0.0], [0.0, 1.0]],
    [[0.0, 1.0], [0.56, 1.0]],
    ...arcSegs(0.56, 0.76, 0.38, 0.24, 90, -90, 8),
    [[0.56, 0.52], [0.0, 0.52]],
    [[0.56, 0.52], [0.60, 0.52]],
    ...arcSegs(0.60, 0.26, 0.40, 0.26, 90, -90, 8),
    [[0.60, 0.0], [0.0, 0.0]],
  ],
  C: [
    ...arcSegs(0.52, 0.70, 0.46, 0.30, 32, 180, 7),
    [[0.06, 0.70], [0.06, 0.30]],
    ...arcSegs(0.52, 0.30, 0.46, 0.30, 180, 328, 7),
  ],
  D: [
    [[0.0, 0.0], [0.0, 1.0]],
    [[0.0, 1.0], [0.50, 1.0]],
    ...arcSegs(0.50, 0.68, 0.46, 0.32, 90, 0, 5),
    [[0.96, 0.68], [0.96, 0.32]],
    ...arcSegs(0.50, 0.32, 0.46, 0.32, 0, -90, 5),
    [[0.50, 0.0], [0.0, 0.0]],
  ],
  E: [
    [[0.0, 0.0], [0.0, 1.0]],
    [[0.0, 1.0], [0.92, 1.0]],
    [[0.0, 0.52], [0.76, 0.52]],
    [[0.0, 0.0], [0.94, 0.0]],
  ],
  F: [
    [[0.0, 0.0], [0.0, 1.0]],
    [[0.0, 1.0], [0.92, 1.0]],
    [[0.0, 0.52], [0.76, 0.52]],
  ],
  G: [
    ...arcSegs(0.52, 0.70, 0.46, 0.30, 34, 180, 7),
    [[0.06, 0.70], [0.06, 0.30]],
    ...arcSegs(0.52, 0.30, 0.46, 0.30, 180, 360, 7),
    [[0.98, 0.30], [0.98, 0.48]],
    [[0.98, 0.48], [0.52, 0.48]],
  ],
  H: [[[0.0, 0.0], [0.0, 1.0]], [[0.96, 0.0], [0.96, 1.0]], [[0.0, 0.52], [0.96, 0.52]]],
  I: [[[0.5, 0.0], [0.5, 1.0]]],
  J: [
    [[0.92, 1.0], [0.92, 0.30]],
    ...arcSegs(0.48, 0.30, 0.44, 0.30, 0, -165, 8),
  ],
  K: [[[0.0, 0.0], [0.0, 1.0]], [[0.96, 1.0], [0.06, 0.46]], [[0.32, 0.60], [0.98, 0.0]]],
  L: [[[0.0, 1.0], [0.0, 0.0]], [[0.0, 0.0], [0.92, 0.0]]],
  M: [
    [[0.0, 0.0], [0.0, 1.0]],
    [[0.0, 1.0], [0.5, 0.22]],
    [[0.5, 0.22], [1.0, 1.0]],
    [[1.0, 1.0], [1.0, 0.0]],
  ],
  N: [[[0.0, 0.0], [0.0, 1.0]], [[0.0, 1.0], [0.96, 0.0]], [[0.96, 0.0], [0.96, 1.0]]],
  O: [
    ...arcSegs(0.50, 0.70, 0.46, 0.30, 0, 180, 8),
    [[0.04, 0.70], [0.04, 0.30]],
    ...arcSegs(0.50, 0.30, 0.46, 0.30, 180, 360, 8),
    [[0.96, 0.30], [0.96, 0.70]],
  ],
  P: [
    [[0.0, 0.0], [0.0, 1.0]],
    [[0.0, 1.0], [0.56, 1.0]],
    ...arcSegs(0.56, 0.74, 0.40, 0.26, 90, -90, 9),
    [[0.56, 0.48], [0.0, 0.48]],
  ],
  Q: [
    ...arcSegs(0.50, 0.70, 0.46, 0.30, 0, 180, 8),
    [[0.04, 0.70], [0.04, 0.30]],
    ...arcSegs(0.50, 0.30, 0.46, 0.30, 180, 360, 8),
    [[0.96, 0.30], [0.96, 0.70]],
    [[0.58, 0.26], [1.02, -0.08]],
  ],
  R: [
    [[0.0, 0.0], [0.0, 1.0]],
    [[0.0, 1.0], [0.56, 1.0]],
    ...arcSegs(0.56, 0.75, 0.40, 0.25, 90, -90, 9),
    [[0.56, 0.50], [0.0, 0.50]],
    [[0.52, 0.50], [0.96, 0.0]],
  ],
  S: [
    ...arcSegs(0.50, 0.74, 0.44, 0.26, 28, 255, 9),
    [[0.39, 0.49], [0.61, 0.45]],
    ...arcSegs(0.50, 0.25, 0.46, 0.25, 75, -152, 9),
  ],
  T: [[[0.0, 1.0], [1.0, 1.0]], [[0.5, 0.0], [0.5, 1.0]]],
  U: [
    [[0.04, 1.0], [0.04, 0.32]],
    ...arcSegs(0.50, 0.32, 0.46, 0.32, 180, 360, 9),
    [[0.96, 0.32], [0.96, 1.0]],
  ],
  V: [[[0.0, 1.0], [0.5, 0.0]], [[0.5, 0.0], [1.0, 1.0]]],
  W: [
    [[0.0, 1.0], [0.22, 0.0]],
    [[0.22, 0.0], [0.50, 0.74]],
    [[0.50, 0.74], [0.78, 0.0]],
    [[0.78, 0.0], [1.0, 1.0]],
  ],
  X: [[[0.0, 1.0], [1.0, 0.0]], [[0.0, 0.0], [1.0, 1.0]]],
  Y: [[[0.0, 1.0], [0.5, 0.48]], [[1.0, 1.0], [0.5, 0.48]], [[0.5, 0.48], [0.5, 0.0]]],
  Z: [[[0.0, 1.0], [0.96, 1.0]], [[0.96, 1.0], [0.0, 0.0]], [[0.0, 0.0], [0.96, 0.0]]],
  "0": [
    ...arcSegs(0.50, 0.70, 0.45, 0.30, 0, 180, 8),
    [[0.05, 0.70], [0.05, 0.30]],
    ...arcSegs(0.50, 0.30, 0.45, 0.30, 180, 360, 8),
    [[0.95, 0.30], [0.95, 0.70]],
  ],
  "1": [[[0.18, 0.76], [0.56, 1.0]], [[0.56, 1.0], [0.56, 0.0]], [[0.16, 0.0], [0.92, 0.0]]],
  "2": [
    ...arcSegs(0.50, 0.72, 0.44, 0.28, 155, -25, 9),
    [[0.90, 0.60], [0.04, 0.0]],
    [[0.04, 0.0], [0.96, 0.0]],
  ],
  "3": [
    ...arcSegs(0.50, 0.75, 0.42, 0.25, 150, -90, 8),
    [[0.50, 0.50], [0.36, 0.50]],
    ...arcSegs(0.50, 0.25, 0.45, 0.25, 90, -155, 8),
  ],
  "4": [[[0.72, 0.0], [0.72, 1.0]], [[0.72, 1.0], [0.04, 0.32]], [[0.04, 0.32], [0.96, 0.32]]],
  "5": [
    [[0.92, 1.0], [0.08, 1.0]],
    [[0.08, 1.0], [0.06, 0.54]],
    [[0.06, 0.54], [0.52, 0.54]],
    ...arcSegs(0.52, 0.27, 0.44, 0.27, 90, -155, 9),
  ],
  "6": [
    ...arcSegs(0.52, 0.70, 0.44, 0.30, 35, 180, 7),
    [[0.08, 0.70], [0.08, 0.28]],
    ...arcSegs(0.52, 0.28, 0.44, 0.28, 180, 540, 12),
  ],
  "7": [[[0.04, 1.0], [0.96, 1.0]], [[0.96, 1.0], [0.32, 0.0]]],
  "8": [
    ...arcSegs(0.50, 0.76, 0.41, 0.24, 0, 360, 12),
    ...arcSegs(0.50, 0.26, 0.45, 0.26, 0, 360, 12),
  ],
  "9": [
    ...arcSegs(0.48, 0.72, 0.44, 0.28, 0, 360, 12),
    [[0.92, 0.72], [0.92, 0.30]],
    ...arcSegs(0.48, 0.30, 0.44, 0.30, 0, -145, 7),
  ],
  "?": [
    ...arcSegs(0.50, 0.74, 0.42, 0.26, 155, -45, 8),
    [[0.80, 0.56], [0.50, 0.40]],
    [[0.50, 0.40], [0.50, 0.25]],
    [[0.50, 0.08], [0.50, 0.0]],
  ],
  "-": [[[0.12, 0.50], [0.88, 0.50]]],
  "'": [[[0.50, 1.02], [0.42, 0.72]]],
  ".": [[[0.50, 0.10], [0.50, 0.0]]],
  "/": [[[0.10, 0.0], [0.90, 1.0]]],
  "&": [
    [[0.92, 0.0], [0.14, 0.74]],
    ...arcSegs(0.46, 0.78, 0.32, 0.22, 160, -30, 7),
    [[0.74, 0.66], [0.08, 0.32]],
    ...arcSegs(0.48, 0.24, 0.40, 0.24, 165, 340, 7),
  ],
  " ": [],
};

/**
 * Appends a 10-sided beveled circular joint/terminal pillar at (cx, cy) with radius r = sw * 0.5.
 * Ensures every stroke corner and terminal end is smoothly rounded with zero protruding box corners!
 */
function pushBeveledJointCap(positions, indices, cx, cy, r, zBack = -4.675, zFront = -3.965, flipZ = false) {
  const N = 10;
  const bevelInset = Math.min(0.065, r * 0.28);
  const rTop = Math.max(0.02, r - bevelInset);
  const zMid = flipZ ? zFront + bevelInset : zFront - bevelInset;

  const baseIdx = positions.length / 3;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2.0;
    positions.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r, zBack);
  }
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2.0;
    positions.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r, zMid);
  }
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2.0;
    positions.push(cx + Math.cos(a) * rTop, cy + Math.sin(a) * rTop, zFront);
  }
  const centerTopIdx = positions.length / 3;
  positions.push(cx, cy, zFront);

  for (let i = 0; i < N; i++) {
    const i1 = (i + 1) % N;
    if (!flipZ) {
      indices.push(baseIdx + i, baseIdx + i1, baseIdx + N + i1);
      indices.push(baseIdx + i, baseIdx + N + i1, baseIdx + N + i);
      indices.push(baseIdx + N + i, baseIdx + N + i1, baseIdx + 2 * N + i1);
      indices.push(baseIdx + N + i, baseIdx + 2 * N + i1, baseIdx + 2 * N + i);
      indices.push(centerTopIdx, baseIdx + 2 * N + i, baseIdx + 2 * N + i1);
    } else {
      indices.push(baseIdx + i, baseIdx + N + i1, baseIdx + i1);
      indices.push(baseIdx + i, baseIdx + N + i, baseIdx + N + i1);
      indices.push(baseIdx + N + i, baseIdx + 2 * N + i1, baseIdx + N + i1);
      indices.push(baseIdx + N + i, baseIdx + 2 * N + i, baseIdx + 2 * N + i1);
      indices.push(centerTopIdx, baseIdx + 2 * N + i1, baseIdx + 2 * N + i);
    }
  }
}

/**
 * Appends a single beveled 3D stroke prism segment strictly from (x1, y1) to (x2, y2)
 * with rounded 10-sided beveled end caps at both endpoints.
 */
export function pushBeveledStrokeSegment(
  positions,
  indices,
  x1,
  y1,
  x2,
  y2,
  sw,
  zBack = -4.675,
  zFront = -3.965,
  withCaps = true,
  flipZ = false
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const L = Math.hypot(dx, dy);
  const hw = sw * 0.5;
  if (L < 1e-5) {
    if (withCaps) pushBeveledJointCap(positions, indices, x1, y1, hw, zBack, zFront, flipZ);
    return;
  }

  const ux = dx / L;
  const uy = dy / L;
  const nx = -uy * hw;
  const ny = ux * hw;

  const b0 = [x1 - nx, y1 - ny];
  const b1 = [x2 - nx, y2 - ny];
  const b2 = [x2 + nx, y2 + ny];
  const b3 = [x1 + nx, y1 + ny];

  const bevelInset = Math.min(0.065, sw * 0.14);
  const nxIn = -uy * Math.max(0.02, hw - bevelInset);
  const nyIn = ux * Math.max(0.02, hw - bevelInset);

  const t0 = [x1 - nxIn, y1 - nyIn];
  const t1 = [x2 - nxIn, y2 - nyIn];
  const t2 = [x2 + nxIn, y2 + nyIn];
  const t3 = [x1 + nxIn, y1 + nyIn];

  const zMid = flipZ ? zFront + bevelInset : zFront - bevelInset;

  const baseIdx = positions.length / 3;
  for (const [px, py] of [b0, b1, b2, b3]) positions.push(px, py, zBack);
  for (const [px, py] of [b0, b1, b2, b3]) positions.push(px, py, zMid);
  for (const [px, py] of [t0, t1, t2, t3]) positions.push(px, py, zFront);

  for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) % 4;
    if (!flipZ) {
      indices.push(baseIdx + k, baseIdx + k1, baseIdx + 4 + k1);
      indices.push(baseIdx + k, baseIdx + 4 + k1, baseIdx + 4 + k);
      indices.push(baseIdx + 4 + k, baseIdx + 4 + k1, baseIdx + 8 + k1);
      indices.push(baseIdx + 4 + k, baseIdx + 8 + k1, baseIdx + 8 + k);
    } else {
      indices.push(baseIdx + k, baseIdx + 4 + k1, baseIdx + k1);
      indices.push(baseIdx + k, baseIdx + 4 + k, baseIdx + 4 + k1);
      indices.push(baseIdx + 4 + k, baseIdx + 8 + k1, baseIdx + 4 + k1);
      indices.push(baseIdx + 4 + k, baseIdx + 8 + k, baseIdx + 8 + k1);
    }
  }
  if (!flipZ) {
    indices.push(baseIdx + 8, baseIdx + 9, baseIdx + 10);
    indices.push(baseIdx + 8, baseIdx + 10, baseIdx + 11);
  } else {
    indices.push(baseIdx + 8, baseIdx + 10, baseIdx + 9);
    indices.push(baseIdx + 8, baseIdx + 11, baseIdx + 10);
  }

  if (withCaps) {
    pushBeveledJointCap(positions, indices, x1, y1, hw, zBack, zFront, flipZ);
    pushBeveledJointCap(positions, indices, x2, y2, hw, zBack, zFront, flipZ);
  }
}

/**
 * Measures proportional width of a string for a given capH and tracking.
 */
export function measureProportionalString(clean, capH, tracking) {
  let w = 0;
  for (let i = 0; i < clean.length; i++) {
    const cw = capH * getCharWidthFactor(clean[i]);
    w += cw;
    if (i < clean.length - 1) {
      w += capH * tracking;
    }
  }
  return w;
}

/**
 * Appends a centered proportional DIN 1451 3D string at (cx, cy).
 * Supports both front-facing (+Z) and rear-plaque-facing (-Z, xDir = -1, flipZ = true) text!
 */
export function appendString3D(
  positions,
  indices,
  text,
  cx,
  cy,
  capH,
  sw,
  maxW = 999.0,
  tracking = 0.30,
  zBack = -4.675,
  zFront = -3.965,
  xDir = 1.0
) {
  const clean = (text || "").toUpperCase().trim();
  if (!clean) return;

  let effCapH = capH;
  let effSw = sw;
  let effTracking = tracking;

  let totalW = measureProportionalString(clean, effCapH, effTracking);
  if (totalW > maxW) {
    effTracking = Math.max(0.20, tracking * (maxW / totalW));
    totalW = measureProportionalString(clean, effCapH, effTracking);
    if (totalW > maxW) {
      const scale = maxW / totalW;
      effCapH *= scale;
      effSw = Math.max(0.44, sw * Math.pow(scale, 0.85));
      totalW = measureProportionalString(clean, effCapH, effTracking);
    }
  }

  const flipZ = zFront < zBack;
  let cursor = -totalW * 0.5;
  const baseY = cy;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const cw = effCapH * getCharWidthFactor(ch);
    const segs = FONT_STROKES[ch] || [];

    // Deduplicate vertex caps per character for speed & clean topology
    const cappedKeys = new Set();
    const hw = effSw * 0.5;

    for (const [[u1, v1], [u2, v2]] of segs) {
      const lx1 = cursor + (ch === "I" ? 0.5 : u1) * cw;
      const lx2 = cursor + (ch === "I" ? 0.5 : u2) * cw;
      const px1 = cx + lx1 * xDir;
      const py1 = baseY + v1 * effCapH;
      const px2 = cx + lx2 * xDir;
      const py2 = baseY + v2 * effCapH;

      pushBeveledStrokeSegment(positions, indices, px1, py1, px2, py2, effSw, zBack, zFront, false, flipZ);

      const k1 = `${px1.toFixed(2)},${py1.toFixed(2)}`;
      if (!cappedKeys.has(k1)) {
        cappedKeys.add(k1);
        pushBeveledJointCap(positions, indices, px1, py1, hw, zBack, zFront, flipZ);
      }
      const k2 = `${px2.toFixed(2)},${py2.toFixed(2)}`;
      if (!cappedKeys.has(k2)) {
        cappedKeys.add(k2);
        pushBeveledJointCap(positions, indices, px2, py2, hw, zBack, zFront, flipZ);
      }
    }

    cursor += cw + effCapH * effTracking;
  }
}

/**
 * Builds the complete Three.js BufferGeometry for:
 *   1. The 12 radial upper index ticks around (0, +25.3)
 *   2. The 5 dynamic beach labels around (0, +25.3)
 *   3. The lower 180° semi-circular sub-dial arch, L-corner leader tabs, and 9 radial ticks around (0, -78.2)
 *   4. The lower sub-dial labels (`NAH / YEAH / WORTH IT?` or `1 / 10 / CONDITIONS` or `FLAT / EPIC / SWELL`)
 */
export function buildDialTypographyGeometry(THREE, beachNames5, subdialMode = "worth_it", includeTicksAndArch = false) {
  const positions = [];
  const indices = [];

  const UPPER_Y = 25.3;
  const LOWER_Y = -78.2;

  if (includeTicksAndArch) {
    // 1. Authentic 9 Upper Sector Ticks around (0, +25.3) matching 19_Gauntlet_Verified_Masterpiece_v5_ULTRA.jpg
    const majorAngles = [-120, -60, 0, 60, 120];
    const minorAngles = [-90, -30, 30, 90];
    for (const deg of majorAngles) {
      const rad = (deg * Math.PI) / 180.0;
      const r0 = 37.5;
      const r1 = deg === 0 ? 46.8 : 44.5;
      const sw = deg === 0 ? 2.05 : 1.75;
      pushBeveledStrokeSegment(
        positions,
        indices,
        Math.sin(rad) * r0,
        UPPER_Y + Math.cos(rad) * r0,
        Math.sin(rad) * r1,
        UPPER_Y + Math.cos(rad) * r1,
        sw,
        -4.675,
        -3.965,
        true,
        false
      );
    }
    for (const deg of minorAngles) {
      const rad = (deg * Math.PI) / 180.0;
      pushBeveledStrokeSegment(
        positions,
        indices,
        Math.sin(rad) * 39.2,
        UPPER_Y + Math.cos(rad) * 39.2,
        Math.sin(rad) * 44.2,
        UPPER_Y + Math.cos(rad) * 44.2,
        1.30,
        -4.675,
        -3.965,
        true,
        false
      );
    }

    // 3. Lower 180° Semi-Circular Sub-Dial Arch + Connected L-Corner Feet around (0, -78.2)
    const ARCH_R = 31.375;
    const ARCH_STEPS = 64;
    for (let i = 0; i < ARCH_STEPS; i++) {
      const a0 = (-90.0 + (180.0 * i) / ARCH_STEPS) * (Math.PI / 180.0);
      const a1 = (-90.0 + (180.0 * (i + 1)) / ARCH_STEPS) * (Math.PI / 180.0);
      pushBeveledStrokeSegment(
        positions,
        indices,
        Math.sin(a0) * ARCH_R,
        LOWER_Y + Math.cos(a0) * ARCH_R,
        Math.sin(a1) * ARCH_R,
        LOWER_Y + Math.cos(a1) * ARCH_R,
        1.55,
        -4.675,
        -3.965,
        i === 0 || i === ARCH_STEPS - 1,
        false
      );
    }
    // Connected inward L-corner feet at -90° and +90°
    pushBeveledStrokeSegment(positions, indices, -32.15, LOWER_Y, -26.20, LOWER_Y, 1.55);
    pushBeveledStrokeSegment(positions, indices, 26.20, LOWER_Y, 32.15, LOWER_Y, 1.55);
    // Top 12-o'clock center tick hanging down from inside of the arch
    pushBeveledStrokeSegment(positions, indices, 0.0, LOWER_Y + 31.20, 0.0, LOWER_Y + 27.60, 1.55);
  }

  // 2. 5 Upper Beach Labels around Upper Shaft (0, +25.3) — Crisp Bold DIN 1451 Relief
  DIAL_SLOTS.forEach((slot, idx) => {
    const rawName = beachNames5 && beachNames5[idx] ? beachNames5[idx] : "LOCAL REEF";
    const sw = idx === 0 ? 0.76 : 0.68;
    const tr = idx === 0 ? 0.34 : 0.31;
    appendString3D(positions, indices, rawName, slot.cx, slot.cy, slot.defaultCapH, sw, slot.maxW, tr);
  });

  // 4. Lower Sub-Dial Mode Labels around Lower Shaft (0, -78.2)
  if (subdialMode === "conditions") {
    appendString3D(positions, indices, "1", -43.5, LOWER_Y - 1.2, 3.10, 0.68, 20.0, 0.32);
    appendString3D(positions, indices, "10", 44.5, LOWER_Y - 1.2, 3.10, 0.68, 20.0, 0.32);
    appendString3D(positions, indices, "CONDITIONS", 0.0, LOWER_Y - 14.2, 2.75, 0.62, 68.0, 0.32);
  } else if (subdialMode === "swell") {
    appendString3D(positions, indices, "FLAT", -45.5, LOWER_Y - 1.2, 2.85, 0.64, 26.0, 0.32);
    appendString3D(positions, indices, "EPIC", 46.5, LOWER_Y - 1.2, 2.85, 0.64, 26.0, 0.32);
    appendString3D(positions, indices, "SWELL", 0.0, LOWER_Y - 14.2, 2.85, 0.64, 60.0, 0.34);
  } else {
    appendString3D(positions, indices, "NAH", -45.5, LOWER_Y - 1.2, 2.85, 0.64, 26.0, 0.32);
    appendString3D(positions, indices, "YEAH", 46.5, LOWER_Y - 1.2, 2.85, 0.64, 26.0, 0.32);
    appendString3D(positions, indices, "WORTH IT?", 0.0, LOWER_Y - 14.2, 2.75, 0.62, 68.0, 0.32);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  const nonIndexed = geom.toNonIndexed();
  nonIndexed.computeVertexNormals();
  geom.dispose();
  return nonIndexed;
}

/**
 * Builds dynamic rear data plaque & IC chip markings facing -Z (readable from the rear camera at Z = -525!)
 * Remember: when looking from -Z toward +Z with +Y up, screen-right is -X (`xDir = -1.0`).
 */
export function buildRearPlaqueTypographyGeometry(THREE, regionTitle = "SYDNEY") {
  const positions = [];
  const indices = [];

  const shortRegion = (regionTitle || "SYDNEY").split(",")[0].trim().slice(0, 14).toUpperCase();
  const zBack = -17.15;
  const zFront = -17.92;

  // Left Plaque (from rear camera perspective: +X = +44.0)
  appendString3D(positions, indices, "SURF CLOCK // SC-01", 44.0, 83.2, 2.15, 0.38, 46.0, 0.26, zBack, zFront, -1.0);
  appendString3D(positions, indices, "OPEN SOURCE HARDWARE", 44.0, 78.8, 1.85, 0.34, 46.0, 0.26, zBack, zFront, -1.0);
  appendString3D(positions, indices, "DUAL 28BYJ-48 STEPPER", 44.0, 74.6, 1.75, 0.32, 46.0, 0.26, zBack, zFront, -1.0);

  // Right Plaque (from rear camera perspective: -X = -44.0) — dynamically displays selected region!
  appendString3D(
    positions,
    indices,
    `${shortRegion} TELEMETRY`,
    -44.0,
    83.2,
    2.15,
    0.38,
    46.0,
    0.26,
    zBack,
    zFront,
    -1.0
  );
  appendString3D(positions, indices, "ESP32-S3 // NVS RTC", -44.0, 78.8, 1.85, 0.34, 46.0, 0.26, zBack, zFront, -1.0);
  appendString3D(positions, indices, "BATCH 001 // VERIFIED", -44.0, 74.6, 1.75, 0.32, 46.0, 0.26, zBack, zFront, -1.0);

  // Un-mirrored IC laser markings on ESP32-S3 (+44) and dual ULN2003A (-44)
  appendString3D(positions, indices, "ESP32-S3", 44.0, -5.2, 1.95, 0.32, 22.0, 0.24, -21.4, -22.15, -1.0);
  appendString3D(positions, indices, "WROOM-1", 44.0, -8.4, 1.55, 0.28, 22.0, 0.24, -21.4, -22.15, -1.0);
  appendString3D(positions, indices, "ULN2003A", -44.0, 22.0, 1.65, 0.28, 20.0, 0.24, -21.4, -22.15, -1.0);
  appendString3D(positions, indices, "ULN2003A", -44.0, -52.0, 1.65, 0.28, 20.0, 0.24, -21.4, -22.15, -1.0);

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  const nonIndexed = geom.toNonIndexed();
  nonIndexed.computeVertexNormals();
  geom.dispose();
  return nonIndexed;
}

/**
 * Builds a 100% pure, blank, surgical recessed dial faceplate (`X ∈ [-78.5, +78.5]`, `Y ∈ [-108.0, +108.0]`, `Z ∈ [-7.00, -4.60]`)
 * with zero pre-baked Sydney beach text, so Macro & Exploded views never show duplicate ghost letters!
 */
export function buildPureDialFaceplateGeometry(THREE, forSTL = false) {
  const w = forSTL ? 167.0 : 168.4;
  const h = forSTL ? 212.0 : 214.4;
  const geo = new THREE.BoxGeometry(w, h, 2.4, 1, 1, 1);
  geo.translate(0.0, 0.0, -5.80); // Front face sits strictly at Z = -4.60, back face at Z = -7.00
  return geo;
}

/**
 * Renders any string into an inline SVG string using the exact proportional FONT_STROKES clock typeface!
 */
export function renderGlyphSVG(text, { height = 14, strokeWidth = 2.0, tracking = 0.30, color = "currentColor" } = {}) {
  const clean = (text || "").toUpperCase();
  const charH = 10;
  const pad = strokeWidth * 1.2;
  const totalTextW = measureProportionalString(clean, charH, tracking);
  const totalW = Math.max(10, totalTextW + pad * 2);
  const totalH = charH + pad * 2;

  const paths = [];
  let cursor = pad;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const cw = charH * getCharWidthFactor(ch);
    const segs = FONT_STROKES[ch] || [];
    for (const [[u1, v1], [u2, v2]] of segs) {
      const uu1 = ch === "I" ? 0.5 : u1;
      const uu2 = ch === "I" ? 0.5 : u2;
      const px1 = (cursor + uu1 * cw).toFixed(2);
      const py1 = (pad + (1.0 - v1) * charH).toFixed(2);
      const px2 = (cursor + uu2 * cw).toFixed(2);
      const py2 = (pad + (1.0 - v2) * charH).toFixed(2);
      paths.push(`M${px1} ${py1}L${px2} ${py2}`);
    }
    cursor += cw + charH * tracking;
  }

  return `<svg class="glyph-svg" viewBox="0 0 ${totalW.toFixed(1)} ${totalH.toFixed(1)}" style="height:${height}px;width:auto;display:inline-block;vertical-align:middle;overflow:visible;" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="${paths.join("")}" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/**
 * Serializes one or more non-indexed or indexed THREE.BufferGeometry instances
 * into an industry-standard Binary .STL ArrayBuffer (ready for PrusaSlicer / Bambu Studio / Cura).
 * Shifts Z by +7.00mm so the back of the 2.40mm dial plate sits flat on the build plate at Z = 0.00mm,
 * the dial face sits at Z = 2.40mm, and the +0.60mm 3D raised typography sits at Z = 2.40..3.00mm!
 */
export function buildBinarySTLFromGeometries(geometries, headerLabel = "SC01_SURF_CLOCK_CUSTOM_DIAL", zShift = 7.0) {
  let totalTriangles = 0;
  const prepared = [];

  const tempNonIdx = [];
  for (const g of geometries) {
    if (!g) continue;
    const nonIdx = g.index ? g.toNonIndexed() : g;
    if (g.index) tempNonIdx.push(nonIdx);
    const pos = nonIdx.getAttribute("position");
    if (pos && pos.count >= 3) {
      totalTriangles += Math.floor(pos.count / 3);
      prepared.push(pos);
    }
  }

  const buffer = new ArrayBuffer(84 + totalTriangles * 50);
  const view = new DataView(buffer);

  // 80-byte ASCII header
  const cleanHeader = (headerLabel || "SC01_OPEN_SOURCE_STL").slice(0, 78);
  for (let i = 0; i < 80; i++) {
    view.setUint8(i, i < cleanHeader.length ? cleanHeader.charCodeAt(i) : 32);
  }
  view.setUint32(80, totalTriangles, true);

  let offset = 84;
  for (const pos of prepared) {
    const triCount = Math.floor(pos.count / 3);
    for (let t = 0; t < triCount; t++) {
      const i0 = t * 3;
      const i1 = i0 + 1;
      const i2 = i0 + 2;

      const ax = pos.getX(i0), ay = pos.getY(i0), az = pos.getZ(i0) + zShift;
      const bx = pos.getX(i1), by = pos.getY(i1), bz = pos.getZ(i1) + zShift;
      const cx = pos.getX(i2), cy = pos.getY(i2), cz = pos.getZ(i2) + zShift;

      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1.0;
      nx /= len; ny /= len; nz /= len;

      view.setFloat32(offset + 0, nx, true);
      view.setFloat32(offset + 4, ny, true);
      view.setFloat32(offset + 8, nz, true);

      view.setFloat32(offset + 12, ax, true);
      view.setFloat32(offset + 16, ay, true);
      view.setFloat32(offset + 20, az, true);

      view.setFloat32(offset + 24, bx, true);
      view.setFloat32(offset + 28, by, true);
      view.setFloat32(offset + 32, bz, true);

      view.setFloat32(offset + 36, cx, true);
      view.setFloat32(offset + 40, cy, true);
      view.setFloat32(offset + 44, cz, true);

      view.setUint16(offset + 48, 0, true);
      offset += 50;
    }
  }

  for (const ni of tempNonIdx) ni.dispose();
  return buffer;
}

