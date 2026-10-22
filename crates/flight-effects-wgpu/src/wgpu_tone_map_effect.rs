// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! Tone map (TS `wgpuToneMapEffect.ts`): compresses HDR to the displayable range through the
//! selected operator. The operator's tonemap body is compiled into the fragment once per state,
//! keyed by operator name. The WebGPU mirror of effects-gl's tone map.

use flight_effects::{Effect, ToneMapEffect, ToneMapOperator};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;

// Slots [0]=exposure, [1]=white; the operator body is spliced between head and tail. The struct's
// two scalars pad to a 16-byte boundary.
const TONEMAP_FRAGMENT_HEAD: &str = r#"
struct Uniforms { u_exposure : f32, u_white : f32, _pad0 : f32, _pad1 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn tonemap(x : vec3f) -> vec3f {"#;

const TONEMAP_FRAGMENT_TAIL: &str = r#"}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let mapped = tonemap(c.rgb * uni.u_exposure);
  return vec4f(clamp(mapped, vec3f(0.0), vec3f(1.0)), c.a);
}"#;

const TONEMAP_OPERATOR_ACES: &str = r#"
  let a = x * (2.51 * x + 0.03);
  let b = x * (2.43 * x + 0.59) + 0.14;
  return a / b;"#;
const TONEMAP_OPERATOR_REINHARD: &str = r#"
  return x / (1.0 + x / (uni.u_white * uni.u_white));"#;
const TONEMAP_OPERATOR_FILMIC: &str = r#"
  let X = max(vec3f(0.0), x - 0.004);
  return (X * (6.2 * X + 0.5)) / (X * (6.2 * X + 1.7) + 0.06);"#;
const TONEMAP_OPERATOR_UNCHARTED2: &str = r#"
  let A = 0.15; let B = 0.50; let C = 0.10; let D = 0.20; let E = 0.02; let F = 0.30;
  let v = ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
  return v;"#;
const TONEMAP_OPERATOR_AGX: &str = r#"
  let v = clamp((x - 0.004) / (1.0 + x), vec3f(0.0), vec3f(1.0));
  return pow(v, vec3f(0.8));"#;

/// Tone-maps `source` into `dest` with the effect's operator, exposure and white point (TS
/// `applyToneMapEffectToWgpu`).
pub fn apply_tone_map_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &ToneMapEffect,
) {
    let operator = effect.operator.unwrap_or(ToneMapOperator::Aces);
    let exposure = effect.exposure.unwrap_or(1.0);
    let white = effect.white.unwrap_or(1.0);
    let pipeline = get_wgpu_effect_pipeline(
        state,
        &format!("toneMap.{}", get_tone_map_operator_name(operator)),
        &build_tone_map_fragment(operator),
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = exposure;
            f32[1] = white;
        },
    );
}

fn build_tone_map_fragment(operator: ToneMapOperator) -> String {
    let body = match operator {
        ToneMapOperator::Aces => TONEMAP_OPERATOR_ACES,
        ToneMapOperator::Reinhard => TONEMAP_OPERATOR_REINHARD,
        ToneMapOperator::Filmic => TONEMAP_OPERATOR_FILMIC,
        ToneMapOperator::Uncharted2 => TONEMAP_OPERATOR_UNCHARTED2,
        ToneMapOperator::Agx => TONEMAP_OPERATOR_AGX,
    };
    return format!("{TONEMAP_FRAGMENT_HEAD}{body}{TONEMAP_FRAGMENT_TAIL}");
}

// The operator's source string, which keys its compiled pipeline.
fn get_tone_map_operator_name(operator: ToneMapOperator) -> &'static str {
    return match operator {
        ToneMapOperator::Aces => "aces",
        ToneMapOperator::Reinhard => "reinhard",
        ToneMapOperator::Filmic => "filmic",
        ToneMapOperator::Uncharted2 => "uncharted2",
        ToneMapOperator::Agx => "agx",
    };
}

/// Registers the default runner under `ToneMapEffect` (TS `registerWgpuToneMapEffect`).
pub fn register_wgpu_tone_map_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "ToneMapEffect", wgpu_tone_map_effect_runner, None);
}

/// The default `ToneMapEffect` runner (TS `wgpuToneMapEffectRunner`).
pub fn wgpu_tone_map_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<ToneMapEffect>(effect, "wgpuToneMapEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_tone_map_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
