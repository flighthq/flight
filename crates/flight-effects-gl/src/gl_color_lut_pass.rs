// flight-lint: allow-file(contract-vocabulary) D17 color passes accept native glow targets, texture names and Result diagnostics
//! Generic pointwise color-LUT pass — the single fold-in realization for the whole LUT-tier
//! Adjustment family. A run of consecutive pointwise adjustments containing any nonlinear member
//! bakes to ONE 3D `ColorLut` (matrices folded in) and runs through this one trilinear pass. The LUT
//! is uploaded as a `size³` RGBA8 3D texture; hardware LINEAR filtering does the trilinear
//! interpolation. `cache` owns the uploaded 3D texture across frames; the LUT is re-uploaded only
//! when it differs from the last one baked into `cache`, so a static grade uploads once.

use flight_adjustments::ColorLut;
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};
use glow::{HasContext, NativeTexture};

use crate::contract::GlColorLutTextureCache;
use crate::gl_effect_program_cache::get_gl_effect_program;
use crate::gl_effect_support::{uniform_1f, uniform_1i};

// Half-texel scale/offset maps the [0,1] color to LUT cell centres, so v=0 hits cell 0 and v=1 the last.
const COLOR_LUT_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler3D u_lut;
uniform float u_lutSize;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float scale = (u_lutSize - 1.0) / u_lutSize;
  float offset = 0.5 / u_lutSize;
  vec3 lc = clamp(c.rgb, 0.0, 1.0) * scale + offset;
  o_color = vec4(texture(u_lut, lc).rgb, c.a);
}"#;

pub fn apply_color_lut_pass_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    lut: &ColorLut,
    cache: &mut GlColorLutTextureCache,
) -> Result<(), String> {
    let size = lut.size as f32;
    let texture = upload_lut_texture(&state.gl, lut, cache)?;
    let program = get_gl_effect_program(state, "adjustment.colorLut", COLOR_LUT_FRAGMENT_SRC)?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_1f(gl, p, "u_lutSize", size);
        // SAFETY: unit 1 is bound for this draw only; the pass resets the active unit to 0.
        unsafe {
            gl.active_texture(glow::TEXTURE1);
            gl.bind_texture(glow::TEXTURE_3D, Some(texture));
        }
        uniform_1i(gl, p, "u_lut", 1);
        // SAFETY: restores the default active unit.
        unsafe { gl.active_texture(glow::TEXTURE0) };
    });
}

fn clamp01(v: f32) -> f32 {
    return v.clamp(0.0, 1.0);
}

/// Uploads `lut` into the cache's reusable 3D texture (RGBA8, LINEAR, clamp-to-edge) and returns it.
/// The upload is skipped when `lut` equals the LUT already baked into the texture. TS compares the
/// LUT by identity (the bake cache returns a stable reference); Rust's `ColorLut` is a value, so the
/// memo compares its content, which is the same "unchanged run" condition.
fn upload_lut_texture(
    gl: &glow::Context,
    lut: &ColorLut,
    cache: &mut GlColorLutTextureCache,
) -> Result<NativeTexture, String> {
    if let Some(texture) = cache.texture
        && cache
            .lut
            .as_ref()
            .is_some_and(|cached| cached.size == lut.size && cached.samples == lut.samples)
    {
        return Ok(texture);
    }
    let n = lut.size as usize;
    let samples = &lut.samples;
    let mut data = vec![0_u8; n * n * n * 4];
    let mut j = 0;
    let mut o = 0;
    for _ in 0..n * n * n {
        data[o] = (clamp01(samples[j]) * 255.0).round() as u8;
        data[o + 1] = (clamp01(samples[j + 1]) * 255.0).round() as u8;
        data[o + 2] = (clamp01(samples[j + 2]) * 255.0).round() as u8;
        data[o + 3] = 255;
        j += 3;
        o += 4;
    }
    let texture = match cache.texture {
        Some(texture) => texture,
        None => {
            // SAFETY: texture allocation happens on the owning GL thread.
            let texture = unsafe { gl.create_texture() }
                .map_err(|error| format!("applyColorLutPassToGl: {error}"))?;
            cache.texture = Some(texture);
            texture
        }
    };
    let size = lut.size as i32;
    // SAFETY: the 3D texture is bound for upload and unbound before returning.
    unsafe {
        gl.bind_texture(glow::TEXTURE_3D, Some(texture));
        gl.tex_image_3d(
            glow::TEXTURE_3D,
            0,
            glow::RGBA8 as i32,
            size,
            size,
            size,
            0,
            glow::RGBA,
            glow::UNSIGNED_BYTE,
            glow::PixelUnpackData::Slice(Some(&data)),
        );
        gl.tex_parameter_i32(
            glow::TEXTURE_3D,
            glow::TEXTURE_MIN_FILTER,
            glow::LINEAR as i32,
        );
        gl.tex_parameter_i32(
            glow::TEXTURE_3D,
            glow::TEXTURE_MAG_FILTER,
            glow::LINEAR as i32,
        );
        gl.tex_parameter_i32(
            glow::TEXTURE_3D,
            glow::TEXTURE_WRAP_S,
            glow::CLAMP_TO_EDGE as i32,
        );
        gl.tex_parameter_i32(
            glow::TEXTURE_3D,
            glow::TEXTURE_WRAP_T,
            glow::CLAMP_TO_EDGE as i32,
        );
        gl.tex_parameter_i32(
            glow::TEXTURE_3D,
            glow::TEXTURE_WRAP_R,
            glow::CLAMP_TO_EDGE as i32,
        );
        gl.bind_texture(glow::TEXTURE_3D, None);
    }
    cache.lut = Some(lut.clone());
    return Ok(texture);
}
