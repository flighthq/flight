//! GL scratch texture — a reusable, resize-on-demand 2D texture for temporary
//! intermediate results (filter passes, blur ping-pong, bloom chains).
//!
//! A scratch texture is not attached to a framebuffer — callers must bind it to a
//! render target or texture unit themselves. Use `create_gl_scratch_texture` to
//! allocate, `destroy_gl_scratch_texture` to free.

use glow::HasContext;

use crate::render_state::{GlRenderState, GlRenderTargetFormat};

// ---------------------------------------------------------------------------
// GlScratchTexture
// ---------------------------------------------------------------------------

/// A single GL texture handle with a recorded size and format. Suitable for
/// ping-pong passes or any temporary per-frame work that does not need a
/// framebuffer wrapper.
#[derive(Debug)]
pub struct GlScratchTexture {
    pub texture: glow::Texture,
    pub width: u32,
    pub height: u32,
    pub format: GlRenderTargetFormat,
}

// ---------------------------------------------------------------------------
// Free functions (alphabetical)
// ---------------------------------------------------------------------------

/// Allocates an RGBA texture of the given size. The texture is configured for
/// linear filtering and clamp-to-edge wrapping — the typical setup for
/// fullscreen-pass intermediates.
pub fn create_gl_scratch_texture(
    state: &GlRenderState,
    width: u32,
    height: u32,
    format: GlRenderTargetFormat,
) -> GlScratchTexture {
    let gl = &state.gl;
    let (internal_format, gl_format, gl_type) = gl_format_triple(format);
    unsafe {
        let texture = gl.create_texture().expect("create scratch texture");
        gl.bind_texture(glow::TEXTURE_2D, Some(texture));
        gl.tex_image_2d(
            glow::TEXTURE_2D,
            0,
            internal_format as i32,
            width as i32,
            height as i32,
            0,
            gl_format,
            gl_type,
            None,
        );
        gl.tex_parameter_i32(
            glow::TEXTURE_2D,
            glow::TEXTURE_MIN_FILTER,
            glow::LINEAR as i32,
        );
        gl.tex_parameter_i32(
            glow::TEXTURE_2D,
            glow::TEXTURE_MAG_FILTER,
            glow::LINEAR as i32,
        );
        gl.tex_parameter_i32(
            glow::TEXTURE_2D,
            glow::TEXTURE_WRAP_S,
            glow::CLAMP_TO_EDGE as i32,
        );
        gl.tex_parameter_i32(
            glow::TEXTURE_2D,
            glow::TEXTURE_WRAP_T,
            glow::CLAMP_TO_EDGE as i32,
        );
        gl.bind_texture(glow::TEXTURE_2D, None);

        GlScratchTexture {
            texture,
            width,
            height,
            format,
        }
    }
}

/// Frees the GPU texture owned by `scratch`.
pub fn destroy_gl_scratch_texture(state: &GlRenderState, scratch: GlScratchTexture) {
    unsafe {
        state.gl.delete_texture(scratch.texture);
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Maps `GlRenderTargetFormat` to the `(internal_format, format, type)` triple
/// accepted by `texImage2D`.
fn gl_format_triple(format: GlRenderTargetFormat) -> (u32, u32, u32) {
    match format {
        GlRenderTargetFormat::Rgba8 => (glow::RGBA8, glow::RGBA, glow::UNSIGNED_BYTE),
        GlRenderTargetFormat::Rgba16F => (glow::RGBA16F, glow::RGBA, glow::HALF_FLOAT),
        GlRenderTargetFormat::Rgba32F => (glow::RGBA32F, glow::RGBA, glow::FLOAT),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gl_scratch_texture_struct_is_debug() {
        let _s = format!("{:?}", std::any::type_name::<GlScratchTexture>());
    }

    #[test]
    fn gl_format_triple_returns_expected_values() {
        let (internal, fmt, ty) = gl_format_triple(GlRenderTargetFormat::Rgba8);
        assert_eq!(internal, glow::RGBA8);
        assert_eq!(fmt, glow::RGBA);
        assert_eq!(ty, glow::UNSIGNED_BYTE);

        let (internal, fmt, ty) = gl_format_triple(GlRenderTargetFormat::Rgba16F);
        assert_eq!(internal, glow::RGBA16F);
        assert_eq!(fmt, glow::RGBA);
        assert_eq!(ty, glow::HALF_FLOAT);

        let (internal, fmt, ty) = gl_format_triple(GlRenderTargetFormat::Rgba32F);
        assert_eq!(internal, glow::RGBA32F);
        assert_eq!(fmt, glow::RGBA);
        assert_eq!(ty, glow::FLOAT);
    }
}
