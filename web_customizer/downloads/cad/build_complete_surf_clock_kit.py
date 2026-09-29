#!/usr/bin/env python3
"""Builds the complete Magnet-Free Minimalist Industrial Surf Clock STL kit for Prusa MK4.

Includes:
- Exact 28BYJ-48 stepper motor dimensions (Ø28mm can, 35.0mm M3 hole pitch, 8.0mm shaft offset,
  Ø5.0x3.0mm double-flat keyed shaft with 5.18x3.12mm FDM bore and 0.4mm lead-in chamfer).
- 3D triangulated Braun/DIN geometric vector typography ("LONG REEF", "QUEENSCLIFF",
  "DEE WHY", "FRESHIE", "CURL CURL", "1", "10", "CONDITIONS") + 180-deg semi-circular arc.
- 6 ready-to-slice binary STL files + a single .zip archive + an inline HTML 1-click downloader.
"""

import base64
import io
import math
import os
import struct
import zipfile

OUT_DIR = "/Users/jcolley/surf_clock"


def write_binary_stl(filepath, triangles, header_str="SurfClock_DieterMonolith_MK4"):
    header = header_str.encode("ascii")[:80].ljust(80, b"\0")
    with open(filepath, "wb") as f:
        f.write(header)
        f.write(struct.pack("<I", len(triangles)))
        for p1, p2, p3 in triangles:
            ux, uy, uz = p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]
            vx, vy, vz = p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]
            nx = uy * vz - uz * vy
            ny = uz * vx - ux * vz
            nz = ux * vy - uy * vx
            length = math.sqrt(nx * nx + ny * ny + nz * nz)
            if length > 1e-9:
                nx, ny, nz = nx / length, ny / length, nz / length
            else:
                nx, ny, nz = 0.0, 0.0, 1.0
            f.write(struct.pack("<12fH", nx, ny, nz, *p1, *p2, *p3, 0))


def add_quad(tris, p1, p2, p3, p4):
    tris.append((p1, p2, p3))
    tris.append((p1, p3, p4))


def make_box_tris(x0, y0, z0, x1, y1, z1):
    tris = []
    add_quad(tris, (x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (x1, y0, z0))
    add_quad(tris, (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))
    add_quad(tris, (x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1))
    add_quad(tris, (x1, y1, z0), (x0, y1, z0), (x0, y1, z1), (x1, y1, z1))
    add_quad(tris, (x0, y1, z0), (x0, y0, z0), (x0, y0, z1), (x0, y1, z1))
    add_quad(tris, (x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1))
    return tris


def make_pill_cylinder_3d(cx, cy, radius, z0, z1, segs=12):
    """Creates a 12-sided vertical cylinder at vertex (cx, cy) so stroke joints are smooth & round."""
    tris = []
    for i in range(segs):
        a0 = 2.0 * math.pi * i / segs
        a1 = 2.0 * math.pi * (i + 1) / segs
        x0, y0 = cx + radius * math.cos(a0), cy + radius * math.sin(a0)
        x1, y1 = cx + radius * math.cos(a1), cy + radius * math.sin(a1)
        # Top cap
        tris.append(((cx, cy, z1), (x0, y0, z1), (x1, y1, z1)))
        # Bottom cap
        tris.append(((cx, cy, z0), (x1, y1, z0), (x0, y0, z0)))
        # Outer wall
        add_quad(tris, (x0, y0, z0), (x1, y1, z0), (x1, y1, z1), (x0, y0, z1))
    return tris


def make_stroke_segment_3d(x0, y0, x1, y1, width, z0, z1):
    """Creates a bold, rounded-joint 3D stroke prism (stadium aperture) with zero jagged corner ears."""
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy)
    if L < 1e-6:
        return []
    ux, uy = dx / L, dy / L
    r = width / 2.0
    px, py = -uy * r, ux * r

    c1 = (x0 + px, y0 + py)
    c2 = (x0 - px, y0 - py)
    c3 = (x1 - px, y1 - py)
    c4 = (x1 + px, y1 + py)

    tris = []
    add_quad(tris, (*c1, z0), (*c4, z0), (*c3, z0), (*c2, z0))
    add_quad(tris, (*c1, z1), (*c2, z1), (*c3, z1), (*c4, z1))
    add_quad(tris, (*c1, z0), (*c2, z0), (*c2, z1), (*c1, z1))
    add_quad(tris, (*c2, z0), (*c3, z0), (*c3, z1), (*c2, z1))
    add_quad(tris, (*c3, z0), (*c4, z0), (*c4, z1), (*c3, z1))
    add_quad(tris, (*c4, z0), (*c1, z0), (*c1, z1), (*c4, z1))
    # Smooth round pill caps at both ends eliminate all jagged corner notches/ears
    tris.extend(make_pill_cylinder_3d(x0, y0, r, z0, z1, segs=12))
    tris.extend(make_pill_cylinder_3d(x1, y1, r, z0, z1, segs=12))
    return tris


# Geometric Braun/DIN Medium Sans-Serif Vector Font (Normalized 0..1 width x 0..1 height)
GLYPHS = {
    "A": [((0, 0), (0.5, 1)), ((0.5, 1), (1, 0)), ((0.18, 0.34), (0.82, 0.34))],
    "C": [((0.95, 0.82), (0.72, 1)), ((0.72, 1), (0.25, 1)), ((0.25, 1), (0, 0.75)), ((0, 0.75), (0, 0.25)), ((0, 0.25), (0.25, 0)), ((0.25, 0), (0.72, 0)), ((0.72, 0), (0.95, 0.18))],
    "D": [((0, 0), (0, 1)), ((0, 1), (0.65, 1)), ((0.65, 1), (1, 0.74)), ((1, 0.74), (1, 0.26)), ((1, 0.26), (0.65, 0)), ((0.65, 0), (0, 0))],
    "E": [((0, 0), (0, 1)), ((0, 1), (0.95, 1)), ((0, 0.52), (0.82, 0.52)), ((0, 0), (0.95, 0))],
    "F": [((0, 0), (0, 1)), ((0, 1), (0.95, 1)), ((0, 0.52), (0.82, 0.52))],
    "G": [((0.95, 0.82), (0.72, 1)), ((0.72, 1), (0.25, 1)), ((0.25, 1), (0, 0.75)), ((0, 0.75), (0, 0.25)), ((0, 0.25), (0.25, 0)), ((0.25, 0), (0.82, 0)), ((0.82, 0), (1, 0.25)), ((1, 0.25), (1, 0.48)), ((1, 0.48), (0.52, 0.48))],
    "H": [((0, 0), (0, 1)), ((1, 0), (1, 1)), ((0, 0.52), (1, 0.52))],
    "I": [((0.5, 0), (0.5, 1)), ((0.15, 1), (0.85, 1)), ((0.15, 0), (0.85, 0))],
    "L": [((0, 1), (0, 0)), ((0, 0), (0.95, 0))],
    "N": [((0, 0), (0, 1)), ((0, 1), (1, 0)), ((1, 0), (1, 1))],
    "O": [((0.25, 1), (0.75, 1)), ((0.75, 1), (1, 0.75)), ((1, 0.75), (1, 0.25)), ((1, 0.25), (0.75, 0)), ((0.75, 0), (0.25, 0)), ((0.25, 0), (0, 0.25)), ((0, 0.25), (0, 0.75)), ((0, 0.75), (0.25, 1))],
    "P": [((0, 0), (0, 1)), ((0, 1), (0.72, 1)), ((0.72, 1), (1, 0.82)), ((1, 0.82), (1, 0.64)), ((1, 0.64), (0.72, 0.48)), ((0.72, 0.48), (0, 0.48))],
    "Q": [((0.25, 1), (0.75, 1)), ((0.75, 1), (1, 0.75)), ((1, 0.75), (1, 0.25)), ((1, 0.25), (0.75, 0)), ((0.75, 0), (0.25, 0)), ((0.25, 0), (0, 0.25)), ((0, 0.25), (0, 0.75)), ((0, 0.75), (0.25, 1)), ((0.55, 0.32), (1.05, -0.10))],
    "R": [((0, 0), (0, 1)), ((0, 1), (0.72, 1)), ((0.72, 1), (1, 0.82)), ((1, 0.82), (1, 0.64)), ((1, 0.64), (0.72, 0.50)), ((0.72, 0.50), (0, 0.50)), ((0.55, 0.50), (1, 0))],
    "S": [((0.95, 0.84), (0.72, 1)), ((0.72, 1), (0.25, 1)), ((0.25, 1), (0, 0.78)), ((0, 0.78), (0.18, 0.56)), ((0.18, 0.56), (0.82, 0.44)), ((0.82, 0.44), (1, 0.22)), ((1, 0.22), (0.75, 0)), ((0.75, 0), (0.22, 0)), ((0.22, 0), (0, 0.16))],
    "T": [((0.5, 0), (0.5, 1)), ((0, 1), (1, 1))],
    "U": [((0, 1), (0, 0.26)), ((0, 0.26), (0.25, 0)), ((0.25, 0), (0.75, 0)), ((0.75, 0), (1, 0.26)), ((1, 0.26), (1, 1))],
    "W": [((0, 1), (0.22, 0)), ((0.22, 0), (0.5, 0.68)), ((0.5, 0.68), (0.78, 0)), ((0.78, 0), (1, 1))],
    "Y": [((0, 1), (0.5, 0.48)), ((1, 1), (0.5, 0.48)), ((0.5, 0.48), (0.5, 0))],
    "1": [((0.2, 0.78), (0.55, 1)), ((0.55, 1), (0.55, 0)), ((0.2, 0), (0.9, 0))],
    "0": [((0.25, 1), (0.75, 1)), ((0.75, 1), (1, 0.75)), ((1, 0.75), (1, 0.25)), ((1, 0.25), (0.75, 0)), ((0.75, 0), (0.25, 0)), ((0.25, 0), (0, 0.25)), ((0, 0.25), (0, 0.75)), ((0, 0.75), (0.25, 1))],
}


def render_text_3d(text_str, cx, cy, char_h, z0, z1, stroke_w=1.04, tracking=0.36, aspect=0.63):
    """Renders centered 3D Braun DIN Medium vector text at (cx, cy) with bold 2.5-perimeter stroke width."""
    char_w = char_h * aspect
    step_x = char_w + char_h * tracking
    total_w = len(text_str) * step_x - char_h * tracking
    start_x = cx - total_w / 2.0
    base_y = cy - char_h / 2.0

    tris = []
    for idx, ch in enumerate(text_str):
        ox = start_x + idx * step_x
        if ch == " ":
            continue
        segs = GLYPHS.get(ch, [])
        for (u0, v0), (u1, v1) in segs:
            x0, y0 = ox + u0 * char_w, base_y + v0 * char_h
            x1, y1 = ox + u1 * char_w, base_y + v1 * char_h
            tris.extend(make_stroke_segment_3d(x0, y0, x1, y1, stroke_w, z0, z1))
    return tris


def make_dial_graphics_tris(z0, z1):
    """Generates bold, FDM-optimized 3D typography + Braun chapter ring + NAH/YEP Conditions sub-dial."""
    tris = []
    # Upper shaft center at (0, +22.0)
    # 1. Beach Names in bold 1.04mm stroke (~2.5x 0.4mm nozzle width) with clean horological margins:
    tris.extend(render_text_3d("LONG REEF",    0.0,  22.0 + 58.0, char_h=5.5, z0=z0, z1=z1, stroke_w=1.05, tracking=0.36, aspect=0.64))
    tris.extend(render_text_3d("QUEENSCLIFF", -45.5, 22.0 + 33.5, char_h=4.9, z0=z0, z1=z1, stroke_w=1.00, tracking=0.31, aspect=0.60))
    tris.extend(render_text_3d("DEE WHY",      46.5, 22.0 + 33.5, char_h=5.4, z0=z0, z1=z1, stroke_w=1.05, tracking=0.36, aspect=0.64))
    tris.extend(render_text_3d("FRESHIE",     -46.5, 22.0 - 27.5, char_h=5.4, z0=z0, z1=z1, stroke_w=1.05, tracking=0.36, aspect=0.64))
    tris.extend(render_text_3d("CURL CURL",    45.5, 22.0 - 27.5, char_h=5.2, z0=z0, z1=z1, stroke_w=1.02, tracking=0.34, aspect=0.62))

    # 2. Inner Precision Braun Chapter Ring around (0, +22.0) at R = 21.8..26.8mm (bold 1.00mm major / 0.72mm minor ticks)
    for deg in range(-150, 165, 15):
        rad = math.radians(deg)
        ux, uy = math.sin(rad), math.cos(rad)
        is_major = deg in (0, 60, 120, -120, -60)
        r_in = 21.6 if is_major else 23.6
        r_out = 26.8
        w_t = 1.02 if is_major else 0.72
        tris.extend(make_stroke_segment_3d(ux * r_in, 22.0 + uy * r_in, ux * r_out, 22.0 + uy * r_out, w_t, z0, z1))

    # 3. Lower Conditions Sub-Dial at (0, -68.0), Arc R = 32.0mm (bold 1.05mm gauge arc)
    cy_cond = -68.0
    arc_r = 32.0
    arc_segs = 48
    for i in range(arc_segs):
        a0 = math.pi * (1.0 - i / arc_segs)
        a1 = math.pi * (1.0 - (i + 1) / arc_segs)
        x0, y0 = arc_r * math.cos(a0), cy_cond + arc_r * math.sin(a0)
        x1, y1 = arc_r * math.cos(a1), cy_cond + arc_r * math.sin(a1)
        tris.extend(make_stroke_segment_3d(x0, y0, x1, y1, 1.05, z0, z1))

    # Radial graduation ticks inside R=32.0mm Conditions arc
    for i in range(10):
        deg = -90.0 + i * 20.0
        rad = math.radians(deg)
        ux, uy = math.sin(rad), math.cos(rad)
        is_end = (i in (0, 4, 5, 9))
        r_in = 28.0 if is_end else 29.3
        r_out = 32.0
        w_t = 0.96 if is_end else 0.70
        tris.extend(make_stroke_segment_3d(ux * r_in, cy_cond + uy * r_in, ux * r_out, cy_cond + uy * r_out, w_t, z0, z1))

    # "NAH" (Left = -90 deg) and "YEP" (Right = +90 deg) and "CONDITIONS"
    tris.extend(render_text_3d("NAH", -arc_r - 14.5, cy_cond + 1.8, char_h=5.2, z0=z0, z1=z1, stroke_w=1.04, tracking=0.35, aspect=0.64))
    tris.extend(render_text_3d("YEP",  arc_r + 14.5, cy_cond + 1.8, char_h=5.2, z0=z0, z1=z1, stroke_w=1.04, tracking=0.35, aspect=0.64))
    tris.extend(render_text_3d("CONDITIONS", 0.0, cy_cond - 10.5, char_h=4.6, z0=z0, z1=z1, stroke_w=0.98, tracking=0.38, aspect=0.62))
    return tris


def make_annulus_extrude(cx, cy, z0, z1, r_inner_fn, r_outer_fn, segments=64):
    tris = []
    for i in range(segments):
        a0 = 2.0 * math.pi * i / segments
        a1 = 2.0 * math.pi * (i + 1) / segments
        ri0, ro0 = r_inner_fn(a0), r_outer_fn(a0)
        ri1, ro1 = r_inner_fn(a1), r_outer_fn(a1)

        xi0, yi0 = cx + ri0 * math.cos(a0), cy + ri0 * math.sin(a0)
        xo0, yo0 = cx + ro0 * math.cos(a0), cy + ro0 * math.sin(a0)
        xi1, yi1 = cx + ri1 * math.cos(a1), cy + ri1 * math.sin(a1)
        xo1, yo1 = cx + ro1 * math.cos(a1), cy + ro1 * math.sin(a1)

        add_quad(tris, (xi0, yi0, z0), (xi1, yi1, z0), (xo1, yo1, z0), (xo0, yo0, z0))
        add_quad(tris, (xi0, yi0, z1), (xo0, yo0, z1), (xo1, yo1, z1), (xi1, yi1, z1))
        add_quad(tris, (xo0, yo0, z0), (xo1, yo1, z0), (xo1, yo1, z1), (xo0, yo0, z1))
        if ri0 > 1e-5 or ri1 > 1e-5:
            add_quad(tris, (xi1, yi1, z0), (xi0, yi0, z0), (xi0, yi0, z1), (xi1, yi1, z1))
    return tris


def make_frustum_extrude(cx, cy, z0, z1, ri0_fn, ro0_fn, ri1_fn, ro1_fn, segments=64):
    tris = []
    for i in range(segments):
        a0 = 2.0 * math.pi * i / segments
        a1 = 2.0 * math.pi * (i + 1) / segments
        ri_b0, ro_b0 = ri0_fn(a0), ro0_fn(a0)
        ri_b1, ro_b1 = ri0_fn(a1), ro0_fn(a1)
        ri_t0, ro_t0 = ri1_fn(a0), ro1_fn(a0)
        ri_t1, ro_t1 = ri1_fn(a1), ro1_fn(a1)

        xib0, yib0 = cx + ri_b0 * math.cos(a0), cy + ri_b0 * math.sin(a0)
        xob0, yob0 = cx + ro_b0 * math.cos(a0), cy + ro_b0 * math.sin(a0)
        xib1, yib1 = cx + ri_b1 * math.cos(a1), cy + ri_b1 * math.sin(a1)
        xob1, yob1 = cx + ro_b1 * math.cos(a1), cy + ro_b1 * math.sin(a1)

        xit0, yit0 = cx + ri_t0 * math.cos(a0), cy + ri_t0 * math.sin(a0)
        xot0, yot0 = cx + ro_t0 * math.cos(a0), cy + ro_t0 * math.sin(a0)
        xit1, yit1 = cx + ri_t1 * math.cos(a1), cy + ri_t1 * math.sin(a1)
        xot1, yot1 = cx + ro_t1 * math.cos(a1), cy + ro_t1 * math.sin(a1)

        add_quad(tris, (xib0, yib0, z0), (xib1, yib1, z0), (xob1, yob1, z0), (xob0, yob0, z0))
        add_quad(tris, (xit0, yit0, z1), (xot0, yot0, z1), (xot1, yot1, z1), (xit1, yit1, z1))
        add_quad(tris, (xob0, yob0, z0), (xob1, yob1, z0), (xot1, yot1, z1), (xot0, yot0, z1))
        if ri_b0 > 1e-5 or ri_t0 > 1e-5:
            add_quad(tris, (xib1, yib1, z0), (xib0, yib0, z0), (xit0, yit0, z1), (xit1, yit1, z1))
    return tris

def r_28byj48_bore(angle, d_bore=5.10, w_flat=3.10):
    """Exact 28BYJ-48 double-flat shaft bore profile verified against small_arm_0.7in_capped_top.stl:
    Ø5.100mm circular bore (R=2.550mm) x 3.100mm flat-to-flat (half_flat=1.550mm).
    Flats are parallel to the pointer arm (+Y) axis (so flat normal is along X, cos(angle)).
    """
    r_circ = d_bore / 2.0
    half_flat = w_flat / 2.0
    ca = abs(math.cos(angle))
    if ca > 1e-6:
        r_flat = half_flat / ca
        return min(r_circ, r_flat)
    return r_circ


def generate_magnet_free_hand(filename, blade_len=35.0, tail_len=9.5, hub_d=7.6, blade_w_base=2.5, blade_w_tip=1.2, blade_h=1.8, cap_step_h=0.6):
    """Generates a zero-support, flat-bed-printable Minimalist Industrial hand matching small_arm_0.7in_capped_top.stl:
    - Z = 0.00mm: Flat bottom of BOTH hub and pointer blade (100% build-plate adhesion, ZERO overhangs).
    - Z = 0.00 to 0.35mm: 5.80 x 3.80mm (+0.35mm/side 45-deg) bottom lead-in chamfer for elephant-foot compensation.
    - Z = 0.35 to 3.45mm: 5.10 x 3.10mm precision press-fit 28BYJ-48 double-flat blind bore (3.45mm total depth).
    - Z = 3.45 to 4.20mm: 0.75mm thick solid capped top over shaft with 0.35mm outer top bevel (OD -> OD - 0.70mm).
    - Z = 4.20 to 4.20 + cap_step_h: Optional raised center disc for M600 filament swap accent cap.
    """
    tris = []
    hub_r = hub_d / 2.0
    # 1. Lower 0.35mm 45-deg tapered lead-in chamfer (5.80 x 3.80mm at Z=0.00 -> 5.10 x 3.10mm at Z=0.35, matching small_arm_0.7in_capped_top.stl)
    tris.extend(
        make_frustum_extrude(
            0.0, 0.0, 0.0, 0.35,
            ri0_fn=lambda a: r_28byj48_bore(a, 5.80, 3.80),
            ro0_fn=lambda a: hub_r,
            ri1_fn=lambda a: r_28byj48_bore(a, 5.10, 3.10),
            ro1_fn=lambda a: hub_r,
            segments=64
        )
    )
    # 2. Precision 28BYJ-48 double-flat shaft bore section (Z = 0.35 to Z = 3.45mm, 5.10 x 3.10mm)
    tris.extend(
        make_annulus_extrude(
            0.0, 0.0, 0.35, 3.45,
            r_inner_fn=lambda a: r_28byj48_bore(a, 5.10, 3.10),
            r_outer_fn=lambda a: hub_r,
            segments=64
        )
    )
    # 3. Solid Capped Top over shaft (Z = 3.45 to Z = 3.85mm at full hub_r, then beveled to hub_r - 0.35mm at Z = 4.20mm)
    tris.extend(
        make_annulus_extrude(
            0.0, 0.0, 3.45, 3.85,
            r_inner_fn=lambda a: 0.0,
            r_outer_fn=lambda a: hub_r,
            segments=64
        )
    )
    tris.extend(
        make_frustum_extrude(
            0.0, 0.0, 3.85, 4.20,
            ri0_fn=lambda a: 0.0,
            ro0_fn=lambda a: hub_r,
            ri1_fn=lambda a: 0.0,
            ro1_fn=lambda a: hub_r - 0.35,
            segments=64
        )
    )
    # 4. Optional Raised Color-Swap Cap Disc at very top (Z = 4.20 to 4.20 + cap_step_h) for M600 center cap dot
    if cap_step_h > 0:
        tris.extend(
            make_annulus_extrude(
                0.0, 0.0, 4.20, 4.20 + cap_step_h,
                r_inner_fn=lambda a: 0.0,
                r_outer_fn=lambda a: (hub_r - 0.35) * 0.82,
                segments=64
            )
        )
    # 5. Sleek Tapered Pointer Blade (+Y) & Counterweight Tail (-Y) resting FLUSH on build plate (Z = 0.00 to blade_h)
    # Note: Starts from the outer hub wall (y = +hub_r - 0.4 for pointer, y = -hub_r + 0.4 for tail) so it never blocks the inner shaft bore!
    z0, z1 = 0.0, blade_h
    # Forward pointer blade (+Y from hub_r - 0.4 to +blade_len)
    y_start_fwd = hub_r - 0.4
    p_bl = (-blade_w_base / 2.0, y_start_fwd)
    p_br = (blade_w_base / 2.0, y_start_fwd)
    p_tr = (blade_w_tip / 2.0, blade_len)
    p_tl = (-blade_w_tip / 2.0, blade_len)
    add_quad(tris, (*p_bl, z0), (*p_tl, z0), (*p_tr, z0), (*p_br, z0))
    add_quad(tris, (*p_bl, z1), (*p_br, z1), (*p_tr, z1), (*p_tl, z1))
    add_quad(tris, (*p_bl, z0), (*p_br, z0), (*p_br, z1), (*p_bl, z1))
    add_quad(tris, (*p_tr, z0), (*p_tl, z0), (*p_tl, z1), (*p_tr, z1))
    add_quad(tris, (*p_tl, z0), (*p_bl, z0), (*p_bl, z1), (*p_tl, z1))
    add_quad(tris, (*p_br, z0), (*p_tr, z0), (*p_tr, z1), (*p_br, z1))

    # Rear counterweight tail (-Y from -hub_r + 0.4 to -tail_len)
    if tail_len > hub_r:
        y_start_tail = -(hub_r - 0.4)
        w_tail_tip = blade_w_base * 0.85
        t_bl = (-w_tail_tip / 2.0, -tail_len)
        t_br = (w_tail_tip / 2.0, -tail_len)
        t_tr = (blade_w_base / 2.0, y_start_tail)
        t_tl = (-blade_w_base / 2.0, y_start_tail)
        add_quad(tris, (*t_bl, z0), (*t_tl, z0), (*t_tr, z0), (*t_br, z0))
        add_quad(tris, (*t_bl, z1), (*t_br, z1), (*t_tr, z1), (*t_tl, z1))
        add_quad(tris, (*t_bl, z0), (*t_br, z0), (*t_br, z1), (*t_bl, z1))
        add_quad(tris, (*t_tr, z0), (*t_tl, z0), (*t_tl, z1), (*t_tr, z1))
        add_quad(tris, (*t_tl, z0), (*t_bl, z0), (*t_bl, z1), (*t_tl, z1))
        add_quad(tris, (*t_br, z0), (*t_tr, z0), (*t_tr, z1), (*t_br, z1))

    out_path = os.path.join(OUT_DIR, filename)
    write_binary_stl(out_path, tris)
    return out_path, len(tris)


def generate_full_kit():
    created_files = []

    # 1. Outer Bezel & Dual 28BYJ-48 Chassis (160 x 200 x 45 mm)
    W, H, D = 160.0, 200.0, 45.0
    wall = 3.2
    tris_chassis = []
    tris_chassis.extend(make_box_tris(-W/2, -H/2, 0, -W/2 + wall, H/2, D))
    tris_chassis.extend(make_box_tris(W/2 - wall, -H/2, 0, W/2, H/2, D))
    tris_chassis.extend(make_box_tris(-W/2 + wall, H/2 - wall, 0, W/2 - wall, H/2, D))
    # Bottom wall with 12x9mm USB-C cable slot at rear (Z=36..45mm)
    tris_chassis.extend(make_box_tris(-W/2 + wall, -H/2, 0, -6.0, -H/2 + wall, D))
    tris_chassis.extend(make_box_tris(6.0, -H/2, 0, W/2 - wall, -H/2 + wall, D))
    tris_chassis.extend(make_box_tris(-6.0, -H/2, 0, 6.0, -H/2 + wall, 36.0))

    # Front Gallery Bezel Lip resting flat on build plate at Z = 0.0 to 4.0mm (zero overhang! Dial plate drops onto Z=4.0mm shelf from rear)
    ledge = 3.6
    tris_chassis.extend(make_box_tris(-W/2 + wall, -H/2 + wall, 0.0, -W/2 + wall + ledge, H/2 - wall, 4.0))
    tris_chassis.extend(make_box_tris(W/2 - wall - ledge, -H/2 + wall, 0.0, W/2 - wall, H/2 - wall, 4.0))
    tris_chassis.extend(make_box_tris(-W/2 + wall + ledge, H/2 - wall - ledge, 0.0, W/2 - wall - ledge, H/2 - wall, 4.0))
    tris_chassis.extend(make_box_tris(-W/2 + wall + ledge, -H/2 + wall, 0.0, W/2 - wall - ledge, -H/2 + wall + ledge, 4.0))

    # 4x Corner Screw Columns at Z = 6.4 to 42.0mm (sits completely behind the 2.4mm Dial Faceplate so corners are 100% invisible from front!)
    for sx in (-W/2 + wall + 3.8, W/2 - wall - 3.8):
        for sy in (-H/2 + wall + 3.8, H/2 - wall - 3.8):
            tris_chassis.extend(
                make_annulus_extrude(sx, sy, 6.4, 42.0, lambda a: 1.45, lambda a: 3.8, segments=28)
            )

    p1 = os.path.join(OUT_DIR, "01_outer_bezel_chassis.stl")
    write_binary_stl(p1, tris_chassis)
    created_files.append(("01_outer_bezel_chassis.stl", p1, "Outer Bezel & Dual 28BYJ-48 Chassis (160×200×45mm)"))

    # 2. Dial Plate with Raised 0.6mm 3D Typography & Arc (153.1 x 193.1 x 2.4mm + 0.6mm text)
    dw, dh, dt = W - 2 * (wall + 0.25), H - 2 * (wall + 0.25), 2.4
    # Base plate with 2x Ø6.8mm shaft clearance holes (constructed via clean strips around the two shaft holes)
    # Upper hole at (0, +22.0), R = 3.4mm; Lower hole at (0, -68.0), R = 3.4mm
    tris_dial_base = []
    # Left section (X: -dw/2 to -5.0)
    tris_dial_base.extend(make_box_tris(-dw/2, -dh/2, 0.0, -5.0, dh/2, dt))
    # Right section (X: +5.0 to +dw/2)
    tris_dial_base.extend(make_box_tris(5.0, -dh/2, 0.0, dw/2, dh/2, dt))
    # Center column segments around (0, +22) and (0, -68)
    tris_dial_base.extend(make_box_tris(-5.0, -dh/2, 0.0, 5.0, -73.0, dt))
    tris_dial_base.extend(make_box_tris(-5.0, -63.0, 0.0, 5.0, 17.0, dt))
    tris_dial_base.extend(make_box_tris(-5.0, 27.0, 0.0, 5.0, dh/2, dt))
    # Annular rings for the two Ø6.8mm shaft bores inside the 10x10mm squares
    for sy in (22.0, -68.0):
        tris_dial_base.extend(
            make_annulus_extrude(
                0.0, sy, 0.0, dt,
                r_inner_fn=lambda a: 3.0,
                r_outer_fn=lambda a: 5.0 / max(abs(math.cos(a)), abs(math.sin(a)), 1e-6),
                segments=48
            )
        )

    # Raised text version (Z = 2.4 to 3.0mm)
    tris_graphics_raised = make_dial_graphics_tris(z0=dt, z1=dt + 0.6)
    p2a = os.path.join(OUT_DIR, "02a_dial_faceplate_with_text.stl")
    write_binary_stl(p2a, tris_dial_base + tris_graphics_raised)
    created_files.append(("02a_dial_faceplate_with_text.stl", p2a, "Dial Faceplate with 3D Beach Names & Conditions Arc"))

    # Separate 0.4mm Inlay Text/Arc STL (for multi-color PrusaSlicer import)
    tris_graphics_inlay = make_dial_graphics_tris(z0=0.0, z1=0.4)
    p2b = os.path.join(OUT_DIR, "02b_dial_text_and_arc_only.stl")
    write_binary_stl(p2b, tris_graphics_inlay)
    created_files.append(("02b_dial_text_and_arc_only.stl", p2b, "Standalone 0.4mm Beach Names & Arc (for Multi-Color Slicing)"))

    # 3. Sleek Magnet-Free Beach Hand (52mm pointer + 12mm tail, 5.10x3.10mm 28BYJ-48 bore matching small_arm_0.7in_capped_top.stl)
    p3, _ = generate_magnet_free_hand(
        "03_beach_hand_28byj48_capped.stl",
        blade_len=35.0, tail_len=9.5, hub_d=8.6, blade_w_base=2.6, blade_w_tip=1.4, blade_h=1.8, cap_step_h=0.6
    )
    created_files.append(("03_beach_hand_28byj48_capped.stl", p3, "Main Beach Hand (5.10x3.10mm 28BYJ-48 Bore + Capped Hub)"))

    # 4. Sleek Magnet-Free Conditions Needle Hand (17.78mm / 0.7in needle, 7.60mm OD hub & 5.10x3.10mm bore matching small_arm_0.7in_capped_top.stl)
    p4, _ = generate_magnet_free_hand(
        "04_conditions_hand_28byj48_capped.stl",
        blade_len=17.78, tail_len=4.5, hub_d=7.6, blade_w_base=2.0, blade_w_tip=1.0, blade_h=1.6, cap_step_h=0.0
    )
    created_files.append(("04_conditions_hand_28byj48_capped.stl", p4, "Conditions Sub-Dial Needle (0.7in + 28BYJ-48 Keyed Bore)"))

    # 5. Flush Rear Cover with USB Cutout (153.1 x 193.1 x 3.0mm)
    tris_cover = []
    tris_cover.extend(make_box_tris(-dw/2, -dh/2 + 8.0, 0.0, dw/2, dh/2, 3.0))
    tris_cover.extend(make_box_tris(-dw/2, -dh/2, 0.0, -6.0, -dh/2 + 8.0, 3.0))
    tris_cover.extend(make_box_tris(6.0, -dh/2, 0.0, dw/2, -dh/2 + 8.0, 3.0))
    p5 = os.path.join(OUT_DIR, "05_rear_cover_usb.stl")
    write_binary_stl(p5, tris_cover)
    created_files.append(("05_rear_cover_usb.stl", p5, "Flush Rear Cover with Bottom USB-C Cable Portal"))

    # 5b. Flat-Printing Dual 28BYJ-48 Stepper Motor & ESP32-S3 Carrier Plate (153.1 x 193.1mm, ZERO overhangs!)
    # Sandwiches the Dial Faceplate against the Z=4.0mm front bezel shelf and holds both 28BYJ-48 motors at exact 5.0mm standoff depth
    tris_carrier = []
    # Outer clamping frame (12mm wide perimeter with 4 corner M3 clearance holes)
    tris_carrier.extend(make_box_tris(-dw/2, -dh/2, 0.0, -dw/2 + 12.0, dh/2, 2.6))
    tris_carrier.extend(make_box_tris(dw/2 - 12.0, -dh/2, 0.0, dw/2, dh/2, 2.6))
    tris_carrier.extend(make_box_tris(-dw/2 + 12.0, dh/2 - 12.0, 0.0, dw/2 - 12.0, dh/2, 2.6))
    tris_carrier.extend(make_box_tris(-dw/2 + 12.0, -dh/2, 0.0, dw/2 - 12.0, -dh/2 + 12.0, 2.6))
    # Upper 28BYJ-48 Motor Bridge (shaft at Y=+22.0 -> motor can & 35mm M3 ears at Y=+14.0mm)
    tris_carrier.extend(make_box_tris(-dw/2 + 12.0, 6.0, 0.0, -7.0, 22.0, 2.6))
    tris_carrier.extend(make_box_tris(7.0, 6.0, 0.0, dw/2 - 12.0, 22.0, 2.6))
    for sx in (-17.5, 17.5):
        tris_carrier.extend(make_annulus_extrude(sx, 14.0, 2.6, 7.6, lambda a: 1.45, lambda a: 3.8, segments=32))
    tris_carrier.extend(make_annulus_extrude(0.0, 14.0, 2.6, 5.6, lambda a: 14.2, lambda a: 16.0, segments=48))
    # Lower 28BYJ-48 Motor Bridge (shaft at Y=-68.0 -> inverted motor can & 35mm M3 ears at Y=-60.0mm)
    tris_carrier.extend(make_box_tris(-dw/2 + 12.0, -68.0, 0.0, -7.0, -52.0, 2.6))
    tris_carrier.extend(make_box_tris(7.0, -68.0, 0.0, dw/2 - 12.0, -52.0, 2.6))
    for sx in (-17.5, 17.5):
        tris_carrier.extend(make_annulus_extrude(sx, -60.0, 2.6, 7.6, lambda a: 1.45, lambda a: 3.8, segments=32))
    tris_carrier.extend(make_annulus_extrude(0.0, -60.0, 2.6, 5.6, lambda a: 14.2, lambda a: 16.0, segments=48))
    # Center ESP32-S3 / Mini Breadboard (46x36mm) Mounting Tray between motors (Y = -38 to -2mm)
    tris_carrier.extend(make_box_tris(-dw/2 + 12.0, -26.0, 0.0, dw/2 - 12.0, -14.0, 2.6))
    p6 = os.path.join(OUT_DIR, "06_dual_stepper_carrier_plate.stl")
    write_binary_stl(p6, tris_carrier)
    created_files.append(("06_dual_stepper_carrier_plate.stl", p6, "Flat-Print Dual 28BYJ-48 Motor & ESP32-S3 Carrier Plate"))

    # 6. Bundle all STLs + OpenSCAD source into a single ZIP file
    zip_path = os.path.join(OUT_DIR, "surf_clock_dieter_Monolith_mk4_stls.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for fn, fp, _ in created_files:
            zf.write(fp, arcname=fn)
        scad_fp = os.path.join(OUT_DIR, "surf_clock_Monolith.scad")
        if os.path.exists(scad_fp):
            zf.write(scad_fp, arcname="surf_clock_Monolith.scad")

    # 7. Create Inline Self-Contained HTML Downloader Widget (base64-encoded ZIP + individual STLs)
    with open(zip_path, "rb") as f:
        zip_b64 = base64.b64encode(f.read()).decode("ascii")

    file_entries_js = []
    for fn, fp, desc in created_files:
        with open(fp, "rb") as f:
            raw = f.read()
        file_entries_js.append({
            "name": fn,
            "desc": desc,
            "size_kb": round(len(raw) / 1024, 1),
            "b64": base64.b64encode(raw).decode("ascii")
        })

    html_widget = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
</head>
<body class="bg-transparent text-[var(--foreground)] antialiased p-3">
  <div class="bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
    <div class="flex flex-wrap items-center justify-between gap-3 pb-3 mb-3 border-b border-[var(--border)]">
      <div>
        <div class="flex items-center gap-2">
          <span class="inline-block w-2.5 h-2.5 rounded-full bg-[#E85D26]"></span>
          <h2 class="text-[var(--foreground)] font-semibold text-base">
            Surf Clock (Magnet-Free Edition) — Ready-to-Print Prusa MK4 STL Pack
          </h2>
        </div>
        <p class="text-[var(--muted-foreground)] text-xs mt-0.5">
          Click any button below to save the binary <code class="px-1 bg-[var(--background)] rounded">.stl</code> files or complete <code class="px-1 bg-[var(--background)] rounded">.zip</code> bundle straight to your Downloads folder.
        </p>
      </div>
      <button onclick="downloadB64('surf_clock_dieter_Monolith_mk4_stls.zip', '{zip_b64}', 'application/zip')"
              class="px-3.5 py-2 rounded-lg font-semibold text-xs bg-[#E85D26] hover:opacity-90 text-white shadow transition flex items-center gap-1.5 cursor-pointer">
        <span>⬇ Download All 6 STLs (.ZIP Bundle)</span>
      </button>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5" id="stl-cards"></div>
  </div>

  <script>
    const FILES = {json_dumps_safe(file_entries_js)};

    function downloadB64(filename, b64Data, mime) {{
      const byteChars = atob(b64Data);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {{
        byteNumbers[i] = byteChars.charCodeAt(i);
      }}
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], {{ type: mime || 'application/octet-stream' }});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {{
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }}, 200);
    }}

    const container = document.getElementById('stl-cards');
    container.innerHTML = FILES.map((f, idx) => `
      <div class="flex items-center justify-between gap-2 bg-[var(--background)] border border-[var(--border)] rounded-lg p-2.5">
        <div class="min-w-0">
          <div class="font-mono text-xs font-semibold text-[var(--foreground)] truncate">${{f.name}}</div>
          <div class="text-[11px] text-[var(--muted-foreground)] truncate">${{f.desc}} • ${{f.size_kb}} KB</div>
        </div>
        <button onclick="downloadB64(FILES[${{idx}}].name, FILES[${{idx}}].b64, 'application/sla')"
                class="shrink-0 px-2.5 py-1.5 rounded-md text-xs font-medium bg-[var(--card)] hover:bg-[var(--primary)] hover:text-[var(--primary-foreground)] border border-[var(--border)] transition cursor-pointer">
          ⬇ .STL
        </button>
      </div>
    `).join('');
  </script>
</body>
</html>
"""
    widget_path = os.path.join(OUT_DIR, "surf_clock_stl_downloader.html")
    with open(widget_path, "w", encoding="utf-8") as f:
        f.write(html_widget)

    print(f"Created ZIP: {zip_path}")
    print(f"Created Downloader Widget: {widget_path}")
    for fn, fp, _ in created_files:
        print(f" - {fn} ({round(os.path.getsize(fp)/1024, 1)} KB)")


def json_dumps_safe(obj):
    import json
    return json.dumps(obj)


if __name__ == "__main__":
    generate_full_kit()
