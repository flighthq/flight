//! Low-level GL draw utilities — blend modes, texture upload, quad dispatch.

use flighthq_types::blend::BlendMode;
use glow::HasContext;

use crate::render_state::{GlRenderState, bytemuck_f32};
use crate::shader::{GlBitmapShader, set_gl_attributes};

// Premultiplied-alpha normal compositing: source already premultiplied.
const NORMAL_BLEND: (u32, u32) = (glow::ONE, glow::ONE_MINUS_SRC_ALPHA);

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/// Applies the given blend mode to the current GL context, caching the state
/// to avoid redundant `glBlendFunc` calls.
pub fn apply_gl_blend_mode(state: &mut GlRenderState, blend_mode: Option<BlendMode>) {
    if blend_mode == state.runtime.current_blend_mode {
        return;
    }
    state.runtime.current_blend_mode = blend_mode;
    let (src, dst) = gl_blend_factors(blend_mode);
    unsafe {
        state.gl.blend_func(src, dst);
    }
}

/// Uploads or rebinds an image source as a GL texture, caching the handle.
///
/// On first encounter (a `version`/key not in the cache) the texture is
/// allocated with the filter and wrap settings from `state` and the pixel data
/// uploaded; subsequent calls rebind without re-uploading.
pub fn bind_gl_texture(
    state: &mut GlRenderState,
    image_data: &[u8],
    width: u32,
    height: u32,
    version: u64,
) -> glow::Texture {
    if let Some(&texture) = state.runtime.texture_cache.get(&version) {
        if state.runtime.current_texture != Some(texture) {
            unsafe {
                state.gl.bind_texture(glow::TEXTURE_2D, Some(texture));
            }
            state.runtime.current_texture = Some(texture);
        }
        return texture;
    }

    let filter = if state.render_state.allow_smoothing {
        glow::LINEAR
    } else {
        glow::NEAREST
    } as i32;
    let texture = unsafe {
        let texture = state.gl.create_texture().expect("create_texture");
        state.gl.bind_texture(glow::TEXTURE_2D, Some(texture));
        state
            .gl
            .tex_parameter_i32(glow::TEXTURE_2D, glow::TEXTURE_MIN_FILTER, filter);
        state
            .gl
            .tex_parameter_i32(glow::TEXTURE_2D, glow::TEXTURE_MAG_FILTER, filter);
        state.gl.tex_parameter_i32(
            glow::TEXTURE_2D,
            glow::TEXTURE_WRAP_S,
            glow::CLAMP_TO_EDGE as i32,
        );
        state.gl.tex_parameter_i32(
            glow::TEXTURE_2D,
            glow::TEXTURE_WRAP_T,
            glow::CLAMP_TO_EDGE as i32,
        );
        state.gl.tex_image_2d(
            glow::TEXTURE_2D,
            0,
            glow::RGBA as i32,
            width as i32,
            height as i32,
            0,
            glow::RGBA,
            glow::UNSIGNED_BYTE,
            Some(image_data),
        );
        texture
    };
    state.runtime.texture_cache.insert(version, texture);
    state.runtime.current_texture = Some(texture);
    texture
}

/// Allocates a new empty GL texture with the filter settings from `state`.
pub fn create_gl_texture(state: &mut GlRenderState) -> glow::Texture {
    let filter = if state.render_state.allow_smoothing {
        glow::LINEAR
    } else {
        glow::NEAREST
    } as i32;
    let texture = unsafe {
        let texture = state.gl.create_texture().expect("create_texture");
        state.gl.bind_texture(glow::TEXTURE_2D, Some(texture));
        state
            .gl
            .tex_parameter_i32(glow::TEXTURE_2D, glow::TEXTURE_MIN_FILTER, filter);
        state
            .gl
            .tex_parameter_i32(glow::TEXTURE_2D, glow::TEXTURE_MAG_FILTER, filter);
        state.gl.tex_parameter_i32(
            glow::TEXTURE_2D,
            glow::TEXTURE_WRAP_S,
            glow::CLAMP_TO_EDGE as i32,
        );
        state.gl.tex_parameter_i32(
            glow::TEXTURE_2D,
            glow::TEXTURE_WRAP_T,
            glow::CLAMP_TO_EDGE as i32,
        );
        texture
    };
    state.runtime.current_texture = Some(texture);
    texture
}

/// Draws a single UV-mapped quad (two triangles sharing an index buffer)
/// using the vertex buffer already bound on `state`.
#[allow(clippy::too_many_arguments)]
pub fn draw_gl_quad(
    state: &mut GlRenderState,
    x0: f32,
    y0: f32,
    x1: f32,
    y1: f32,
    u0: f32,
    v0: f32,
    u1: f32,
    v1: f32,
) {
    pack_gl_quad_vertices(
        &mut state.runtime.quad_vertex_data,
        x0,
        y0,
        x1,
        y1,
        u0,
        v0,
        u1,
        v1,
    );
    let vertex_data = state.runtime.quad_vertex_data;
    let vertex_buffer = state.runtime.quad_vertex_buffer;
    let index_buffer = state.runtime.quad_index_buffer;
    let loc = state.runtime.shader_loc.clone();
    unsafe {
        state.gl.bind_buffer(glow::ARRAY_BUFFER, vertex_buffer);
        state
            .gl
            .buffer_sub_data_u8_slice(glow::ARRAY_BUFFER, 0, bytemuck_f32(&vertex_data));
        state
            .gl
            .bind_buffer(glow::ELEMENT_ARRAY_BUFFER, index_buffer);
        if let Some(loc) = &loc {
            set_gl_attributes(&state.gl, loc);
        }
        state
            .gl
            .draw_elements(glow::TRIANGLES, 6, glow::UNSIGNED_SHORT, 0);
    }
}

/// Registers `apply_gl_blend_mode` as the active blend-mode handler on `state`.
///
/// In the TS port this assigns `state.applyBlendMode`. The Rust render path
/// calls `apply_gl_blend_mode` directly, so enabling support clears the cached
/// blend mode so the next apply is forced through.
pub fn enable_gl_blend_mode_support(state: &mut GlRenderState) {
    state.runtime.current_blend_mode = None;
}

/// Maps a blend-mode intent to the GL fixed-function `(src, dst)` blend factors
/// (premultiplied alpha) that realize it. Modes without a fixed-function
/// equivalent degrade to normal compositing. Pure CPU — the testable seam.
pub fn gl_blend_factors(blend_mode: Option<BlendMode>) -> (u32, u32) {
    match blend_mode {
        Some(BlendMode::Add) => (glow::ONE, glow::ONE),
        Some(BlendMode::Layer) | Some(BlendMode::Normal) | None => NORMAL_BLEND,
        // No fixed-function equivalent — degrade to normal compositing.
        Some(_) => NORMAL_BLEND,
    }
}

/// Sets the current program from `shader`, or from `state`'s default bitmap
/// shader when `shader` is `None`, skipping `glUseProgram` on redundant calls.
pub fn use_gl_program(state: &mut GlRenderState, shader: Option<&GlBitmapShader>) {
    let (locations, program) = match shader {
        Some(s) => (s.locations.clone(), s.program),
        None => {
            let s = state
                .runtime
                .default_bitmap_shader
                .as_ref()
                .expect("default bitmap shader");
            (s.locations.clone(), s.program)
        }
    };
    state.runtime.shader_loc = Some(locations);
    if state.runtime.current_program != Some(program) {
        unsafe {
            state.gl.use_program(Some(program));
        }
        state.runtime.current_program = Some(program);
    }
}

/// Uploads new pixel data into an already-allocated `texture`.
pub fn update_gl_texture(
    state: &mut GlRenderState,
    texture: glow::Texture,
    data: &[u8],
    width: u32,
    height: u32,
) {
    if state.runtime.current_texture != Some(texture) {
        unsafe {
            state.gl.bind_texture(glow::TEXTURE_2D, Some(texture));
        }
        state.runtime.current_texture = Some(texture);
    }
    unsafe {
        state.gl.tex_image_2d(
            glow::TEXTURE_2D,
            0,
            glow::RGBA as i32,
            width as i32,
            height as i32,
            0,
            glow::RGBA,
            glow::UNSIGNED_BYTE,
            Some(data),
        );
    }
}

/// Composites the cached texture registered under `texture_key` as a screen
/// quad sized `width` × `height`, using the default bitmap program and the
/// render state's current 2D transform and alpha.
///
/// Shared by the canvas-texture-backed renderers (shape, text, rich text,
/// video). No-op when no texture is cached for `texture_key` — the renderer's
/// upload path is responsible for populating the cache first.
pub fn composite_gl_cached_texture(
    state: &mut GlRenderState,
    texture_key: u64,
    width: f32,
    height: f32,
) {
    let texture = match state.runtime.texture_cache.get(&texture_key).copied() {
        Some(texture) => texture,
        None => return,
    };
    use_gl_program(state, None);
    apply_gl_blend_mode(state, state.render_state.render_blend_mode);

    let transform = state.render_state.render_transform_2d.unwrap_or_default();
    let alpha = state.render_state.render_alpha;
    let (vw, vh) = crate::shader::viewport_dimensions(state);
    let loc = state.runtime.shader_loc.clone();
    let mut m = state.runtime.matrix_array;
    unsafe {
        if state.runtime.current_texture != Some(texture) {
            state.gl.bind_texture(glow::TEXTURE_2D, Some(texture));
            state.runtime.current_texture = Some(texture);
        }
        if let Some(loc) = &loc {
            crate::shader::set_gl_matrix_from_transform(&state.gl, loc, &mut m, &transform, vw, vh);
            crate::shader::set_gl_base_uniforms(&state.gl, loc, alpha);
        }
    }
    state.runtime.matrix_array = m;
    draw_gl_quad(state, 0.0, 0.0, width, height, 0.0, 0.0, 1.0, 1.0);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Packs four interleaved (x, y, u, v) corners into the 16-float quad vertex
/// buffer in TL, TR, BR, BL order. Pure CPU seam.
#[allow(clippy::too_many_arguments)]
pub(crate) fn pack_gl_quad_vertices(
    v: &mut [f32; 16],
    x0: f32,
    y0: f32,
    x1: f32,
    y1: f32,
    u0: f32,
    v0: f32,
    u1: f32,
    v1: f32,
) {
    v[0] = x0;
    v[1] = y0;
    v[2] = u0;
    v[3] = v0;
    v[4] = x1;
    v[5] = y0;
    v[6] = u1;
    v[7] = v0;
    v[8] = x1;
    v[9] = y1;
    v[10] = u1;
    v[11] = v1;
    v[12] = x0;
    v[13] = y1;
    v[14] = u0;
    v[15] = v1;
}

#[cfg(test)]
mod tests {
    use super::*;

    // gl_blend_factors

    #[test]
    fn gl_blend_factors_add_uses_additive() {
        assert_eq!(
            gl_blend_factors(Some(BlendMode::Add)),
            (glow::ONE, glow::ONE)
        );
    }

    #[test]
    fn gl_blend_factors_normal_and_layer_use_premultiplied_over() {
        assert_eq!(gl_blend_factors(Some(BlendMode::Normal)), NORMAL_BLEND);
        assert_eq!(gl_blend_factors(Some(BlendMode::Layer)), NORMAL_BLEND);
        assert_eq!(gl_blend_factors(None), NORMAL_BLEND);
    }

    #[test]
    fn gl_blend_factors_unsupported_modes_degrade_to_normal() {
        for mode in [
            BlendMode::Multiply,
            BlendMode::Screen,
            BlendMode::Darken,
            BlendMode::Difference,
            BlendMode::Erase,
            BlendMode::Shader,
        ] {
            assert_eq!(gl_blend_factors(Some(mode)), NORMAL_BLEND);
        }
    }

    // pack_gl_quad_vertices

    #[test]
    fn pack_gl_quad_vertices_lays_out_four_corners() {
        let mut v = [0.0_f32; 16];
        pack_gl_quad_vertices(&mut v, 0.0, 0.0, 10.0, 20.0, 0.0, 0.0, 1.0, 1.0);
        assert_eq!(&v[0..4], &[0.0, 0.0, 0.0, 0.0]); // TL
        assert_eq!(&v[4..8], &[10.0, 0.0, 1.0, 0.0]); // TR
        assert_eq!(&v[8..12], &[10.0, 20.0, 1.0, 1.0]); // BR
        assert_eq!(&v[12..16], &[0.0, 20.0, 0.0, 1.0]); // BL
    }
}
