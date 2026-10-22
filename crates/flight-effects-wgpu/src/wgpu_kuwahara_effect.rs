// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! Kuwahara: edge-preserving smoothing; emits the lowest-variance mean of four overlapping quadrants over a small radius. (TS `wgpuKuwaharaEffect.ts`).

use flight_effects::{Effect, KuwaharaEffect};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;
use crate::wgpu_effect_texel_scale::get_wgpu_effect_logical_resolution;

const KUWAHARA_FRAGMENT_WGSL: &str = r#"
struct Uniforms {
  u_radius : f32,
  _pad0 : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

const R : i32 = 4;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let texel = 1.0 / uni.u_resolution;
  let r = i32(min(f32(R), uni.u_radius));
  var means : array<vec3f, 4>;
  var vars : array<f32, 4>;
  for (var q = 0; q < 4; q++) {
    let ox = select(-r, 0, (q & 1) != 0);
    let oy = select(-r, 0, (q & 2) != 0);
    var sum = vec3f(0.0);
    var sumSq = vec3f(0.0);
    var n = 0.0;
    for (var y = 0; y <= R; y++) {
      for (var x = 0; x <= R; x++) {
        if (x > r || y > r) { continue; }
        let off = vec2f(f32(ox + x), f32(oy + y)) * texel;
        let col = textureSampleLevel(tex, smp, uv + off, 0.0).rgb;
        sum += col;
        sumSq += col * col;
        n += 1.0;
      }
    }
    let mean = sum / n;
    means[q] = mean;
    let v = sumSq / n - mean * mean;
    vars[q] = v.r + v.g + v.b;
  }
  var minVar = vars[0];
  var result = means[0];
  var tiedCount = 1.0;
  for (var q = 1; q < 4; q++) {
    if (vars[q] < minVar) {
      minVar = vars[q];
      result = means[q];
      tiedCount = 1.0;
    } else if (vars[q] == minVar) {
      result += means[q];
      tiedCount += 1.0;
    }
  }
  result /= tiedCount;
  return vec4f(result, textureSampleLevel(tex, smp, uv, 0.0).a);
}"#;

/// Applies a `KuwaharaEffect` to `source`, writing `dest` (TS `applyKuwaharaEffectToWgpu`).
pub fn apply_kuwahara_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &KuwaharaEffect,
) {
    let radius = effect.radius.unwrap_or(3.0);
    let resolution = get_wgpu_effect_logical_resolution(state, source);
    let pipeline = get_wgpu_effect_pipeline(
        state,
        "stylization.kuwahara",
        KUWAHARA_FRAGMENT_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = 1.0_f32.max(radius);
            f32[2] = resolution.width;
            f32[3] = resolution.height;
        },
    );
}

/// Registers the default runner under `KuwaharaEffect` (TS `registerWgpuKuwaharaEffect`).
pub fn register_wgpu_kuwahara_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "KuwaharaEffect", wgpu_kuwahara_effect_runner, None);
}

/// The default `KuwaharaEffect` runner (TS `wgpuKuwaharaEffectRunner`).
pub fn wgpu_kuwahara_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<KuwaharaEffect>(effect, "wgpuKuwaharaEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_kuwahara_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
