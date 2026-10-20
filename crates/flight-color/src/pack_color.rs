use crate::{linear_channel_to_srgb, srgb_channel_to_linear};

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct LinearColor {
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub a: f32,
}

/// Allocates a fresh zeroed `LinearColor` for use as an `unpack_color_to_linear` out parameter.
pub fn allocate_linear_color() -> LinearColor {
    return LinearColor::default();
}

/// Takes Flight's packed sRGB `0xRRGGBBAA` color and returns a CSS `rgba()` string. Alpha stays a
/// linear coverage value, matching Canvas/CSS compositing rather than going through sRGB transfer.
pub fn compute_rgba_css_string(color: u32) -> String {
    let packed = color;
    let red = (packed >> 24) & 0xff;
    let green = (packed >> 16) & 0xff;
    let blue = (packed >> 8) & 0xff;
    let alpha = (packed & 0xff) as f32 / 255.0;
    return format!("rgba({},{},{},{})", red, green, blue, alpha);
}

/// Takes a 24-bit RGB color (`0xRRGGBB`, e.g. a shape authoring color) and returns a CSS `#RRGGBB`
/// string. Any high-byte bits are masked off, so a 32-bit RGBA value would keep `GGBBAA` -- every
/// channel shifted, and still a valid-looking color. For a packed `0xRRGGBBAA` value use
/// `compute_rgba_css_string`, which carries the alpha, or `get_color_rgb` to drop it first.
pub fn compute_rgb_hex_string(color: u32) -> String {
    return format!("#{:06x}", color & 0xffffff);
}

/// Returns the alpha channel of a packed `0xRRGGBBAA` color as a float in [0, 1] -- the inverse of
/// `set_color_alpha`. RGB is ignored. Alpha is linear coverage, so this is a plain byte read with no
/// gamma decode (unlike `unpack_color_to_linear`, which decodes the RGB channels).
pub fn get_color_alpha(color: u32) -> f32 {
    return (color & 0xff) as f32 / 255.0;
}

/// Returns the 24-bit RGB part (`0xRRGGBB`) of a packed `0xRRGGBBAA` color, dropping alpha -- the
/// inverse of `pack_opaque_color`'s widening. Useful when handing a color to an API that wants the
/// alpha-less form (a CSS `#RRGGBB` via `compute_rgb_hex_string`, a 24-bit format field).
pub fn get_color_rgb(color: u32) -> u32 {
    return (color >> 8) & 0xffffff;
}

/// Packs four sRGB-space components (each in [0, 1]) to a `0xRRGGBBAA` integer.
/// Does NOT gamma-encode -- use `pack_linear_to_color` when starting from linear floats.
/// Components are clamped to [0, 1] and rounded to 8-bit precision.
pub fn pack_color(r: f32, g: f32, b: f32, a: f32) -> u32 {
    let ri = (r.max(0.0).min(1.0) * 255.0).round() as u32;
    let gi = (g.max(0.0).min(1.0) * 255.0).round() as u32;
    let bi = (b.max(0.0).min(1.0) * 255.0).round() as u32;
    let ai = (a.max(0.0).min(1.0) * 255.0).round() as u32;
    return (ri << 24) | (gi << 16) | (bi << 8) | ai;
}

/// Packs a linear-space RGBA float color to a `0xRRGGBBAA` integer (the inverse of
/// `unpack_color_to_linear`). RGB channels are gamma-encoded to sRGB; alpha passes through
/// unchanged (alpha is linear coverage, never gamma-encoded). Channels are clamped to [0, 1].
pub fn pack_linear_to_color(color: &LinearColor) -> u32 {
    let r = (linear_channel_to_srgb(color.r).max(0.0).min(1.0) * 255.0).round() as u32;
    let g = (linear_channel_to_srgb(color.g).max(0.0).min(1.0) * 255.0).round() as u32;
    let b = (linear_channel_to_srgb(color.b).max(0.0).min(1.0) * 255.0).round() as u32;
    let a = (color.a.max(0.0).min(1.0) * 255.0).round() as u32;
    return (r << 24) | (g << 16) | (b << 8) | a;
}

/// Widens a 24-bit RGB color (`0xRRGGBB` -- a CSS hex literal, a Flash/AwayJS source color, a
/// 24-bit format field) to a fully opaque packed `0xRRGGBBAA` integer, Flight's canonical color form.
/// Bits above 24 are masked off, so `pack_opaque_color(0xff8800)` is `0xff8800ff`. The complement of
/// `get_color_rgb`; use `set_color_alpha` afterward for a non-opaque alpha.
pub fn pack_opaque_color(rgb: u32) -> u32 {
    return ((rgb & 0xffffff) << 8) | 0xff;
}

/// Replaces the alpha channel of a packed `0xRRGGBBAA` color with `alpha` (a float in [0, 1], clamped
/// and rounded to 8 bits), leaving RGB untouched -- the inverse of `get_color_alpha`. Use to fade or set
/// the opacity of a fixed color without unpacking it.
pub fn set_color_alpha(color: u32, alpha: f32) -> u32 {
    let a = (alpha.max(0.0).min(1.0) * 255.0).round() as u32;
    return (color & 0xffffff00) | a;
}

/// Converts a packed sRGB-space `0xRRGGBBAA` integer into four components in [0, 1] and
/// writes them to `out`. Does NOT gamma-decode -- use `unpack_color_to_linear` for linear space.
pub fn unpack_color_rgba(out: &mut [f32; 4], color: u32) {
    out[0] = ((color >> 24) & 0xff) as f32 / 255.0;
    out[1] = ((color >> 16) & 0xff) as f32 / 255.0;
    out[2] = ((color >> 8) & 0xff) as f32 / 255.0;
    out[3] = (color & 0xff) as f32 / 255.0;
}

/// The single sRGB-to-linear decode seam for the whole SDK: packed `0xRRGGBBAA` is
/// sRGB-albedo, so RGB is gamma-decoded to linear while alpha passes through unchanged
/// (alpha is already linear coverage, never gamma-encoded). Writes four floats in [0, 1]
/// into `out`. A packed 8-bit integer cannot carry HDR -- light and emissive
/// radiance is `unpack_color_to_linear(out, color) * intensity`, computed by the caller.
/// Backends must not re-decode packed colors; they consume this output.
pub fn unpack_color_to_linear(out: &mut LinearColor, color: u32) {
    out.r = srgb_channel_to_linear(((color >> 24) & 0xff) as f32 / 255.0);
    out.g = srgb_channel_to_linear(((color >> 16) & 0xff) as f32 / 255.0);
    out.b = srgb_channel_to_linear(((color >> 8) & 0xff) as f32 / 255.0);
    out.a = (color & 0xff) as f32 / 255.0;
}

impl LinearColor {
    pub fn new() -> Self {
        return allocate_linear_color();
    }
}
