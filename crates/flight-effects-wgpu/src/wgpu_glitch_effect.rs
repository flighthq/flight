// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! Glitch: splits the frame into horizontal blocks, displaces each by a per-block hash, separates the RGB channels, and corrupts the occasional block to white; `seed` animates it. (TS `wgpuGlitchEffect.ts`).

use flight_effects::{Effect, GlitchEffect};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;
use crate::wgpu_effect_texel_scale::get_wgpu_effect_logical_resolution;

const GLITCH_FRAGMENT_WGSL: &str = r#"
struct Uniforms {
  u_intensity : f32,
  u_blockSize : f32,
  u_colorShift : f32,
  u_seed : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn glitchHash(n : f32) -> f32 { return fract(sin(n) * 43758.5453123); }

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let blockSize = max(2.0, uni.u_blockSize);
  let block = floor(uv.y * uni.u_resolution.y / blockSize);
  let r = glitchHash(block + uni.u_seed * 7.0);
  // Higher intensity activates more blocks; a torn block tears horizontally.
  let tear = step(1.0 - uni.u_intensity * 0.6, r);
  let shiftPx = (glitchHash(block * 1.7 + uni.u_seed) - 0.5) * 2.0 * tear * uni.u_intensity * 40.0;
  let baseUv = vec2f(uv.x + shiftPx / uni.u_resolution.x, uv.y);
  // RGB channel separation, wider on torn blocks.
  let cs = (uni.u_colorShift * (0.4 + tear)) / uni.u_resolution.x;
  let rC = textureSampleLevel(tex, smp, vec2f(baseUv.x + cs, baseUv.y), 0.0).r;
  let gC = textureSampleLevel(tex, smp, baseUv, 0.0).g;
  let bC = textureSampleLevel(tex, smp, vec2f(baseUv.x - cs, baseUv.y), 0.0).b;
  let a = textureSampleLevel(tex, smp, baseUv, 0.0).a;
  var col = vec3f(rC, gC, bC);
  // Occasional bright block corruption.
  let corrupt = step(0.985 - uni.u_intensity * 0.04, glitchHash(block * 3.3 + uni.u_seed * 2.0));
  col = mix(col, vec3f(1.0), corrupt * 0.6);
  return vec4f(col, a);
}"#;

/// Applies a `GlitchEffect` to `source`, writing `dest` (TS `applyGlitchEffectToWgpu`).
pub fn apply_glitch_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &GlitchEffect,
) {
    let intensity = effect.intensity.unwrap_or(0.5);
    let block_size = effect.block_size.unwrap_or(24.0);
    let color_shift = effect.color_shift.unwrap_or(8.0);
    let seed = effect.seed.unwrap_or(0.0);
    let resolution = get_wgpu_effect_logical_resolution(state, source);
    let pipeline = get_wgpu_effect_pipeline(
        state,
        "stylization.glitch",
        GLITCH_FRAGMENT_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = intensity;
            f32[1] = block_size;
            f32[2] = color_shift;
            f32[3] = seed;
            f32[4] = resolution.width;
            f32[5] = resolution.height;
        },
    );
}

/// Registers the default runner under `GlitchEffect` (TS `registerWgpuGlitchEffect`).
pub fn register_wgpu_glitch_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "GlitchEffect", wgpu_glitch_effect_runner, None);
}

/// The default `GlitchEffect` runner (TS `wgpuGlitchEffectRunner`).
pub fn wgpu_glitch_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<GlitchEffect>(effect, "wgpuGlitchEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_glitch_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
