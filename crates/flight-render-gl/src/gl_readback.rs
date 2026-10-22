// flight-lint: allow-file(contract-vocabulary, enum-payload-named) D17 readback exposes borrowed native typed-array analogs whose enum payload preserves buffer identity

use glow::{HasContext, PixelPackData};

use crate::{GlRenderState, GlTextureRenderTarget};

pub enum GlReadbackBuffer<'a> {
    F32(&'a mut [f32]),
    U8(&'a mut [u8]),
}

// flight-lint: allow(conform-params) The native output name is descriptive; its position and source semantics are unchanged
pub fn read_gl_render_target_pixels(
    state: &GlRenderState,
    target: &GlTextureRenderTarget,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    output: GlReadbackBuffer<'_>,
) -> bool {
    if target.axes.width == 0 || target.axes.height == 0 {
        return false;
    }
    let read_framebuffer = target.resolve_framebuffer.unwrap_or(target.framebuffer);
    let previous_framebuffer = state.gl_runtime.borrow().current_framebuffer;
    // SAFETY: the read framebuffer and restore binding belong to this context.
    unsafe {
        state
            .gl
            .bind_framebuffer(glow::READ_FRAMEBUFFER, Some(read_framebuffer));
        if state.gl.check_framebuffer_status(glow::READ_FRAMEBUFFER) != glow::FRAMEBUFFER_COMPLETE {
            state
                .gl
                .bind_framebuffer(glow::READ_FRAMEBUFFER, previous_framebuffer);
            return false;
        }
        match output {
            GlReadbackBuffer::U8(output) => state.gl.read_pixels(
                x,
                y,
                width,
                height,
                glow::RGBA,
                glow::UNSIGNED_BYTE,
                PixelPackData::Slice(Some(output)),
            ),
            GlReadbackBuffer::F32(output) => {
                let mut bytes = vec![0_u8; output.len() * std::mem::size_of::<f32>()];
                state.gl.read_pixels(
                    x,
                    y,
                    width,
                    height,
                    glow::RGBA,
                    glow::FLOAT,
                    PixelPackData::Slice(Some(&mut bytes)),
                );
                for (value, chunk) in output.iter_mut().zip(bytes.chunks_exact(4)) {
                    *value = f32::from_ne_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
                }
            }
        }
        state
            .gl
            .bind_framebuffer(glow::READ_FRAMEBUFFER, previous_framebuffer);
    }
    return true;
}
