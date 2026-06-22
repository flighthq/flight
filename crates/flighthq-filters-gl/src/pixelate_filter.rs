//! Pixelate GL filter pass.
//!
//! Averages each block of `filter.block_size` pixels into a single flat color.
//! A single GPU pass — no scratch targets needed.

use flighthq_filters::PixelateFilter;
use glow::HasContext;

use crate::filter_pass::{GlFullscreenProgram, draw_gl_fullscreen_pass, get_gl_filter_program};
use crate::{GlRenderState, GlRenderTarget};

const PIXELATE_FRAGMENT_SRC: &str = "#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture;
uniform vec2 u_blockTexelSize;
out vec4 fragColor;
void main() {
  vec2 block = floor(v_texCoord / u_blockTexelSize) * u_blockTexelSize;
  vec2 center = block + u_blockTexelSize * 0.5;
  fragColor = texture(u_texture, clamp(center, vec2(0.0), vec2(1.0)));
}";

/// Pixelates `source` into `dest`.
pub fn apply_pixelate_filter_to_gl(
    state: &GlRenderState,
    source: &GlRenderTarget,
    dest: &GlRenderTarget,
    filter: &PixelateFilter,
) {
    let block_size = filter.block_size.unwrap_or(8.0).max(1.0);
    let (bx, by) = (
        block_size / source.width as f32,
        block_size / source.height as f32,
    );
    let program = get_pixelate_shader(state);
    draw_gl_fullscreen_pass(
        state,
        program,
        &[source.texture],
        Some(dest),
        move |gl, p| unsafe {
            gl.uniform_2_f32(
                gl.get_uniform_location(p, "u_blockTexelSize").as_ref(),
                bx,
                by,
            );
        },
    );
}

/// Returns the pixelate shader program for `state`, compiling on first use.
pub fn get_pixelate_shader(state: &GlRenderState) -> &GlFullscreenProgram {
    get_gl_filter_program(state, PIXELATE_FRAGMENT_SRC, |p| &mut p.pixelate)
}

#[cfg(test)]
mod tests {
    use super::*;

    // PIXELATE_FRAGMENT_SRC

    #[test]
    fn pixelate_fragment_src_snaps_to_block_centers() {
        assert!(PIXELATE_FRAGMENT_SRC.contains("floor(v_texCoord / u_blockTexelSize)"));
        assert!(PIXELATE_FRAGMENT_SRC.contains("u_blockTexelSize * 0.5"));
    }
}
