//! Color utility functions.

/// A linear-space RGBA color as four floats: RGB and A in `[0, 1]`. The single
/// float representation downstream lighting and shading math consumes. Written
/// by [`unpack_color_to_linear`] and safe to keep as a reusable scratch `out`.
pub type LinearColor = [f64; 4];

// ---------------------------------------------------------------------------
// Functions (alphabetical)
// ---------------------------------------------------------------------------

/// Converts a 24-bit RGB color (`0xRRGGBB`, e.g. a text format color) to a
/// CSS `#RRGGBB` hex string. High-byte bits are masked off — pass RGB, not RGBA.
pub fn compute_rgb_hex_string(color: u32) -> String {
    format!("#{:06x}", color & 0x00ff_ffff)
}

/// Allocates a zeroed [`LinearColor`] scratch value.
pub fn create_linear_color() -> LinearColor {
    [0.0, 0.0, 0.0, 0.0]
}

/// Packs a linear-space RGBA float color to a `0xRRGGBBAA` integer (the inverse
/// of [`unpack_color_to_linear`]). RGB channels are gamma-encoded to sRGB; alpha
/// passes through unchanged (alpha is linear coverage, never gamma-encoded).
/// Channels are clamped to `[0, 1]`.
pub fn pack_linear_to_color(color: &LinearColor) -> u32 {
    let r = (linear_channel_to_srgb(color[0]).clamp(0.0, 1.0) * 255.0).round() as u32;
    let g = (linear_channel_to_srgb(color[1]).clamp(0.0, 1.0) * 255.0).round() as u32;
    let b = (linear_channel_to_srgb(color[2]).clamp(0.0, 1.0) * 255.0).round() as u32;
    let a = (color[3].clamp(0.0, 1.0) * 255.0).round() as u32;
    (r << 24) | (g << 16) | (b << 8) | a
}

/// Unpacks a packed sRGB `0xRRGGBBAA` color into linear-space RGBA floats,
/// writing into `out`. RGB channels are gamma-decoded from sRGB to linear;
/// alpha passes through unchanged (linear coverage). The inverse of
/// [`pack_linear_to_color`].
pub fn unpack_color_to_linear(out: &mut LinearColor, color: u32) {
    out[0] = srgb_channel_to_linear(((color >> 24) & 0xff) as f64 / 255.0);
    out[1] = srgb_channel_to_linear(((color >> 16) & 0xff) as f64 / 255.0);
    out[2] = srgb_channel_to_linear(((color >> 8) & 0xff) as f64 / 255.0);
    out[3] = (color & 0xff) as f64 / 255.0;
}

// The IEC 61966-2-1 linear-to-sRGB inverse OETF for a single channel in [0, 1].
fn linear_channel_to_srgb(value: f64) -> f64 {
    if value <= 0.0031308 {
        value * 12.92
    } else {
        1.055 * value.powf(1.0 / 2.4) - 0.055
    }
}

// The IEC 61966-2-1 sRGB electro-optical transfer function for a single channel in [0, 1].
fn srgb_channel_to_linear(value: f64) -> f64 {
    if value <= 0.04045 {
        value / 12.92
    } else {
        ((value + 0.055) / 1.055).powf(2.4)
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // compute_rgb_hex_string
    #[test]
    fn compute_rgb_hex_string_red() {
        assert_eq!(compute_rgb_hex_string(0x00ff_0000), "#ff0000");
    }

    #[test]
    fn compute_rgb_hex_string_green() {
        assert_eq!(compute_rgb_hex_string(0x0000_ff00), "#00ff00");
    }

    #[test]
    fn compute_rgb_hex_string_blue() {
        assert_eq!(compute_rgb_hex_string(0x0000_00ff), "#0000ff");
    }

    #[test]
    fn compute_rgb_hex_string_black() {
        assert_eq!(compute_rgb_hex_string(0x0000_0000), "#000000");
    }

    #[test]
    fn compute_rgb_hex_string_white() {
        assert_eq!(compute_rgb_hex_string(0x00ff_ffff), "#ffffff");
    }

    #[test]
    fn compute_rgb_hex_string_masks_high_byte() {
        // 0xAABBCCDD — lower 24 bits are 0xBBCCDD
        assert_eq!(compute_rgb_hex_string(0xaabb_ccdd), "#bbccdd");
    }

    // create_linear_color
    #[test]
    fn create_linear_color_is_zeroed() {
        assert_eq!(create_linear_color(), [0.0, 0.0, 0.0, 0.0]);
    }

    // pack_linear_to_color
    #[test]
    fn pack_linear_to_color_is_the_inverse_of_unpack_for_white() {
        let mut out = create_linear_color();
        unpack_color_to_linear(&mut out, 0xffffffff);
        assert_eq!(pack_linear_to_color(&out), 0xffffffff);
    }

    #[test]
    fn pack_linear_to_color_is_the_inverse_of_unpack_for_opaque_black() {
        let mut out = create_linear_color();
        unpack_color_to_linear(&mut out, 0x000000ff);
        assert_eq!(pack_linear_to_color(&out), 0x000000ff);
    }

    // unpack_color_to_linear
    #[test]
    fn unpack_color_to_linear_decodes_endpoints_exactly() {
        let mut out = create_linear_color();
        unpack_color_to_linear(&mut out, 0xffffffff);
        assert_eq!(out, [1.0, 1.0, 1.0, 1.0]);
        unpack_color_to_linear(&mut out, 0x000000ff);
        assert_eq!(out, [0.0, 0.0, 0.0, 1.0]);
    }

    #[test]
    fn unpack_color_to_linear_passes_alpha_through_linearly() {
        let mut out = create_linear_color();
        unpack_color_to_linear(&mut out, 0x00000080);
        assert!((out[3] - 0x80 as f64 / 0xff as f64).abs() < 1e-6);
    }

    #[test]
    fn unpack_color_to_linear_gamma_decodes_rgb_below_midpoint() {
        let mut out = create_linear_color();
        unpack_color_to_linear(&mut out, 0x808080ff);
        assert!((out[0] - 0.21586).abs() < 1e-4);
        assert_eq!(out[0], out[1]);
        assert_eq!(out[1], out[2]);
    }
}
