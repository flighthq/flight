//! WGPU atmospheric / depth effect recipes.
//!
//! Several of these (`ScreenSpaceFog`, `Ssao`, `Ssr`) read a sampleable depth
//! (and normals) texture in their canonical form; this backend ships color-only
//! approximations and falls back to a proxy when depth is absent.  God rays is
//! genuinely color-only (radial light scattering), not a stand-in.
//!
//! Mirrors the TS `atmosphericEffects` from `effects-webgpu`.

use flighthq_effects::RenderEffect;
use flighthq_effects::types::{GodRaysEffect, ScreenSpaceFogEffect, SsaoEffect, SsrEffect};
use flighthq_render_wgpu::render_state::{WgpuRenderState, WgpuRenderTarget};

use crate::effect_program_cache::{
    WgpuEffectBlend, draw_wgpu_effect_filter_pass, ensure_wgpu_effect_pipeline,
    get_wgpu_effect_pipeline,
};
use crate::render_effect_registry::{WgpuRenderEffectContext, WgpuRenderEffectRunner};

/// Applies god rays (radial light scattering) to `source` and writes to `dest`.
///
/// The sample count is baked into the WGSL (a `for` bound must be const) and
/// keyed into the pipeline cache, so each distinct sample count compiles once.
pub fn apply_god_rays_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &GodRaysEffect,
) {
    let center_x = effect.center_x.unwrap_or(0.5);
    let center_y = effect.center_y.unwrap_or(0.5);
    let density = effect.density.unwrap_or(0.96);
    let decay = effect.decay.unwrap_or(0.93);
    let weight = effect.weight.unwrap_or(0.4);
    let exposure = effect.exposure.unwrap_or(0.6);
    let samples = effect.samples.unwrap_or(64).max(1);
    let key = format!("atmospheric.godRays.{samples}");
    ensure_wgpu_effect_pipeline(
        state,
        &key,
        &build_god_rays_fragment(samples),
        WgpuEffectBlend::Replace,
        1,
    );
    draw_wgpu_effect_filter_pass(state, &key, source, Some(dest), |f32s, _| {
        f32s[0] = center_x;
        f32s[1] = center_y;
        f32s[2] = density;
        f32s[3] = decay;
        f32s[4] = weight;
        f32s[5] = exposure;
    });
}

/// Applies screen-space fog to `source` and writes to `dest`.
///
/// WebGPU has no sampleable depth G-buffer yet, so `depth_texture` is ignored
/// and the screen-Y gradient proxy is used.  When the depth seam lands this
/// recipe binds the depth texture and computes
/// `fog = 1 - exp(-density * remap(depth, near, far))`.
pub fn apply_screen_space_fog_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    _depth_texture: Option<wgpu::TextureView>,
    effect: &ScreenSpaceFogEffect,
) {
    let packed = effect.color.unwrap_or(0xc8d2dcff);
    let r = ((packed >> 24) & 0xff) as f32 / 255.0;
    let g = ((packed >> 16) & 0xff) as f32 / 255.0;
    let b = ((packed >> 8) & 0xff) as f32 / 255.0;
    let density = effect.density.unwrap_or(1.0);
    get_wgpu_effect_pipeline(
        state,
        "atmospheric.screenSpaceFog",
        SCREEN_SPACE_FOG_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(
        state,
        "atmospheric.screenSpaceFog",
        source,
        Some(dest),
        |f32s, _| {
            f32s[0] = density;
            f32s[4] = r;
            f32s[5] = g;
            f32s[6] = b;
        },
    );
}

/// Applies SSAO (color-only luminance-variation approximation) to `source` and
/// writes to `dest`.
pub fn apply_ssao_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &SsaoEffect,
) {
    let radius = effect.radius.unwrap_or(1.0);
    let intensity = effect.intensity.unwrap_or(1.0);
    let width = source.width as f32;
    let height = source.height as f32;
    get_wgpu_effect_pipeline(
        state,
        "atmospheric.ssao",
        SSAO_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(state, "atmospheric.ssao", source, Some(dest), |f32s, _| {
        f32s[0] = radius;
        f32s[1] = intensity;
        f32s[2] = width;
        f32s[3] = height;
    });
}

/// Applies SSR (passthrough until depth + normals are wired) to `source` and
/// writes to `dest`.
pub fn apply_ssr_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    _effect: &SsrEffect,
) {
    get_wgpu_effect_pipeline(
        state,
        "atmospheric.ssr",
        SSR_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(state, "atmospheric.ssr", source, Some(dest), |_, _| {});
}

/// Default WGPU runner for [`GodRaysEffect`].
pub const DEFAULT_WGPU_GOD_RAYS_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::GodRays(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_god_rays_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`ScreenSpaceFogEffect`].
pub const DEFAULT_WGPU_SCREEN_SPACE_FOG_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::ScreenSpaceFog(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            let depth = ctx.scene_depth_texture.take();
            apply_screen_space_fog_effect_to_wgpu(ctx.state, source, dest, depth, effect);
        }
    };

/// Default WGPU runner for [`SsaoEffect`].
pub const DEFAULT_WGPU_SSAO_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Ssao(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_ssao_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`SsrEffect`].
pub const DEFAULT_WGPU_SSR_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Ssr(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_ssr_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

fn build_god_rays_fragment(samples: u32) -> String {
    format!("{GOD_RAYS_FRAGMENT_HEAD}{samples}{GOD_RAYS_FRAGMENT_TAIL}")
}

// Slot layout: [0]=centerX, [1]=centerY, [2]=density, [3]=decay, [4]=weight, [5]=exposure.
const GOD_RAYS_FRAGMENT_HEAD: &str = /* wgsl */
    r#"
struct Uniforms {
  u_centerX : f32,
  u_centerY : f32,
  u_density : f32,
  u_decay : f32,
  u_weight : f32,
  u_exposure : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

const SAMPLES : i32 = "#;

const GOD_RAYS_FRAGMENT_TAIL: &str = /* wgsl */
    r#";

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let light = vec2f(uni.u_centerX, uni.u_centerY);
  let delta = (uv - light) * (uni.u_density / f32(SAMPLES));
  var coord = uv;
  let base = textureSampleLevel(tex, smp, uv, 0.0);
  var accum = base.rgb;
  var illumination = 1.0;
  for (var i = 0; i < SAMPLES; i = i + 1) {
    coord = coord - delta;
    var s = textureSampleLevel(tex, smp, coord, 0.0).rgb;
    s = s * (illumination * uni.u_weight);
    accum = accum + s;
    illumination = illumination * uni.u_decay;
  }
  return vec4f(base.rgb + accum * uni.u_exposure, base.a);
}"#;

// Slot layout: [0]=radius, [1]=intensity, [2]=resolution.x, [3]=resolution.y.
const SSAO_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms {
  u_radius : f32,
  u_intensity : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn luma(c : vec3f) -> f32 {
  return dot(c, vec3f(0.299, 0.587, 0.114));
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let texel = (1.0 / uni.u_resolution) * max(uni.u_radius, 1.0);
  let center = textureSampleLevel(tex, smp, uv, 0.0);
  let lc = luma(center.rgb);
  var variation = 0.0;
  variation = variation + abs(lc - luma(textureSampleLevel(tex, smp, uv + vec2f(-1.0, 0.0) * texel, 0.0).rgb));
  variation = variation + abs(lc - luma(textureSampleLevel(tex, smp, uv + vec2f(1.0, 0.0) * texel, 0.0).rgb));
  variation = variation + abs(lc - luma(textureSampleLevel(tex, smp, uv + vec2f(0.0, -1.0) * texel, 0.0).rgb));
  variation = variation + abs(lc - luma(textureSampleLevel(tex, smp, uv + vec2f(0.0, 1.0) * texel, 0.0).rgb));
  variation = variation * 0.25;
  let occlusion = clamp(variation * uni.u_intensity, 0.0, 1.0);
  return vec4f(center.rgb * (1.0 - occlusion), center.a);
}"#;

const SSR_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms {
  _pad0 : vec4f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  return textureSampleLevel(tex, smp, uv, 0.0);
}"#;

// Slot layout: [0]=density, [1..3]=pad, [4..6]=fog color rgb. The std140-style struct aligns the vec3
// color to a 16-byte boundary, so the slot writes skip slots [1..3].
const SCREEN_SPACE_FOG_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
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
  // Color-only fallback: no depth G-buffer in WebGPU yet — screen-Y gradient as a depth proxy.
  let fog = clamp((1.0 - uv.y) * uni.u_density, 0.0, 1.0);
  return vec4f(mix(c.rgb, uni.u_fogColor, fog), c.a);
}"#;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::effect_program_cache::build_wgpu_effect_module_wgsl;

    #[test]
    fn build_god_rays_fragment_bakes_sample_count() {
        let frag = build_god_rays_fragment(48);
        assert!(frag.contains("const SAMPLES : i32 = 48;"));
        assert!(frag.contains("for (var i = 0; i < SAMPLES"));
        // Distinct sample counts produce distinct sources (distinct cache keys).
        assert_ne!(build_god_rays_fragment(64), build_god_rays_fragment(32));
    }

    #[test]
    fn screen_space_fog_uses_y_gradient_proxy() {
        let module = build_wgpu_effect_module_wgsl(SCREEN_SPACE_FOG_FRAGMENT_WGSL);
        assert!(module.contains("(1.0 - uv.y) * uni.u_density"));
        assert!(module.contains("u_fogColor"));
    }

    #[test]
    fn ssao_fragment_declares_resolution_and_radius() {
        let module = build_wgpu_effect_module_wgsl(SSAO_FRAGMENT_WGSL);
        assert!(module.contains("u_radius"));
        assert!(module.contains("u_resolution : vec2f"));
    }
}
