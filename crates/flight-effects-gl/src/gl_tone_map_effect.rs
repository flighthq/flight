// flight-lint: allow-file(contract-vocabulary) D17 GL effect recipes draw native glow targets and return Result diagnostics
//! Tone map: compress HDR to displayable range via the selected operator. Single-pass reference
//! recipe. Each operator compiles its own program, keyed `toneMap.<operator>`.

use flight_effects::{Effect, ToneMapEffect, ToneMapOperator};
use flight_render_gl::{GlRenderState, GlTextureRenderTarget, draw_gl_fullscreen_pass};

use crate::contract::{GlEffectContext, get_gl_effect_program, register_gl_effect};
use crate::gl_effect_support::uniform_1f;

const TONEMAP_FRAGMENT_HEAD: &str = r#"#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_exposure;
uniform float u_white;
out vec4 o_color;
vec3 tonemap(vec3 x) {"#;

const TONEMAP_FRAGMENT_TAIL: &str = r#"}
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec3 mapped = tonemap(c.rgb * u_exposure);
  o_color = vec4(clamp(mapped, 0.0, 1.0), c.a);
}"#;

const TONEMAP_OPERATOR_ACES: &str = r#"
  vec3 a = x * (2.51 * x + 0.03);
  vec3 b = x * (2.43 * x + 0.59) + 0.14;
  return a / b;"#;

const TONEMAP_OPERATOR_AGX: &str = r#"
  vec3 v = clamp((x - 0.004) / (1.0 + x), 0.0, 1.0);
  return pow(v, vec3(0.8));"#;

const TONEMAP_OPERATOR_FILMIC: &str = r#"
  vec3 X = max(vec3(0.0), x - 0.004);
  return (X * (6.2 * X + 0.5)) / (X * (6.2 * X + 1.7) + 0.06);"#;

const TONEMAP_OPERATOR_REINHARD: &str = r#"
  return x / (1.0 + x / (u_white * u_white));"#;

const TONEMAP_OPERATOR_UNCHARTED2: &str = r#"
  float A = 0.15, B = 0.50, C = 0.10, D = 0.20, E = 0.02, F = 0.30;
  vec3 v = ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
  return v;"#;

pub fn apply_tone_map_effect_to_gl(
    state: &mut GlRenderState,
    source: &GlTextureRenderTarget,
    dest: &GlTextureRenderTarget,
    effect: &ToneMapEffect,
) -> Result<(), String> {
    let operator = effect.operator.unwrap_or(ToneMapOperator::Aces);
    let exposure = effect.exposure.unwrap_or(1.0);
    let white = effect.white.unwrap_or(1.0);
    let program = get_gl_effect_program(
        state,
        &format!("toneMap.{}", get_tone_map_operator_name(operator)),
        &build_tone_map_fragment(operator),
    )?;
    return draw_gl_fullscreen_pass(state, &program, &[source.texture], Some(dest), |gl, p| {
        uniform_1f(gl, p, "u_exposure", exposure);
        uniform_1f(gl, p, "u_white", white);
    });
}

fn build_tone_map_fragment(operator: ToneMapOperator) -> String {
    let body = match operator {
        ToneMapOperator::Aces => TONEMAP_OPERATOR_ACES,
        ToneMapOperator::Agx => TONEMAP_OPERATOR_AGX,
        ToneMapOperator::Filmic => TONEMAP_OPERATOR_FILMIC,
        ToneMapOperator::Reinhard => TONEMAP_OPERATOR_REINHARD,
        ToneMapOperator::Uncharted2 => TONEMAP_OPERATOR_UNCHARTED2,
    };
    return format!("{TONEMAP_FRAGMENT_HEAD}{body}{TONEMAP_FRAGMENT_TAIL}");
}

/// The TS string literal of the operator, used in the program key.
fn get_tone_map_operator_name(operator: ToneMapOperator) -> &'static str {
    return match operator {
        ToneMapOperator::Aces => "aces",
        ToneMapOperator::Agx => "agx",
        ToneMapOperator::Filmic => "filmic",
        ToneMapOperator::Reinhard => "reinhard",
        ToneMapOperator::Uncharted2 => "uncharted2",
    };
}

pub fn gl_tone_map_effect_runner(
    ctx: &mut GlEffectContext<'_>,
    effect: &dyn Effect,
) -> Result<(), String> {
    let Some(effect) = effect.as_any().downcast_ref::<ToneMapEffect>() else {
        return Ok(());
    };
    return apply_tone_map_effect_to_gl(ctx.state, ctx.source, ctx.dest, effect);
}

pub fn register_gl_tone_map_effect(state: &mut GlRenderState) {
    register_gl_effect(state, "ToneMapEffect", gl_tone_map_effect_runner, None);
}
