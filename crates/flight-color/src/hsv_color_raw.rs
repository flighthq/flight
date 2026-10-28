//! flight-compiler: companion hsvColor.ts

use flight_entity::EntityRuntimeSlot;

#[cfg(test)]
mod sugar_tests {
    use super::*;

    #[test]
    fn rgb_to_hsv_matches_free_function() {
        let mut method_out = allocate_hsv_color();
        let mut free_out = allocate_hsv_color();
        method_out.rgb_to_hsv(0x00ff80ff);
        rgb_to_hsv(&mut free_out, 0x00ff80ff);
        assert_eq!(method_out, free_out);
    }
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct HsvColor {
    pub h: f32,
    pub s: f32,
    pub v: f32,
    runtime: EntityRuntimeSlot,
}

/// Allocates a fresh zeroed `HsvColor` for use as an `rgb_to_hsv` out parameter.
pub fn allocate_hsv_color() -> HsvColor {
    return flight_entity::allocate_entity();
}

/// Converts HSV to RGB floats. Writes sRGB [0, 1] to out[0..2] (h in [0, 360), s/v in [0, 1]).
/// Alpha in out[3] is not modified.
pub fn hsv_to_rgb(out: &mut [f32; 4], h: f32, s: f32, v: f32) {
    if s == 0.0 {
        out[0] = v;
        out[1] = v;
        out[2] = v;
        return;
    }
    let hn = ((h % 360.0) + 360.0) % 360.0;
    let i = (hn / 60.0).floor() as i32 % 6;
    let f = hn / 60.0 - (hn / 60.0).floor();
    let p = v * (1.0 - s);
    let q = v * (1.0 - f * s);
    let t = v * (1.0 - (1.0 - f) * s);
    match i {
        0 => {
            out[0] = v;
            out[1] = t;
            out[2] = p;
        }
        1 => {
            out[0] = q;
            out[1] = v;
            out[2] = p;
        }
        2 => {
            out[0] = p;
            out[1] = v;
            out[2] = t;
        }
        3 => {
            out[0] = p;
            out[1] = q;
            out[2] = v;
        }
        4 => {
            out[0] = t;
            out[1] = p;
            out[2] = v;
        }
        _ => {
            out[0] = v;
            out[1] = p;
            out[2] = q;
        }
    }
}

/// Converts a packed sRGB `0xRRGGBBAA` color to HSV and writes to `out`.
/// `out.h` = hue in [0, 360), `out.s` = saturation [0, 1], `out.v` = value [0, 1].
/// Alpha is ignored. The conversion operates in sRGB (non-linear) space.
pub fn rgb_to_hsv(out: &mut HsvColor, color: u32) {
    let r = ((color >> 24) & 0xff) as f32 / 255.0;
    let g = ((color >> 16) & 0xff) as f32 / 255.0;
    let b = ((color >> 8) & 0xff) as f32 / 255.0;
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let d = max - min;
    let v = max;
    let s = if max == 0.0 { 0.0 } else { d / max };
    let h;
    if d == 0.0 {
        h = 0.0;
    } else if max == r {
        h = ((g - b) / d + if g < b { 6.0 } else { 0.0 }) / 6.0;
    } else if max == g {
        h = ((b - r) / d + 2.0) / 6.0;
    } else {
        h = ((r - g) / d + 4.0) / 6.0;
    }
    out.h = h * 360.0;
    out.s = s;
    out.v = v;
}

impl HsvColor {
    pub fn rgb_to_hsv(&mut self, color: u32) {
        rgb_to_hsv(self, color);
    }
}

flight_entity::impl_entity!(HsvColor);
