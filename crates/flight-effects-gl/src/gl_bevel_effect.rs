// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Bevel composite effect: blur the silhouette into a height field, then light it from the
//! angle/distance offset with the highlight and shadow colors, clipped by bevel type. Full-frame
//! realization: acquires the recipe's three scratch targets from the effect pool, runs the inlined
//! multi-pass recipe, then releases them.

use flight_color::{get_color_alpha, get_color_rgb};
use flight_effects::{BevelEffect, BevelType, Effect, EffectSourceMode};
use flight_render_gl::{
    GlRenderState, GlTextureRenderTarget, GlTextureRenderTargetPool, RenderTargetClear,
    clear_gl_render_target, draw_gl_fullscreen_pass, release_gl_texture_render_target,
};

use crate::contract::{
    GlEffectBoxBlurOptions, GlEffectContext, apply_gl_effect_blit_pass, apply_gl_effect_box_blur,
    apply_gl_effect_erase_pass, apply_gl_effect_tint_pass, register_gl_effect,
};
use crate::gl_effect_support::{
    acquire_gl_effect_target, get_gl_effect_shader, set_uniform_1f, set_uniform_2f, set_uniform_4f,
    uniform_location,
};

const BEVEL_COMPOSITE_FRAGMENT_SRC: &str = r#"#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform vec4 u_highlight;
uniform vec4 u_shadow;
uniform vec2 u_offset;
uniform float u_intensity;
uniform float u_clipMode;
out vec4 fragColor;

float sampleField(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return texture(u_texture0, uv).a;
}

void main() {
  float lit = sampleField(v_texCoord - u_offset);
  float shade = sampleField(v_texCoord + u_offset);
  float gradient = lit - shade;
  float srcA = texture(u_texture1, v_texCoord).a;
  bool isHighlight = gradient >= 0.0;
  vec3 color = isHighlight ? u_highlight.rgb : u_shadow.rgb;
  float colorAlpha = isHighlight ? u_highlight.a : u_shadow.a;
  float clip = 1.0;
  if (u_clipMode == 1.0) { clip = srcA; }
  else if (u_clipMode == 2.0) { clip = 1.0 - srcA; }
  float edge = min(1.0, abs(gradient) * u_intensity);
  float a = edge * colorAlpha * clip;
  fragColor = vec4(color * a, a);
}"#;

struct BevelCompositeParams {
    offset_x: f32,
    offset_y: f32,
    highlight_color: u32,
    highlight_alpha: f32,
    shadow_color: u32,
    shadow_alpha: f32,
    intensity: f32,
    clip_mode: f32,
}

pub fn apply_bevel_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    pool: &mut GlTextureRenderTargetPool,
    effect: &BevelEffect,
) -> Result<(), String> {
    let s0 = acquire_gl_effect_target(state, pool, source)?;
    let s1 = acquire_gl_effect_target(state, pool, source)?;
    let s2 = acquire_gl_effect_target(state, pool, source)?;

    let angle = effect.angle.unwrap_or(45.0) * std::f32::consts::PI / 180.0;
    let distance = effect.distance.unwrap_or(4.0);
    let offset_x = round_half_up(angle.cos() * distance);
    let offset_y = round_half_up(angle.sin() * distance);
    let shadow_packed = effect.shadow_color.unwrap_or(0x000000ff);
    let shadow_color = get_color_rgb(shadow_packed);
    let shadow_alpha = effect.shadow_alpha.unwrap_or(1.0) * get_color_alpha(shadow_packed);
    let highlight_packed = effect.highlight_color.unwrap_or(0xffffffff);
    let highlight_color = get_color_rgb(highlight_packed);
    let highlight_alpha = effect.highlight_alpha.unwrap_or(1.0) * get_color_alpha(highlight_packed);
    let strength = effect.strength.unwrap_or(1.0);
    let quality = effect.quality.unwrap_or(1.0).round().max(1.0);
    let source_mode = effect.source_mode.unwrap_or(EffectSourceMode::Draw);
    let bevel_type = effect.bevel_type.unwrap_or(BevelType::Inner);

    let (tinted, blurred, blur_temp) = (&s0, &s1, &s2);
    let result = (|| -> Result<(), String> {
        apply_gl_effect_tint_pass(state, source, tinted, 0xffffffff, 1.0, 1.0)?;
        apply_gl_effect_box_blur(
            state,
            tinted,
            blurred,
            blur_temp,
            &GlEffectBoxBlurOptions {
                blur_x: Some(effect.blur_x.unwrap_or(4.0)),
                blur_y: Some(effect.blur_y.unwrap_or(4.0)),
                passes: Some(quality),
                edge_color: None,
            },
        )?;

        clear_gl_render_target(
            dest,
            &RenderTargetClear {
                color: Some([0.0, 0.0, 0.0, 0.0]),
                colors: None,
                depth: None,
                stencil: None,
            },
        );
        if source_mode == EffectSourceMode::Draw {
            apply_gl_effect_blit_pass(state, source, dest)?;
        }

        apply_gl_bevel_composite_pass(
            state,
            blurred,
            source,
            dest,
            &BevelCompositeParams {
                offset_x: offset_x / source.axes.width as f32,
                offset_y: -offset_y / source.axes.height as f32,
                highlight_color,
                highlight_alpha,
                shadow_color,
                shadow_alpha,
                intensity: strength,
                clip_mode: match bevel_type {
                    BevelType::Inner => 1.0,
                    BevelType::Outer => 2.0,
                    BevelType::Full => 0.0,
                },
            },
        )?;

        if source_mode == EffectSourceMode::Knockout {
            apply_gl_effect_erase_pass(state, source, dest)?;
        }
        return Ok(());
    })();

    release_gl_texture_render_target(pool, s0);
    release_gl_texture_render_target(pool, s1);
    release_gl_texture_render_target(pool, s2);
    return result;
}

fn apply_gl_bevel_composite_pass(
    state: &mut GlRenderState,
    field: &GlTextureRenderTarget,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    params: &BevelCompositeParams,
) -> Result<(), String> {
    let program = get_gl_effect_shader(state, "bevel.composite", BEVEL_COMPOSITE_FRAGMENT_SRC)?;
    let loc_highlight = uniform_location(&state.gl, &program, "u_highlight");
    let loc_shadow = uniform_location(&state.gl, &program, "u_shadow");
    let loc_offset = uniform_location(&state.gl, &program, "u_offset");
    let loc_intensity = uniform_location(&state.gl, &program, "u_intensity");
    let loc_clip_mode = uniform_location(&state.gl, &program, "u_clipMode");
    return draw_gl_fullscreen_pass(
        state,
        &program,
        &[field.texture, source.texture],
        Some(dest),
        |gl, _p| {
            set_uniform_4f(
                gl,
                loc_highlight.as_ref(),
                ((params.highlight_color >> 16) & 0xff) as f32 / 255.0,
                ((params.highlight_color >> 8) & 0xff) as f32 / 255.0,
                (params.highlight_color & 0xff) as f32 / 255.0,
                params.highlight_alpha,
            );
            set_uniform_4f(
                gl,
                loc_shadow.as_ref(),
                ((params.shadow_color >> 16) & 0xff) as f32 / 255.0,
                ((params.shadow_color >> 8) & 0xff) as f32 / 255.0,
                (params.shadow_color & 0xff) as f32 / 255.0,
                params.shadow_alpha,
            );
            set_uniform_2f(gl, loc_offset.as_ref(), params.offset_x, params.offset_y);
            set_uniform_1f(gl, loc_intensity.as_ref(), params.intensity);
            set_uniform_1f(gl, loc_clip_mode.as_ref(), params.clip_mode);
        },
    );
}

pub fn gl_bevel_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<BevelEffect>() else {
        return Ok(());
    };
    return apply_bevel_effect_to_gl(ctx.state, ctx.source, ctx.dest, ctx.pool, effect);
}

pub fn register_gl_bevel_effect(state: &mut GlRenderState) {
    register_gl_effect(state, "BevelEffect", gl_bevel_effect_runner, None);
}

/// JS `Math.round`: halves round toward +infinity.
fn round_half_up(value: f32) -> f32 {
    return (value + 0.5).floor();
}
