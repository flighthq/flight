// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets, take native texture names and return Result diagnostics
//! Bokeh depth-of-field: a disc-shaped blur. When the scene supplied a sampleable depth texture
//! (`ctx.scene_depth_texture`), it computes a per-pixel circle of confusion from
//! focusDistance/focusRange and scales the disc radius by it (the real DoF). When depth is absent
//! it falls back to a uniform disc blur of radius maxBlur.
use flight_effects::{BokehDepthOfFieldEffect, Effect};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};
use glow::NativeTexture;

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::{uniform_1f, uniform_2f};

const BOKEH_DOF_FRAGMENT_SRC: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform float u_maxBlur;
uniform vec2 u_resolution;
uniform float u_focusDistance;
uniform float u_focusRange;
uniform float u_hasDepth;
out vec4 o_color;
void main() {
  vec2 texel = 1.0 / u_resolution;
  // Circle of confusion: with depth, blur scales by distance from the focus plane; without, full blur.
  float coc = 1.0;
  if (u_hasDepth > 0.5) {
    float depth = texture(u_texture1, v_texCoord).r;
    coc = clamp(abs(depth - u_focusDistance) / max(u_focusRange, 1e-4), 0.0, 1.0);
  }
  float blur = u_maxBlur * coc;
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int i = 0; i < 16; i++) {
    float a = float(i) * 0.39269908; // golden-ish angular step over the disc
    float r = (float(i % 4) + 1.0) * 0.25;
    vec2 offset = vec2(cos(a), sin(a)) * r * blur * texel;
    sum += texture(u_texture0, v_texCoord + offset);
    total += 1.0;
  }
  o_color = sum / total;
}"#;

pub fn apply_bokeh_depth_of_field_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    depth_texture: Option<NativeTexture>,
    effect: &BokehDepthOfFieldEffect,
) -> Result<(), String> {
    let max_blur = effect.max_blur.unwrap_or(4.0);
    let focus_distance = effect.focus_distance.unwrap_or(0.5);
    let focus_range = effect.focus_range.unwrap_or(0.2);
    let program = get_gl_effect_program(state, "lens.bokehDoF", BOKEH_DOF_FRAGMENT_SRC)?;
    let width = source.axes.width as f32;
    let height = source.axes.height as f32;
    let inputs: Vec<NativeTexture> = match depth_texture {
        Some(texture) => vec![source.texture, texture],
        None => vec![source.texture],
    };
    let has_input = if depth_texture.is_some() { 1.0 } else { 0.0 };
    return draw_gl_fullscreen_pass(state, &program, &inputs, Some(dest), |gl, p| {
        uniform_1f(gl, p, "u_maxBlur", max_blur);
        uniform_2f(gl, p, "u_resolution", width, height);
        uniform_1f(gl, p, "u_focusDistance", focus_distance);
        uniform_1f(gl, p, "u_focusRange", focus_range);
        uniform_1f(gl, p, "u_hasDepth", has_input);
    });
}

pub fn gl_bokeh_depth_of_field_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<BokehDepthOfFieldEffect>() else {
        return Ok(());
    };
    return apply_bokeh_depth_of_field_effect_to_gl(
        ctx.state,
        ctx.source,
        ctx.dest,
        ctx.scene_depth_texture,
        effect,
    );
}

pub fn register_gl_bokeh_depth_of_field_effect(state: &mut GlRenderState) {
    register_gl_effect(
        state,
        "BokehDepthOfFieldEffect",
        gl_bokeh_depth_of_field_effect_runner,
        None,
    );
}
