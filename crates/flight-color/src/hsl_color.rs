#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct HslColor {
    pub h: f32,
    pub s: f32,
    pub l: f32,
}

/// Allocates a fresh zeroed `HslColor` for use as an `rgb_to_hsl` out parameter.
pub fn allocate_hsl_color() -> HslColor {
    return HslColor::default();
}

/// Converts HSL to sRGB floats. Writes sRGB [0, 1] R/G/B to out[0..2] (h in [0, 360), s/l in
/// [0, 1]); leaves out[3] (alpha) unmodified. The conversion operates in sRGB (non-linear)
/// space, matching artist-facing color pickers.
pub fn hsl_to_rgb(out: &mut [f32; 4], h: f32, s: f32, l: f32) {
    if s == 0.0 {
        out[0] = l;
        out[1] = l;
        out[2] = l;
        return;
    }
    let q = if l < 0.5 { l * (1.0 + s) } else { l + s - l * s };
    let p = 2.0 * l - q;
    let hn = h / 360.0;
    out[0] = hue_to_rgb_channel(p, q, hn + 1.0 / 3.0);
    out[1] = hue_to_rgb_channel(p, q, hn);
    out[2] = hue_to_rgb_channel(p, q, hn - 1.0 / 3.0);
}

/// Converts a packed sRGB `0xRRGGBBAA` color to HSL and writes to `out`.
/// `out.h` = hue in [0, 360), `out.s` = saturation [0, 1], `out.l` = lightness [0, 1].
/// Alpha is ignored. The conversion operates in sRGB (non-linear) space, consistent with
/// artist-facing HSL color pickers.
pub fn rgb_to_hsl(out: &mut HslColor, color: u32) {
    let r = ((color >> 24) & 0xff) as f32 / 255.0;
    let g = ((color >> 16) & 0xff) as f32 / 255.0;
    let b = ((color >> 8) & 0xff) as f32 / 255.0;
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let l = (max + min) / 2.0;
    if max == min {
        out.h = 0.0;
        out.s = 0.0;
        out.l = l;
        return;
    }
    let d = max - min;
    let s = if l > 0.5 { d / (2.0 - max - min) } else { d / (max + min) };
    let h;
    if max == r {
        h = ((g - b) / d + if g < b { 6.0 } else { 0.0 }) / 6.0;
    } else if max == g {
        h = ((b - r) / d + 2.0) / 6.0;
    } else {
        h = ((r - g) / d + 4.0) / 6.0;
    }
    out.h = h * 360.0;
    out.s = s;
    out.l = l;
}

/// HSL helper: interpolates a single channel from hue position `t`.
fn hue_to_rgb_channel(p: f32, q: f32, t: f32) -> f32 {
    let tn = ((t % 1.0) + 1.0) % 1.0;
    if tn < 1.0 / 6.0 {
        return p + (q - p) * 6.0 * tn;
    }
    if tn < 1.0 / 2.0 {
        return q;
    }
    if tn < 2.0 / 3.0 {
        return p + (q - p) * (2.0 / 3.0 - tn) * 6.0;
    }
    return p;
}

impl HslColor {
    pub fn new() -> Self {
        return allocate_hsl_color();
    }
}
