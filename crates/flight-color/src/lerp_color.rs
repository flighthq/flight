use crate::{LinearColor, pack_linear_channels_to_color, srgb_channel_to_linear};

#[cfg(test)]
#[allow(clippy::items_after_test_module)] // keep Rust-only sugar coverage beside its implementation
mod sugar_tests {
    use super::*;
    use crate::allocate_linear_color;

    fn make_linear_color(r: f32, g: f32, b: f32, a: f32) -> LinearColor {
        let mut color = allocate_linear_color();
        color.r = r;
        color.g = g;
        color.b = b;
        color.a = a;
        return color;
    }

    #[test]
    fn lerp_matches_free_function() {
        let start = make_linear_color(0.0, 0.25, 0.5, 0.75);
        let end = make_linear_color(1.0, 0.75, 0.5, 0.25);
        let mut method_out = allocate_linear_color();
        let mut free_out = allocate_linear_color();
        method_out.lerp(&start, &end, 0.25);
        lerp_linear_color(&mut free_out, &start, &end, 0.25);
        assert_eq!(method_out, free_out);
    }
}

/// Linearly interpolates between two packed sRGB colors `start` and `end` by `t` in [0, 1].
/// Interpolation is performed in linear space for perceptual correctness (gamma-correct mix),
/// then repacked to sRGB. Alpha is interpolated linearly (alpha is already linear coverage).
/// `t` is clamped to [0, 1].
#[allow(clippy::manual_clamp)] // max/min is the portable source form for TypeScript generation
pub fn lerp_color(start: u32, end: u32, t: f32) -> u32 {
    let tc = t.max(0.0).min(1.0);
    let sr = srgb_channel_to_linear(((start >> 24) & 0xff) as f32 / 255.0);
    let sg = srgb_channel_to_linear(((start >> 16) & 0xff) as f32 / 255.0);
    let sb = srgb_channel_to_linear(((start >> 8) & 0xff) as f32 / 255.0);
    let sa = (start & 0xff) as f32 / 255.0;
    let er = srgb_channel_to_linear(((end >> 24) & 0xff) as f32 / 255.0);
    let eg = srgb_channel_to_linear(((end >> 16) & 0xff) as f32 / 255.0);
    let eb = srgb_channel_to_linear(((end >> 8) & 0xff) as f32 / 255.0);
    let ea = (end & 0xff) as f32 / 255.0;
    let r = sr + (er - sr) * tc;
    let g = sg + (eg - sg) * tc;
    let b = sb + (eb - sb) * tc;
    let a = sa + (ea - sa) * tc;
    return pack_linear_channels_to_color(r, g, b, a);
}

/// Linearly interpolates between two LinearColors in linear space and writes the result to
/// `out`. `t` is clamped to [0, 1]. Alias-safe: reads all input values before writing `out`.
#[allow(clippy::manual_clamp)] // max/min is the portable source form for TypeScript generation
pub fn lerp_linear_color(out: &mut LinearColor, start: &LinearColor, end: &LinearColor, t: f32) {
    let tc = t.max(0.0).min(1.0);
    let r0 = start.r;
    let g0 = start.g;
    let b0 = start.b;
    let a0 = start.a;
    let r1 = end.r;
    let g1 = end.g;
    let b1 = end.b;
    let a1 = end.a;
    out.r = r0 + (r1 - r0) * tc;
    out.g = g0 + (g1 - g0) * tc;
    out.b = b0 + (b1 - b0) * tc;
    out.a = a0 + (a1 - a0) * tc;
}

impl LinearColor {
    pub fn lerp(&mut self, start: &LinearColor, end: &LinearColor, t: f32) {
        lerp_linear_color(self, start, end, t);
    }
}
