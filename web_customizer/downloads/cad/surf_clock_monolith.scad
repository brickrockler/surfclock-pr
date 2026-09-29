// ============================================================================
// SURF CLOCK — Minimalist Gallery Monolith EDITION (PRUSA MK4 PARAMETRIC CAD)
// ============================================================================
// Designed for Original Prusa MK4 (Build volume: 250 x 210 x 220 mm)
// Architecture:
//   1. Outer Bezel & Unibody Chassis (160 x 200 x 45 mm) - prints face-down
//   2. Flush Dial Faceplate (153.4 x 193.4 x 2.4 mm) + First-Layer Inlay Text
//   3. Main Beach Pointer Hand (with 28BYJ-48 double-flat hub & 2x2mm magnet hole)
//   4. Conditions Sub-Dial Needle Hand (0.7in / 28mm with 2x2mm magnet hole)
//   5. Flush Rear Snap/Screw Cover with Braun Louvers & USB Cable Portal
// ============================================================================

$fn = 64;

// --- Toggle Part to Render / Export ---
// "assembly" | "chassis" | "dial_plate" | "dial_inlay_text" | "beach_hand" | "conditions_hand" | "rear_cover"
RENDER_PART = "assembly";

// --- Master Enclosure Dimensions (mm) ---
BOX_W = 160.0;          // Fits Prusa MK4 250mm X-axis
BOX_H = 200.0;          // Fits Prusa MK4 210mm Y-axis
BOX_D = 45.0;           // Stable freestanding desk depth
BEZEL_WALL = 3.2;       // Crisp Minimalist Industrial perimeter bezel thickness (8 perimeters @ 0.4mm)
BEZEL_REVEAL_D = 4.0;   // Depth of recessed dial face from front bezel rim
CORNER_R = 2.0;         // Subtle outer architectural fillet
CLEARANCE = 0.25;       // Mating clearance per side

// --- Dial Plate Dimensions ---
DIAL_W = BOX_W - 2 * (BEZEL_WALL + CLEARANCE);
DIAL_H = BOX_H - 2 * (BEZEL_WALL + CLEARANCE);
DIAL_T = 2.4;           // 12 layers @ 0.2mm
INLAY_DEPTH = 0.4;      // 2 layers @ 0.2mm for face-down virtual MMU / M600 color swap

// --- Dual 28BYJ-48 Stepper Positions (Relative to Center of Clock) ---
// Upper Dial: Beach Selector
UPPER_SHAFT_X = 0.0;
UPPER_SHAFT_Y = 22.0;
// Lower Sub-Dial: Conditions (1-10)
LOWER_SHAFT_X = 0.0;
LOWER_SHAFT_Y = -68.0;
COND_ARC_R = 32.0;

// --- 28BYJ-48 Stepper Motor Standard Specs ---
MOTOR_CAN_D = 28.4;         // 28mm body + 0.4mm clearance
MOTOR_SHAFT_OFFSET = 8.0;   // Distance from motor can center to output shaft axis
MOTOR_EAR_SPAN = 35.0;      // Mounting hole center-to-center pitch
MOTOR_BOSS_D = 7.5;         // M3 mounting boss outer diameter
MOTOR_HOLE_D = 2.8;         // M3 self-tapping / heat-set pilot bore
SHAFT_CLEAR_HOLE_D = 10.0;  // Pass-through clearance for 9mm shaft collar

// --- 28BYJ-48 Output Shaft Hub (Matches small_arm_0.7in_capped_top.stl fit) ---
SHAFT_BORE_D = 5.15;        // 5.0mm shaft + 0.15mm FDM clearance
SHAFT_FLAT_W = 3.15;        // 3.0mm across double-flats + 0.15mm clearance
SHAFT_ENGAGE_H = 5.0;       // Engagement depth on shaft

// --- 2x2mm Zeroing Magnet & Hall Sensor Specs ---
MAG_D = 2.2;                // 2.0mm magnet + 0.2mm press/glue pocket
MAG_DEPTH = 2.1;            // Flush/slightly recessed 2.0mm magnet height
MAG_RADIUS = 10.0;          // Radial distance from shaft center to magnet & Hall sensor
HALL_POCKET_W = 5.0;        // A3144 / SS49E Hall sensor body width
HALL_POCKET_H = 5.0;
HALL_WALL_REMAIN = 0.8;     // Thin membrane behind dial face for crisp magnetic trigger

// ============================================================================
// HELPER MODULES
// ============================================================================

module rounded_rect_extrude(w, h, d, r) {
    linear_extrude(height = d)
        offset(r = r)
            square([w - 2*r, h - 2*r], center = true);
}

// 28BYJ-48 Double-Flat Keyed Shaft Bore (Negative Cutter)
module shaft_28byj48_bore(depth = 5.0) {
    intersection() {
        cylinder(d = SHAFT_BORE_D, h = depth + 0.2);
        translate([0, 0, (depth + 0.2)/2])
            cube([SHAFT_FLAT_W, SHAFT_BORE_D + 2, depth + 0.2], center = true);
    }
    // Bottom 0.4mm elephant-foot lead-in chamfer
    translate([0, 0, -0.05])
        cylinder(d1 = SHAFT_BORE_D + 0.8, d2 = SHAFT_BORE_D, h = 0.5);
}

// 28BYJ-48 Internal Motor Cradle & Bosses (Centered at SHAFT XY)
// Note: Motor rotated so shaft is at (0,0) and can body center is at (0, -8.0)
module motor_mount_bosses(boss_h = 12.0) {
    translate([0, -MOTOR_SHAFT_OFFSET, 0]) {
        for (sx = [-1, 1]) {
            translate([sx * (MOTOR_EAR_SPAN / 2), 0, 0]) {
                difference() {
                    cylinder(d = MOTOR_BOSS_D, h = boss_h);
                    translate([0, 0, -0.1])
                        cylinder(d = MOTOR_HOLE_D, h = boss_h + 0.2);
                }
            }
        }
        // Thin alignment ring around 28mm can
        difference() {
            cylinder(d = MOTOR_CAN_D + 3.2, h = 3.0);
            translate([0, 0, -0.1])
                cylinder(d = MOTOR_CAN_D, h = 3.2);
            // Cutout for blue wire block at bottom
            translate([-9, -MOTOR_CAN_D/2 - 4, -0.1])
                cube([18, 8, 3.5]);
        }
    }
}

// ============================================================================
// 1. OUTER BEZEL & UNIBODY CHASSIS (Prints Face-Down on Build Plate)
// ============================================================================
module outer_bezel_chassis() {
    inner_w = BOX_W - 2 * BEZEL_WALL;
    inner_h = BOX_H - 2 * BEZEL_WALL;
    ledge_w = inner_w - 4.0;
    ledge_h = inner_h - 4.0;
    
    difference() {
        union() {
            // Outer shell
            difference() {
                rounded_rect_extrude(BOX_W, BOX_H, BOX_D, CORNER_R);
                
                // Front recessed dial pocket (from Z=0 to Z=BEZEL_REVEAL_D + DIAL_T)
                translate([0, 0, -0.1])
                    rounded_rect_extrude(inner_w, inner_h, BEZEL_REVEAL_D + DIAL_T + 0.1, 0.8);
                
                // Main internal structural step (dial rests against Z = BEZEL_REVEAL_D + DIAL_T)
                translate([0, 0, BEZEL_REVEAL_D + DIAL_T + 3.0])
                    rounded_rect_extrude(inner_w, inner_h, BOX_D, 1.0);
                
                // Through-opening in the support web (leaves a 2mm perimeter ledge + motor bridges)
                translate([0, 0, BEZEL_REVEAL_D])
                    difference() {
                        rounded_rect_extrude(ledge_w, ledge_h, 6.0, 1.0);
                        // Keep horizontal mounting bridge bars for Upper & Lower Steppers
                        translate([0, UPPER_SHAFT_Y - MOTOR_SHAFT_OFFSET, 3.0])
                            cube([inner_w + 2, 16.0, 6.2], center = true);
                        translate([0, LOWER_SHAFT_Y - MOTOR_SHAFT_OFFSET, 3.0])
                            cube([inner_w + 2, 16.0, 6.2], center = true);
                    }
            }
            
            // Stepper Motor Mounting Bosses on the back of the internal bridge bars
            translate([UPPER_SHAFT_X, UPPER_SHAFT_Y, BEZEL_REVEAL_D + DIAL_T + 3.0])
                motor_mount_bosses(boss_h = 8.0);
            translate([LOWER_SHAFT_X, LOWER_SHAFT_Y, BEZEL_REVEAL_D + DIAL_T + 3.0])
                motor_mount_bosses(boss_h = 8.0);
                
            // 4x Corner Screw Bosses for Rear Cover (at Z = BOX_D - 3.0)
            for (sx = [-1, 1], sy = [-1, 1]) {
                translate([sx * (inner_w/2 - 5), sy * (inner_h/2 - 5), BEZEL_REVEAL_D + DIAL_T + 3.0]) {
                    difference() {
                        cylinder(d = 8.0, h = BOX_D - (BEZEL_REVEAL_D + DIAL_T + 3.0) - 2.5);
                        translate([0, 0, 10])
                            cylinder(d = MOTOR_HOLE_D, h = BOX_D);
                    }
                }
            }
        }
        
        // Shaft clearance holes + Hall sensor slots through bridge bars
        for (sy = [UPPER_SHAFT_Y, LOWER_SHAFT_Y]) {
            translate([0, sy, -1])
                cylinder(d = SHAFT_CLEAR_HOLE_D, h = 20);
            // Hall sensor pocket at 12 o'clock (R = 10mm above shaft)
            translate([-HALL_POCKET_W/2, sy + MAG_RADIUS - HALL_POCKET_H/2, BEZEL_REVEAL_D + DIAL_T - 0.1])
                cube([HALL_POCKET_W, HALL_POCKET_H, 10.0]);
        }
        
        // USB-C Cable Egress Notch at Bottom Rear Wall
        translate([0, -BOX_H/2, BOX_D - 8.0]) {
            rotate([90, 0, 0])
                hull() {
                    cylinder(d = 6.5, h = 10, center = true);
                    translate([0, 8, 0])
                        cylinder(d = 6.5, h = 10, center = true);
                }
        }
    }
}

// ============================================================================
// 2. DIAL FACEPLATE & GRAPHICS INLAY (Prints Face-Down on Satin PEI)
// ============================================================================
module dial_graphics_2d() {
    // 1. Beach Names (Positioned at 0, +60, +120, -120, -60 deg around Upper Shaft)
    translate([UPPER_SHAFT_X, UPPER_SHAFT_Y + 60])
        text("LONG REEF", size = 4.2, font = "Liberation Sans:style=Bold", halign = "center", valign = "center");
    translate([UPPER_SHAFT_X - 46, UPPER_SHAFT_Y + 32])
        text("QUEENSCLIFF", size = 4.0, font = "Liberation Sans:style=Bold", halign = "center", valign = "center");
    translate([UPPER_SHAFT_X + 48, UPPER_SHAFT_Y + 32])
        text("DEE WHY", size = 4.2, font = "Liberation Sans:style=Bold", halign = "center", valign = "center");
    translate([UPPER_SHAFT_X - 48, UPPER_SHAFT_Y - 22])
        text("FRESHIE", size = 4.2, font = "Liberation Sans:style=Bold", halign = "center", valign = "center");
    translate([UPPER_SHAFT_X + 48, UPPER_SHAFT_Y - 22])
        text("CURL CURL", size = 4.2, font = "Liberation Sans:style=Bold", halign = "center", valign = "center");

    // 2. Conditions Sub-Dial Semi-Circular Arc (180 deg)
    translate([LOWER_SHAFT_X, LOWER_SHAFT_Y]) {
        difference() {
            circle(r = COND_ARC_R + 0.45);
            circle(r = COND_ARC_R - 0.45);
            translate([-COND_ARC_R - 5, -COND_ARC_R - 5])
                square([2 * (COND_ARC_R + 5), COND_ARC_R + 5]);
        }
        // "1" and "10" and "CONDITIONS"
        translate([-COND_ARC_R - 5, 1])
            text("1", size = 4.0, font = "Liberation Sans:style=Bold", halign = "center", valign = "center");
        translate([COND_ARC_R + 6, 1])
            text("10", size = 4.0, font = "Liberation Sans:style=Bold", halign = "center", valign = "center");
        translate([0, -9])
            text("CONDITIONS", size = 3.2, font = "Liberation Sans:style=Bold", halign = "center", valign = "center");
    }
}

module dial_faceplate() {
    difference() {
        rounded_rect_extrude(DIAL_W, DIAL_H, DIAL_T, 0.5);
        
        // Subtract 0.4mm front inlay graphics (for flush 2-color printing)
        translate([0, 0, -0.01])
            linear_extrude(height = INLAY_DEPTH + 0.01)
                mirror([1, 0, 0]) // Mirrored at Z=0 when printed face-down, or unmirrored if Z=top
                    dial_graphics_2d();
                    
        // Shaft bores (Ø6.5mm clean pass-through)
        translate([UPPER_SHAFT_X, UPPER_SHAFT_Y, -0.1])
            cylinder(d = 6.5, h = DIAL_T + 0.2);
        translate([LOWER_SHAFT_X, LOWER_SHAFT_Y, -0.1])
            cylinder(d = 6.5, h = DIAL_T + 0.2);
            
        // Rear Hall-Effect Sensor Thinning Pockets (leaves 0.8mm front wall)
        for (sy = [UPPER_SHAFT_Y, LOWER_SHAFT_Y]) {
            translate([-HALL_POCKET_W/2, sy + MAG_RADIUS - HALL_POCKET_H/2, HALL_WALL_REMAIN])
                cube([HALL_POCKET_W, HALL_POCKET_H, DIAL_T]);
        }
    }
}

// ============================================================================
// 3. HANDS WITH CAPPED HUBS & 2x2mm HOMING MAGNET POCKETS
// ============================================================================
// Pointer direction is along +Y (12 o'clock) so the 2x2mm magnet at +Y (R=10mm)
// lies directly inside the main blade and aligns with the 12 o'clock Hall sensor!
module clock_hand(blade_len = 52.0, tail_len = 12.0, blade_w_base = 3.6, blade_w_tip = 1.6, hub_d = 9.0, hub_h = 6.2, blade_t = 2.6) {
    difference() {
        union() {
            // Capped Central Hub
            cylinder(d = hub_d, h = hub_h);
            // Tapered Pointer Blade (+Y) & Counterweight Tail (-Y)
            // Elevated by 1.0mm above dial face so only the hub skirt drops down
            translate([0, 0, hub_h - blade_t]) {
                linear_extrude(height = blade_t) {
                    polygon(points = [
                        [-blade_w_base/2, -tail_len],
                        [ blade_w_base/2, -tail_len],
                        [ blade_w_tip/2,   blade_len],
                        [-blade_w_tip/2,   blade_len]
                    ]);
                }
            }
            // Support gusset around magnet pocket on underside of blade (at Y = +MAG_RADIUS)
            translate([0, MAG_RADIUS, hub_h - blade_t - 1.2])
                cylinder(d = 4.4, h = blade_t + 1.2);
        }
        
        // 1. 28BYJ-48 Double-Flat Shaft Bore (from Z=0 to Z=SHAFT_ENGAGE_H, leaving 1.2mm capped top!)
        translate([0, 0, -0.01])
            shaft_28byj48_bore(depth = SHAFT_ENGAGE_H);
            
        // 2. 2x2mm Neodymium Magnet Press-Fit Pocket on Underside at R = 10.0mm (+Y)
        translate([0, MAG_RADIUS, hub_h - blade_t - 1.21]) {
            cylinder(d = MAG_D, h = MAG_DEPTH);
            // Lead-in chamfer for magnet insertion
            cylinder(d1 = MAG_D + 0.5, d2 = MAG_D, h = 0.3);
        }
    }
}
