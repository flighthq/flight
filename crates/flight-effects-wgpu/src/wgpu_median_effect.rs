// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! Per-channel median denoise (TS `wgpuMedianEffect.ts`): each output pixel is the median of its
//! (2·radius+1)² neighborhood. Preserves edges while removing salt-and-pepper noise. A single GPU
//! pass, no scratch targets.

use flight_effects::{Effect, MedianEffect};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;

/// Largest median-filter radius the WebGPU path supports (radius 2: a 5x5, 25-sample window; TS
/// `MAX_MEDIAN_EFFECT_WGPU_RADIUS`). The cap is the fixed sort-array size in the shader.
pub const MAX_MEDIAN_EFFECT_WGPU_RADIUS: u32 = 2;

// Uniforms layout (16 bytes): offset 0 texelSize (vec2f), offset 8 radius (i32), offset 12 _pad
// (i32). The source interpolates MAX_SAMPLES (25) and MAX_MEDIAN_EFFECT_WGPU_RADIUS (2) into the
// template; they are expanded here.
const MEDIAN_WGSL: &str = r#"
struct Uniforms {
  texelSize : vec2f,
  radius : i32,
  _pad : i32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn sortArr(arr : ptr<function, array<f32, 25>>, n : i32) {
  for (var i = 1; i < n; i++) {
    let key = (*arr)[i];
    var j = i - 1;
    loop {
      if (j < 0 || (*arr)[j] <= key) { break; }
      (*arr)[j + 1] = (*arr)[j];
      j -= 1;
    }
    (*arr)[j + 1] = key;
  }
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let r = clamp(uni.radius, 0, 2);
  if (r == 0) { return textureSampleLevel(tex, smp, uv, 0.0); }
  let n = (2 * r + 1) * (2 * r + 1);
  var rv : array<f32, 25>;
  var gv : array<f32, 25>;
  var bv : array<f32, 25>;
  var av : array<f32, 25>;
  var count = 0;
  for (var dy = -2; dy <= 2; dy++) {
    for (var dx = -2; dx <= 2; dx++) {
      if (abs(dy) <= r && abs(dx) <= r) {
        let s = textureSampleLevel(tex, smp, uv + vec2f(f32(dx), f32(dy)) * uni.texelSize, 0.0);
        rv[count] = s.r;
        gv[count] = s.g;
        bv[count] = s.b;
        av[count] = s.a;
        count += 1;
      }
    }
  }
  sortArr(&rv, n);
  sortArr(&gv, n);
  sortArr(&bv, n);
  sortArr(&av, n);
  let mid = n / 2;
  return vec4f(rv[mid], gv[mid], bv[mid], av[mid]);
}"#;

/// Applies a `MedianEffect` from `source` into `dest` (TS `applyMedianEffectToWgpu`); the radius
/// rounds and clamps to `0..=MAX_MEDIAN_EFFECT_WGPU_RADIUS`.
pub fn apply_median_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &MedianEffect,
) {
    let radius = (MAX_MEDIAN_EFFECT_WGPU_RADIUS as f32)
        .min(0.0_f32.max((effect.radius.unwrap_or(1.0) + 0.5).floor())) as i32;
    let width = source.width as f32;
    let height = source.height as f32;
    let pipeline = get_wgpu_effect_pipeline(
        state,
        "stylization.median",
        MEDIAN_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, i32| {
            f32[0] = 1.0 / width;
            f32[1] = 1.0 / height;
            i32[2] = radius;
        },
    );
}

/// Registers the default runner under `MedianEffect` (TS `registerWgpuMedianEffect`).
pub fn register_wgpu_median_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "MedianEffect", wgpu_median_effect_runner, None);
}

/// The default `MedianEffect` runner (TS `wgpuMedianEffectRunner`).
pub fn wgpu_median_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<MedianEffect>(effect, "wgpuMedianEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_median_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
