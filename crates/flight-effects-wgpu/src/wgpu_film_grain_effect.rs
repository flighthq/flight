// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! Film grain: adds per-pixel hash noise scaled by intensity, with a grain cell size and a seed so the noise can be animated frame to frame. (TS `wgpuFilmGrainEffect.ts`).

use flight_effects::{Effect, FilmGrainEffect};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;

const FILM_GRAIN_FRAGMENT_WGSL: &str = r#"
struct Uniforms {
  u_intensity : f32,
  u_size : f32,
  u_seed : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn hash(pIn : vec2f) -> f32 {
  let p = floor(pIn / uni.u_size);
  return fract(sin(dot(p, vec2f(127.1, 311.7)) + uni.u_seed) * 43758.5453123);
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let n = hash(uv * 1024.0) - 0.5;
  return vec4f(c.rgb + n * uni.u_intensity, c.a);
}"#;

/// Applies a `FilmGrainEffect` to `source`, writing `dest` (TS `applyFilmGrainEffectToWgpu`).
pub fn apply_film_grain_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &FilmGrainEffect,
) {
    let intensity = effect.intensity.unwrap_or(0.1);
    let size = effect.size.unwrap_or(1.0);
    let seed = effect.seed.unwrap_or(0.0);
    let pipeline = get_wgpu_effect_pipeline(
        state,
        "stylization.filmGrain",
        FILM_GRAIN_FRAGMENT_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = intensity;
            f32[1] = 0.0001_f32.max(size);
            f32[2] = seed;
        },
    );
}

/// Registers the default runner under `FilmGrainEffect` (TS `registerWgpuFilmGrainEffect`).
pub fn register_wgpu_film_grain_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(
        state,
        "FilmGrainEffect",
        wgpu_film_grain_effect_runner,
        None,
    );
}

/// The default `FilmGrainEffect` runner (TS `wgpuFilmGrainEffectRunner`).
pub fn wgpu_film_grain_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<FilmGrainEffect>(effect, "wgpuFilmGrainEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_film_grain_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
