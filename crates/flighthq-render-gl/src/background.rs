//! GL background clear — clears the canvas to the render state's background color.

use glow::HasContext;

use crate::render_state::GlRenderState;

/// Clears the current framebuffer to `state`'s background color and resets
/// per-frame blend-mode tracking.
pub fn render_gl_background(state: &mut GlRenderState) {
    let (r, g, b, a) = unpack_gl_rgba(state.render_state.background_color);
    unsafe {
        state.gl.clear_color(r, g, b, a);
        state.gl.clear(glow::COLOR_BUFFER_BIT);
    }
    // Force the next blend apply through; a cleared frame starts fresh.
    state.runtime.current_blend_mode = None;
}

/// Unpacks a `0xRRGGBBaa` packed color into normalized `(r, g, b, a)` floats.
/// Pure CPU seam.
pub fn unpack_gl_rgba(packed: u32) -> (f32, f32, f32, f32) {
    let r = ((packed >> 24) & 0xff) as f32 / 255.0;
    let g = ((packed >> 16) & 0xff) as f32 / 255.0;
    let b = ((packed >> 8) & 0xff) as f32 / 255.0;
    let a = (packed & 0xff) as f32 / 255.0;
    (r, g, b, a)
}

#[cfg(test)]
mod tests {
    use super::*;

    // unpack_gl_rgba

    #[test]
    fn unpack_gl_rgba_opaque_black() {
        assert_eq!(unpack_gl_rgba(0x000000ff), (0.0, 0.0, 0.0, 1.0));
    }

    #[test]
    fn unpack_gl_rgba_splits_channels() {
        let (r, g, b, a) = unpack_gl_rgba(0xeeddccff);
        assert!((r - 0xee as f32 / 255.0).abs() < 1e-6);
        assert!((g - 0xdd as f32 / 255.0).abs() < 1e-6);
        assert!((b - 0xcc as f32 / 255.0).abs() < 1e-6);
        assert!((a - 1.0).abs() < 1e-6);
    }
}
