// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! CRT: barrel-distorts the uv (curvature), darkens alternating scanlines, vignettes the edges, and splits the channels outward for a tube-monitor look. (TS `wgpuCrtEffect.ts`).

use flight_effects::{CrtEffect, Effect};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;
use crate::wgpu_effect_texel_scale::get_wgpu_effect_logical_resolution;

const CRT_FRAGMENT_WGSL: &str = r#"
struct Uniforms {
  u_curvature : f32,
  u_scanlineIntensity : f32,
  u_vignette : f32,
  u_aberration : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn barrel(uv : vec2f) -> vec2f {
  var c = uv * 2.0 - 1.0;
  c += c * uni.u_curvature * dot(c, c);
  return c * 0.5 + 0.5;
}

@fragment
fn fs_main(@location(0) uvIn : vec2f) -> @location(0) vec4f {
  let uv = barrel(uvIn);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }
  let off = vec2f(uni.u_aberration, 0.0);
  let r = textureSampleLevel(tex, smp, uv + off, 0.0).r;
  let g = textureSampleLevel(tex, smp, uv, 0.0).g;
  let b = textureSampleLevel(tex, smp, uv - off, 0.0).b;
  let a = textureSampleLevel(tex, smp, uv, 0.0).a;
  var col = vec3f(r, g, b);
  let line = sin(uv.y * uni.u_resolution.y * 3.14159265) * 0.5 + 0.5;
  col *= 1.0 - uni.u_scanlineIntensity * (1.0 - line);
  let vc = uv * 2.0 - 1.0;
  col *= 1.0 - uni.u_vignette * dot(vc, vc);
  return vec4f(col, a);
}"#;

/// Applies a `CrtEffect` to `source`, writing `dest` (TS `applyCrtEffectToWgpu`).
pub fn apply_crt_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &CrtEffect,
) {
    let curvature = effect.curvature.unwrap_or(0.1);
    let scanline_intensity = effect.scanline_intensity.unwrap_or(0.3);
    let vignette = effect.vignette.unwrap_or(0.3);
    let aberration = effect.aberration.unwrap_or(0.005);
    let resolution = get_wgpu_effect_logical_resolution(state, source);
    let pipeline = get_wgpu_effect_pipeline(
        state,
        "stylization.crt",
        CRT_FRAGMENT_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = curvature;
            f32[1] = scanline_intensity;
            f32[2] = vignette;
            f32[3] = aberration;
            f32[4] = resolution.width;
            f32[5] = resolution.height;
        },
    );
}

/// Registers the default runner under `CrtEffect` (TS `registerWgpuCrtEffect`).
pub fn register_wgpu_crt_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "CrtEffect", wgpu_crt_effect_runner, None);
}

/// The default `CrtEffect` runner (TS `wgpuCrtEffectRunner`).
pub fn wgpu_crt_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<CrtEffect>(effect, "wgpuCrtEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_crt_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
