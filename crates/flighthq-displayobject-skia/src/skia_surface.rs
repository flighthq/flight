//! Bridges the tiny-skia `Pixmap` (premultiplied RGBA8) and the
//! `flighthq-surface` buffer (straight-alpha RGBA8). `read_skia_surface`
//! demultiplies the pixmap into a fresh `Surface`; `clear_skia_pixmap` resets the
//! pixmap to the state's background color before a frame. This is the no-GPU-
//! readback capture path that makes the software backend the conformance
//! reference.

use flighthq_types::{AlphaType, ColorSpace, PixelFormat, Surface};

use crate::skia_color::create_skia_color;
use crate::skia_render_state::SkiaRenderState;

/// Clears the pixmap to the state's `background_color` (packed `0xRRGGBBAA`),
/// the per-frame reset the host calls before walking the scene.
pub fn clear_skia_pixmap(state: &mut SkiaRenderState) {
    state
        .pixmap
        .fill(create_skia_color(state.background_color, 1.0));
}

/// Reads the pixmap into a new `flighthq-surface` `Surface`, demultiplying so the
/// result is straight-alpha RGBA8 (the surface convention). The byte layout
/// matches 1:1, so this is a per-pixel demultiply with no resampling.
pub fn read_skia_surface(state: &SkiaRenderState) -> Surface {
    let width = state.pixmap.width();
    let height = state.pixmap.height();
    let premultiplied = state.pixmap.data();
    let len = premultiplied.len();
    let mut data = vec![0u8; len];

    let mut i = 0;
    while i < len {
        let a = premultiplied[i + 3];
        if a == 0 {
            // Fully transparent: channels are already zero.
            data[i + 3] = 0;
        } else if a == 0xff {
            data[i] = premultiplied[i];
            data[i + 1] = premultiplied[i + 1];
            data[i + 2] = premultiplied[i + 2];
            data[i + 3] = 0xff;
        } else {
            let af = a as u32;
            data[i] = ((premultiplied[i] as u32 * 255 + af / 2) / af).min(255) as u8;
            data[i + 1] = ((premultiplied[i + 1] as u32 * 255 + af / 2) / af).min(255) as u8;
            data[i + 2] = ((premultiplied[i + 2] as u32 * 255 + af / 2) / af).min(255) as u8;
            data[i + 3] = a;
        }
        i += 4;
    }

    Surface {
        alpha_type: AlphaType::Straight,
        color_space: ColorSpace::Srgb,
        data,
        format: PixelFormat::Rgba8Unorm,
        height,
        version: 0,
        width,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::skia_render_state::create_skia_render_state;

    #[test]
    fn clear_skia_pixmap_fills_background() {
        let mut state = create_skia_render_state(2, 2).expect("state");
        state.background_color = 0x102030ff;
        clear_skia_pixmap(&mut state);
        let surface = read_skia_surface(&state);
        assert_eq!(&surface.data[0..4], &[0x10, 0x20, 0x30, 0xff]);
    }

    #[test]
    fn read_skia_surface_matches_dimensions() {
        let state = create_skia_render_state(3, 5).expect("state");
        let surface = read_skia_surface(&state);
        assert_eq!(surface.width, 3);
        assert_eq!(surface.height, 5);
        assert_eq!(surface.data.len(), 3 * 5 * 4);
        assert_eq!(surface.alpha_type, AlphaType::Straight);
    }

    #[test]
    fn read_skia_surface_demultiplies_alpha() {
        let mut state = create_skia_render_state(1, 1).expect("state");
        // Write a half-alpha red directly as premultiplied (128,0,0,128).
        {
            let raw = state.pixmap.data_mut();
            raw[0] = 0x80;
            raw[1] = 0x00;
            raw[2] = 0x00;
            raw[3] = 0x80;
        }
        let surface = read_skia_surface(&state);
        // Demultiplied red should round back near 0xff.
        assert!(surface.data[0] >= 0xfd, "r = {}", surface.data[0]);
        assert_eq!(surface.data[3], 0x80);
    }

    #[test]
    fn read_skia_surface_transparent_stays_zero() {
        let state = create_skia_render_state(1, 1).expect("state");
        let surface = read_skia_surface(&state);
        assert_eq!(&surface.data[0..4], &[0, 0, 0, 0]);
    }
}
