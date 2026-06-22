//! Software bitmap blit: draws a `Bitmap` display object's pixel source as a
//! transformed quad into the pixmap. Models the `drawImage` path of TS
//! `@flighthq/displayobject-canvas` (the bitmap blit), but over tiny-skia's
//! `draw_pixmap` instead of Canvas2D.

use tiny_skia::{IntSize, Pixmap, PixmapPaint};

use crate::skia_blend::resolve_skia_blend_mode;
use crate::skia_render_state::{SkiaRenderState, current_skia_clip};
use crate::skia_transform::create_skia_transform;

/// Resolved pixel source for one `Bitmap` node: straight (non-premultiplied)
/// RGBA8 bytes (`width * height * 4`, top-left origin — the `flighthq-surface`
/// convention) and the texel dimensions. The walk passes this through closures,
/// mirroring `WgpuBitmapTexture` in the GPU backend.
pub struct SkiaBitmapTexture {
    pub pixels: Vec<u8>,
    pub width: u32,
    pub height: u32,
}

/// Blits a bitmap into the pixmap using the draw context the walk published
/// (`render_transform_2d`, `render_alpha`, `render_blend_mode`). The straight-
/// alpha source is premultiplied into a temporary `Pixmap` (tiny-skia's owned
/// format), then drawn at the node transform. No-op when the source is empty or
/// the byte length does not match the declared dimensions.
pub fn draw_skia_bitmap(state: &mut SkiaRenderState, texture: &SkiaBitmapTexture) {
    let expected = (texture.width as usize) * (texture.height as usize) * 4;
    if texture.width == 0 || texture.height == 0 || texture.pixels.len() != expected {
        return;
    }

    let Some(source) = create_premultiplied_pixmap(&texture.pixels, texture.width, texture.height)
    else {
        return;
    };

    let transform = create_skia_transform(&state.render_transform_2d.unwrap_or_default());
    let paint = PixmapPaint {
        opacity: state.render_alpha.clamp(0.0, 1.0),
        blend_mode: resolve_skia_blend_mode(state.render_blend_mode),
        ..PixmapPaint::default()
    };

    let clip = current_skia_clip(state).cloned();
    state
        .pixmap
        .draw_pixmap(0, 0, source.as_ref(), &paint, transform, clip.as_ref());
}

/// Builds an owned tiny-skia `Pixmap` from straight-alpha RGBA8 bytes by
/// premultiplying each pixel (tiny-skia owns premultiplied storage). Returns
/// `None` on size mismatch or zero dimensions.
pub fn create_premultiplied_pixmap(pixels: &[u8], width: u32, height: u32) -> Option<Pixmap> {
    let expected = (width as usize) * (height as usize) * 4;
    if pixels.len() != expected {
        return None;
    }
    let mut premultiplied = vec![0u8; expected];
    let mut i = 0;
    while i < expected {
        let a = pixels[i + 3] as u32;
        premultiplied[i] = ((pixels[i] as u32 * a + 127) / 255) as u8;
        premultiplied[i + 1] = ((pixels[i + 1] as u32 * a + 127) / 255) as u8;
        premultiplied[i + 2] = ((pixels[i + 2] as u32 * a + 127) / 255) as u8;
        premultiplied[i + 3] = a as u8;
        i += 4;
    }
    Pixmap::from_vec(premultiplied, IntSize::from_wh(width, height)?)
}

#[cfg(test)]
mod tests {
    use flighthq_types::geometry::Matrix;

    use super::*;
    use crate::skia_render_state::create_skia_render_state;

    fn solid_texture(color: [u8; 4], w: u32, h: u32) -> SkiaBitmapTexture {
        let mut pixels = Vec::with_capacity((w * h * 4) as usize);
        for _ in 0..(w * h) {
            pixels.extend_from_slice(&color);
        }
        SkiaBitmapTexture {
            pixels,
            width: w,
            height: h,
        }
    }

    fn pixel(state: &SkiaRenderState, x: u32, y: u32) -> [u8; 4] {
        let p = state.pixmap.pixel(x, y).expect("pixel").demultiply();
        [p.red(), p.green(), p.blue(), p.alpha()]
    }

    #[test]
    fn create_premultiplied_pixmap_premultiplies_half_alpha() {
        let pm = create_premultiplied_pixmap(&[0xff, 0x00, 0x00, 0x80], 1, 1).expect("pixmap");
        let raw = pm.data();
        // 255 * 128 / 255 ~= 128.
        assert!(raw[0] >= 0x7f && raw[0] <= 0x81, "premul r {}", raw[0]);
        assert_eq!(raw[3], 0x80);
    }

    #[test]
    fn create_premultiplied_pixmap_size_mismatch_returns_none() {
        assert!(create_premultiplied_pixmap(&[0, 0, 0], 1, 1).is_none());
    }

    #[test]
    fn draw_skia_bitmap_blits_opaque_source() {
        let mut state = create_skia_render_state(4, 4).expect("state");
        state.render_transform_2d = Some(Matrix::default());
        draw_skia_bitmap(&mut state, &solid_texture([0x00, 0x00, 0xff, 0xff], 4, 4));
        let c = pixel(&state, 1, 1);
        assert_eq!(c, [0x00, 0x00, 0xff, 0xff]);
    }

    #[test]
    fn draw_skia_bitmap_translates_source() {
        let mut state = create_skia_render_state(8, 8).expect("state");
        state.render_transform_2d = Some(Matrix {
            a: 1.0,
            b: 0.0,
            c: 0.0,
            d: 1.0,
            tx: 4.0,
            ty: 4.0,
        });
        draw_skia_bitmap(&mut state, &solid_texture([0xff, 0xff, 0xff, 0xff], 2, 2));
        // Source is a 2x2 white quad moved to (4,4); origin stays transparent.
        assert_eq!(pixel(&state, 0, 0)[3], 0x00);
        assert_eq!(pixel(&state, 5, 5), [0xff, 0xff, 0xff, 0xff]);
    }

    #[test]
    fn draw_skia_bitmap_ignores_size_mismatch() {
        let mut state = create_skia_render_state(4, 4).expect("state");
        state.render_transform_2d = Some(Matrix::default());
        let bad = SkiaBitmapTexture {
            pixels: vec![0u8; 3],
            width: 2,
            height: 2,
        };
        draw_skia_bitmap(&mut state, &bad);
        assert_eq!(pixel(&state, 0, 0)[3], 0x00);
    }
}
