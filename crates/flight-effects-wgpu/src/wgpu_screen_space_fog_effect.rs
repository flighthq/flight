// flight-lint: allow-file(contract-vocabulary) D17 native wgpu binding: the recipe takes host-supplied wgpu targets
//! Screen-space fog (TS `wgpuScreenSpaceFogEffect.ts`): blends the scene toward the unpacked fog color
//! by a depth proxy. WebGPU has no depth G-buffer yet, so this color-only fallback uses the
//! screen-Y gradient (top of frame reads as far); `near` / `far` are reserved for the depth recipe.

use flight_effects::{Effect, ScreenSpaceFogEffect};
use flight_render_wgpu::{WgpuEffectContext, WgpuRenderState, WgpuTextureRenderTarget};

use crate::types::*;
use crate::wgpu_effect_pass::draw_wgpu_effect_pass;
use crate::wgpu_effect_program_cache::get_wgpu_effect_pipeline;
use crate::wgpu_effect_registry::register_wgpu_effect;
use crate::wgpu_effect_runner_support::downcast_wgpu_effect;

const SCREEN_SPACE_FOG_FRAGMENT_WGSL: &str = r#"
struct Uniforms {
  u_density : f32,
  _pad0 : f32,
  _pad1 : f32,
  _pad2 : f32,
  u_fogColor : vec3f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  // Color-only fallback: no depth G-buffer in Wgpu yet — screen-Y gradient as a depth proxy.
  // The real version reads depth and computes fog = 1 - exp(-density * remap(depth, near, far)).
  let fog = clamp((1.0 - uv.y) * uni.u_density, 0.0, 1.0);
  return vec4f(mix(c.rgb, uni.u_fogColor, fog), c.a);
}"#;

/// Fogs `source` toward the packed RGBA fog color into `dest` (TS `applyScreenSpaceFogEffectToWgpu`).
pub fn apply_screen_space_fog_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuTextureRenderTarget,
    dest: &WgpuTextureRenderTarget,
    effect: &ScreenSpaceFogEffect,
) {
    let packed = effect.color.unwrap_or(0xc8d2dcff);
    let r = ((packed >> 24) & 0xff) as f32 / 255.0;
    let g = ((packed >> 16) & 0xff) as f32 / 255.0;
    let b = ((packed >> 8) & 0xff) as f32 / 255.0;
    let density = effect.density.unwrap_or(1.0);
    let pipeline = get_wgpu_effect_pipeline(
        state,
        "atmospheric.screenSpaceFog",
        SCREEN_SPACE_FOG_FRAGMENT_WGSL,
        Some(WgpuEffectBlendMode::Replace),
    );
    draw_wgpu_effect_pass(
        state,
        source,
        Some(dest),
        &mut pipeline.write().unwrap(),
        &mut |f32, _| {
            f32[0] = density;
            f32[4] = r;
            f32[5] = g;
            f32[6] = b;
        },
    );
}

/// Registers the default runner under `ScreenSpaceFogEffect` (TS `registerWgpuScreenSpaceFogEffect`).
pub fn register_wgpu_screen_space_fog_effect(state: &mut WgpuRenderState) {
    register_wgpu_effect(state, "ScreenSpaceFogEffect", wgpu_screen_space_fog_effect_runner, None);
}

/// The default `ScreenSpaceFogEffect` runner (TS `wgpuScreenSpaceFogEffectRunner`).
pub fn wgpu_screen_space_fog_effect_runner(ctx: &mut WgpuEffectContext<'_>, effect: &dyn Effect) {
    let effect = downcast_wgpu_effect::<ScreenSpaceFogEffect>(effect, "wgpuScreenSpaceFogEffectRunner");
    let source = ctx.source.read().unwrap();
    let dest = ctx.dest.read().unwrap();
    apply_screen_space_fog_effect_to_wgpu(ctx.state, &source, &dest, effect);
}
