//! GL fullscreen pass — draws a full-viewport triangle for post-process effects.

use glow::HasContext;

use crate::draw::use_gl_program;
use crate::render_state::GlRenderState;
use crate::shader::GlBitmapShader;

/// Draws a fullscreen triangle using `shader`, sampling `texture`.
///
/// A single oversized triangle (covering the whole NDC clip rect) avoids the
/// diagonal seam of a two-triangle quad and needs no vertex buffer: the
/// positions are generated in the vertex shader from `gl_VertexID`. Here the
/// shared bitmap program is bound and a 3-vertex array draw is issued.
pub fn draw_gl_fullscreen_pass(
    state: &mut GlRenderState,
    shader: &GlBitmapShader,
    texture: glow::Texture,
) {
    use_gl_program(state, Some(shader));
    unsafe {
        if state.runtime.current_texture != Some(texture) {
            state.gl.bind_texture(glow::TEXTURE_2D, Some(texture));
            state.runtime.current_texture = Some(texture);
        }
        state
            .gl
            .uniform_1_i32(shader.locations.loc_texture.as_ref(), 0);
        state
            .gl
            .uniform_1_f32(shader.locations.loc_alpha.as_ref(), 1.0);
        state.gl.draw_arrays(glow::TRIANGLES, 0, 3);
    }
}

#[cfg(test)]
mod tests {}
