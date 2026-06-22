//! Color conversions between Flight's packed `0xRRGGBBAA` convention, the
//! `flighthq-surface` straight-alpha RGBA8 buffer, and tiny-skia's `Color`
//! (which premultiplies on raster). One place owns the convention so the rest of
//! the backend never hand-rolls byte math.

use tiny_skia::Color;

/// Unpacks a packed `0xRRGGBBAA` color into a tiny-skia `Color`, scaling the
/// fill alpha by `alpha` (the node's resolved opacity, in `0.0..=1.0`). tiny-skia
/// premultiplies internally on raster, so this passes straight (non-premultiplied)
/// channels — matching the `flighthq-surface` `AlphaType::Straight` convention.
pub fn create_skia_color(packed: u32, alpha: f32) -> Color {
    let r = ((packed >> 24) & 0xff) as f32 / 255.0;
    let g = ((packed >> 16) & 0xff) as f32 / 255.0;
    let b = ((packed >> 8) & 0xff) as f32 / 255.0;
    let a = ((packed & 0xff) as f32 / 255.0) * alpha.clamp(0.0, 1.0);
    Color::from_rgba(r, g, b, a).unwrap_or(Color::TRANSPARENT)
}

/// Unpacks a packed `0xRRGGBBAA` color into the four straight RGBA8 bytes the
/// `flighthq-surface` buffer stores, in `[r, g, b, a]` order.
pub fn unpack_skia_rgba(packed: u32) -> [u8; 4] {
    [
        ((packed >> 24) & 0xff) as u8,
        ((packed >> 16) & 0xff) as u8,
        ((packed >> 8) & 0xff) as u8,
        (packed & 0xff) as u8,
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_skia_color_unpacks_opaque() {
        let c = create_skia_color(0xff0000ff, 1.0);
        assert!((c.red() - 1.0).abs() < 1e-6);
        assert!((c.green() - 0.0).abs() < 1e-6);
        assert!((c.blue() - 0.0).abs() < 1e-6);
        assert!((c.alpha() - 1.0).abs() < 1e-6);
    }

    #[test]
    fn create_skia_color_scales_alpha_by_node_opacity() {
        let c = create_skia_color(0x00ff00ff, 0.5);
        assert!((c.green() - 1.0).abs() < 1e-6);
        assert!((c.alpha() - 0.5).abs() < 1e-6);
    }

    #[test]
    fn create_skia_color_clamps_alpha_above_one() {
        let c = create_skia_color(0x000000ff, 2.0);
        assert!((c.alpha() - 1.0).abs() < 1e-6);
    }

    #[test]
    fn unpack_skia_rgba_orders_channels() {
        assert_eq!(unpack_skia_rgba(0x11223344), [0x11, 0x22, 0x33, 0x44]);
    }
}
