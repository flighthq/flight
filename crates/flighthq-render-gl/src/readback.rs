//! GL render-target pixel readback. Ports the TypeScript `glReadback.ts`.

use glow::HasContext;

use crate::render_state::{GlRenderState, GlRenderTarget};

/// Destination buffer for [`read_gl_render_target_pixels`].
///
/// Mirrors the TS `out: Uint8Array | Float32Array` union: the variant selects
/// both the destination element type and the GL pixel transfer type
/// (`UNSIGNED_BYTE` for [`U8`](GlReadbackPixels::U8), `FLOAT` for
/// [`F32`](GlReadbackPixels::F32)). Use `U8` for `rgba8` targets and `F32` for
/// `rgba16f` / `rgba32f` targets.
pub enum GlReadbackPixels<'a> {
    U8(&'a mut [u8]),
    F32(&'a mut [f32]),
}

/// Reads pixel data from a render target's resolve texture into `out`. Binds the
/// resolve framebuffer (or the draw framebuffer for single-sample targets) for
/// reading, then calls `read_pixels`. Returns `false` when the framebuffer is
/// incomplete or the target has no dimensions.
///
/// For MSAA targets, call `resolve_gl_render_target` before this so the
/// multisample data is blitted to the resolve texture first.
///
/// The pixel rectangle must lie within the target dimensions; out-of-bounds reads
/// return zeros.
pub fn read_gl_render_target_pixels(
    state: &GlRenderState,
    target: &GlRenderTarget,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    out: GlReadbackPixels<'_>,
) -> bool {
    if target.width == 0 || target.height == 0 {
        return false;
    }
    let gl = &state.gl;
    // Read from the resolve framebuffer (single-sample textures) or the draw
    // framebuffer when no resolve pass is needed. The resolve FBO is always
    // texture-backed; the draw FBO for single-sample targets is the same as the
    // texture FBO.
    let read_fbo = target.resolve_framebuffer.or(Some(target.framebuffer));
    let prev_fbo = state.runtime.current_framebuffer;
    unsafe {
        gl.bind_framebuffer(glow::READ_FRAMEBUFFER, read_fbo);
        let status = gl.check_framebuffer_status(glow::READ_FRAMEBUFFER);
        if status != glow::FRAMEBUFFER_COMPLETE {
            gl.bind_framebuffer(glow::READ_FRAMEBUFFER, prev_fbo);
            return false;
        }
        let format = glow::RGBA;
        match out {
            GlReadbackPixels::U8(out) => {
                gl.read_pixels(
                    x,
                    y,
                    width,
                    height,
                    format,
                    glow::UNSIGNED_BYTE,
                    glow::PixelPackData::Slice(out),
                );
            }
            GlReadbackPixels::F32(out) => {
                // glow's `read_pixels` fills a `&mut [u8]`; the FLOAT transfer type
                // makes GL write f32 values into those bytes. Reinterpret the f32
                // destination as its raw byte view (f32 has no padding).
                let bytes = std::slice::from_raw_parts_mut(
                    out.as_mut_ptr() as *mut u8,
                    std::mem::size_of_val(out),
                );
                gl.read_pixels(
                    x,
                    y,
                    width,
                    height,
                    format,
                    glow::FLOAT,
                    glow::PixelPackData::Slice(bytes),
                );
            }
        }
        gl.bind_framebuffer(glow::READ_FRAMEBUFFER, prev_fbo);
    }
    true
}
