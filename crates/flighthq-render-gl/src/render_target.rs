//! GL render target — creation, composition, and lifecycle.

use flighthq_types::geometry::Matrix;
use glow::HasContext;

use crate::draw::{apply_gl_blend_mode, draw_gl_quad, use_gl_program};
use crate::render_state::{
    GlRenderState, GlRenderTarget, GlRenderTargetFormat, GlRenderTargetSave, GlViewport,
};
use crate::shader::{set_gl_base_uniforms, set_gl_matrix_from_transform, viewport_dimensions};

/// A 2D render proxy carrying world transform and alpha for a composited node.
pub struct GlRenderProxy2D<'a> {
    pub alpha: f32,
    pub blend_mode: Option<flighthq_types::blend::BlendMode>,
    pub transform_2d: &'a Matrix,
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Redirects subsequent GL rendering into `target`'s framebuffer.
///
/// Saves the current framebuffer binding, viewport, and render transform so
/// they can be fully restored by `end_gl_render_target`. Supports nesting.
pub fn begin_gl_render_target(
    state: &mut GlRenderState,
    target: &GlRenderTarget,
    render_transform: &Matrix,
) {
    state.runtime.render_target_stack.push(GlRenderTargetSave {
        framebuffer: state.runtime.current_framebuffer,
        viewport: state.runtime.render_target_viewport,
        render_transform: state.render_state.render_transform_2d,
    });
    unsafe {
        state
            .gl
            .bind_framebuffer(glow::FRAMEBUFFER, Some(target.framebuffer));
        state
            .gl
            .viewport(0, 0, target.width as i32, target.height as i32);
    }
    state.runtime.current_framebuffer = Some(target.framebuffer);
    state.runtime.render_target_viewport = Some(GlViewport {
        width: target.width,
        height: target.height,
    });
    state.render_state.render_transform_2d = Some(*render_transform);
}

/// Allocates a render target of `width` × `height` in `format`.
///
/// For MSAA targets (`sample_count > 1`) this also creates the resolve
/// framebuffer; call `resolve_gl_render_target` after the scene is drawn.
pub fn create_gl_render_target(
    state: &mut GlRenderState,
    width: u32,
    height: u32,
    format: GlRenderTargetFormat,
    sample_count: u32,
) -> GlRenderTarget {
    let internal_format = gl_internal_format(format);
    unsafe {
        let gl = &state.gl;
        let texture = gl.create_texture().expect("create rt texture");
        gl.bind_texture(glow::TEXTURE_2D, Some(texture));
        gl.tex_image_2d(
            glow::TEXTURE_2D,
            0,
            internal_format as i32,
            width as i32,
            height as i32,
            0,
            glow::RGBA,
            gl_pixel_type(format),
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

        let framebuffer = gl.create_framebuffer().expect("create rt framebuffer");
        let mut color_renderbuffers = Vec::new();
        let mut resolve_framebuffer = None;

        if sample_count > 1 {
            // MSAA: multisample color renderbuffer in `framebuffer`, single-sample
            // resolve texture in `resolve_framebuffer`.
            let rb = gl.create_renderbuffer().expect("create msaa renderbuffer");
            gl.bind_renderbuffer(glow::RENDERBUFFER, Some(rb));
            gl.renderbuffer_storage_multisample(
                glow::RENDERBUFFER,
                sample_count as i32,
                internal_format,
                width as i32,
                height as i32,
            );
            gl.bind_framebuffer(glow::FRAMEBUFFER, Some(framebuffer));
            gl.framebuffer_renderbuffer(
                glow::FRAMEBUFFER,
                glow::COLOR_ATTACHMENT0,
                glow::RENDERBUFFER,
                Some(rb),
            );
            color_renderbuffers.push(rb);

            let resolve = gl.create_framebuffer().expect("create resolve framebuffer");
            gl.bind_framebuffer(glow::FRAMEBUFFER, Some(resolve));
            gl.framebuffer_texture_2d(
                glow::FRAMEBUFFER,
                glow::COLOR_ATTACHMENT0,
                glow::TEXTURE_2D,
                Some(texture),
                0,
            );
            resolve_framebuffer = Some(resolve);
        } else {
            gl.bind_framebuffer(glow::FRAMEBUFFER, Some(framebuffer));
            gl.framebuffer_texture_2d(
                glow::FRAMEBUFFER,
                glow::COLOR_ATTACHMENT0,
                glow::TEXTURE_2D,
                Some(texture),
                0,
            );
        }

        // Restore the previously bound framebuffer.
        gl.bind_framebuffer(glow::FRAMEBUFFER, state.runtime.current_framebuffer);

        GlRenderTarget {
            width,
            height,
            format,
            sample_count,
            framebuffer,
            resolve_framebuffer,
            textures: vec![texture],
            texture,
            depth_texture: None,
            color_renderbuffers,
            depth_stencil_renderbuffer: None,
        }
    }
}

/// Frees all GL resources owned by `target`. The target must not be used after
/// this call.
pub fn destroy_gl_render_target(state: &GlRenderState, target: GlRenderTarget) {
    unsafe {
        state.gl.delete_framebuffer(target.framebuffer);
        if let Some(resolve) = target.resolve_framebuffer {
            state.gl.delete_framebuffer(resolve);
        }
        for texture in target.textures {
            state.gl.delete_texture(texture);
        }
        if let Some(depth) = target.depth_texture {
            state.gl.delete_texture(depth);
        }
        for rb in target.color_renderbuffers {
            state.gl.delete_renderbuffer(rb);
        }
        if let Some(rb) = target.depth_stencil_renderbuffer {
            state.gl.delete_renderbuffer(rb);
        }
    }
}

/// Composites `target`'s texture onto the current framebuffer as a positioned
/// quad, using `render_proxy`'s world transform and alpha.
///
/// V coordinates are flipped (`v0=1, v1=0`) to account for GL's bottom-left
/// origin.
pub fn draw_gl_render_target_result(
    state: &mut GlRenderState,
    render_proxy: &GlRenderProxy2D<'_>,
    target: &GlRenderTarget,
    transform: &Matrix,
) {
    use_gl_program(state, None);
    apply_gl_blend_mode(state, render_proxy.blend_mode);
    let texture = target.texture;
    let (vw, vh) = viewport_dimensions(state);
    let loc = state.runtime.shader_loc.clone();
    let mut m = state.runtime.matrix_array;
    let alpha = render_proxy.alpha;
    unsafe {
        if state.runtime.current_texture != Some(texture) {
            state.gl.bind_texture(glow::TEXTURE_2D, Some(texture));
            state.runtime.current_texture = Some(texture);
        }
        if let Some(loc) = &loc {
            set_gl_matrix_from_transform(&state.gl, loc, &mut m, transform, vw, vh);
            set_gl_base_uniforms(&state.gl, loc, alpha);
        }
    }
    state.runtime.matrix_array = m;
    // V flipped for GL's bottom-left texture origin.
    draw_gl_quad(
        state,
        0.0,
        0.0,
        target.width as f32,
        target.height as f32,
        0.0,
        1.0,
        1.0,
        0.0,
    );
}

/// Restores the framebuffer, viewport, and render transform saved by the
/// matching `begin_gl_render_target` call.
pub fn end_gl_render_target(state: &mut GlRenderState) {
    let save = match state.runtime.render_target_stack.pop() {
        Some(save) => save,
        None => return,
    };
    state.runtime.current_framebuffer = save.framebuffer;
    state.runtime.render_target_viewport = save.viewport;
    state.render_state.render_transform_2d = save.render_transform;
    let (vw, vh) = viewport_dimensions(state);
    unsafe {
        state
            .gl
            .bind_framebuffer(glow::FRAMEBUFFER, save.framebuffer);
        state.gl.viewport(0, 0, vw as i32, vh as i32);
    }
}

/// Reallocates the storage backing `target` to the new pixel dimensions,
/// preserving its format and sample count.
pub fn resize_gl_render_target(
    state: &mut GlRenderState,
    target: &mut GlRenderTarget,
    width: u32,
    height: u32,
) {
    let internal_format = gl_internal_format(target.format);
    let pixel_type = gl_pixel_type(target.format);
    unsafe {
        state
            .gl
            .bind_texture(glow::TEXTURE_2D, Some(target.texture));
        state.gl.tex_image_2d(
            glow::TEXTURE_2D,
            0,
            internal_format as i32,
            width as i32,
            height as i32,
            0,
            glow::RGBA,
            pixel_type,
            None,
        );
        for &rb in &target.color_renderbuffers {
            state.gl.bind_renderbuffer(glow::RENDERBUFFER, Some(rb));
            state.gl.renderbuffer_storage_multisample(
                glow::RENDERBUFFER,
                target.sample_count as i32,
                internal_format,
                width as i32,
                height as i32,
            );
        }
    }
    target.width = width;
    target.height = height;
}

/// Resolves an MSAA target's multisample framebuffer into its single-sample
/// resolve texture via `blitFramebuffer`. No-op when `sample_count == 1`.
pub fn resolve_gl_render_target(state: &mut GlRenderState, target: &GlRenderTarget) {
    let resolve = match target.resolve_framebuffer {
        Some(resolve) if target.sample_count > 1 => resolve,
        _ => return,
    };
    unsafe {
        state
            .gl
            .bind_framebuffer(glow::READ_FRAMEBUFFER, Some(target.framebuffer));
        state
            .gl
            .bind_framebuffer(glow::DRAW_FRAMEBUFFER, Some(resolve));
        state.gl.blit_framebuffer(
            0,
            0,
            target.width as i32,
            target.height as i32,
            0,
            0,
            target.width as i32,
            target.height as i32,
            glow::COLOR_BUFFER_BIT,
            glow::NEAREST,
        );
        state
            .gl
            .bind_framebuffer(glow::FRAMEBUFFER, state.runtime.current_framebuffer);
    }
}

// ---------------------------------------------------------------------------
// Internal helpers — format mapping (pure CPU seam).
// ---------------------------------------------------------------------------

/// Maps a `GlRenderTargetFormat` to its GL sized internal format. Pure CPU.
pub fn gl_internal_format(format: GlRenderTargetFormat) -> u32 {
    match format {
        GlRenderTargetFormat::Rgba8 => glow::RGBA8,
        GlRenderTargetFormat::Rgba16F => glow::RGBA16F,
        GlRenderTargetFormat::Rgba32F => glow::RGBA32F,
    }
}

/// Maps a `GlRenderTargetFormat` to the pixel transfer type for `tex_image_2d`.
pub fn gl_pixel_type(format: GlRenderTargetFormat) -> u32 {
    match format {
        GlRenderTargetFormat::Rgba8 => glow::UNSIGNED_BYTE,
        GlRenderTargetFormat::Rgba16F => glow::HALF_FLOAT,
        GlRenderTargetFormat::Rgba32F => glow::FLOAT,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // gl_internal_format

    #[test]
    fn gl_internal_format_maps_each_variant() {
        assert_eq!(gl_internal_format(GlRenderTargetFormat::Rgba8), glow::RGBA8);
        assert_eq!(
            gl_internal_format(GlRenderTargetFormat::Rgba16F),
            glow::RGBA16F
        );
        assert_eq!(
            gl_internal_format(GlRenderTargetFormat::Rgba32F),
            glow::RGBA32F
        );
    }

    // gl_pixel_type

    #[test]
    fn gl_pixel_type_maps_each_variant() {
        assert_eq!(
            gl_pixel_type(GlRenderTargetFormat::Rgba8),
            glow::UNSIGNED_BYTE
        );
        assert_eq!(
            gl_pixel_type(GlRenderTargetFormat::Rgba16F),
            glow::HALF_FLOAT
        );
        assert_eq!(gl_pixel_type(GlRenderTargetFormat::Rgba32F), glow::FLOAT);
    }
}
