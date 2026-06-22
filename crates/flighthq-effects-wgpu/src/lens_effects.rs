//! WGPU lens / camera artifact effect recipes.
//!
//! Covers physical-camera artifacts (vignetting, chromatic aberration, lens
//! distortion, flare, dirt) and depth-driven focus (bokeh DoF, tilt-shift).
//! Packed RGBA color fields are unpacked before upload; depth-driven recipes
//! fall back to color-only paths when no depth attachment is present.  Shaders
//! work in centered coordinates (`uv - 0.5`) so radial math measures distance
//! from the optical center.
//!
//! Mirrors the TS `lensEffects` from `effects-webgpu`.

use flighthq_effects::RenderEffect;
use flighthq_effects::types::{
    BokehDepthOfFieldEffect, ChromaticAberrationEffect, DisplacementEffect, LensDirtEffect,
    LensDistortionEffect, LensFlareEffect, TiltShiftEffect, VignetteEffect,
};
use flighthq_render_wgpu::render_state::{WgpuRenderState, WgpuRenderTarget};

use crate::effect_program_cache::{
    WgpuEffectBlend, draw_wgpu_effect_filter_pass, get_wgpu_effect_pipeline,
};
use crate::render_effect_registry::{WgpuRenderEffectContext, WgpuRenderEffectRunner};

/// Applies bokeh depth-of-field (uniform disc blur, no depth yet) to `source`
/// and writes to `dest`.
pub fn apply_bokeh_depth_of_field_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &BokehDepthOfFieldEffect,
) {
    let max_blur = effect.max_blur.unwrap_or(4.0);
    let width = source.width as f32;
    let height = source.height as f32;
    get_wgpu_effect_pipeline(
        state,
        "lens.bokehDoF",
        BOKEH_DOF_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(state, "lens.bokehDoF", source, Some(dest), |f32s, _| {
        f32s[0] = max_blur;
        f32s[2] = width;
        f32s[3] = height;
    });
}

/// Applies chromatic aberration to `source` and writes to `dest`.
pub fn apply_chromatic_aberration_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &ChromaticAberrationEffect,
) {
    let intensity = effect.intensity.unwrap_or(0.005);
    let radial = effect.radial.unwrap_or(true);
    get_wgpu_effect_pipeline(
        state,
        "lens.chromaticAberration",
        CHROMATIC_ABERRATION_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(
        state,
        "lens.chromaticAberration",
        source,
        Some(dest),
        |f32s, _| {
            f32s[0] = intensity;
            f32s[1] = if radial { 1.0 } else { 0.0 };
        },
    );
}

/// Applies a heat-haze / displacement warp to `source` and writes to `dest`.
pub fn apply_displacement_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &DisplacementEffect,
) {
    let intensity = effect.intensity.unwrap_or(8.0);
    let frequency = effect.frequency.unwrap_or(12.0);
    let seed = effect.seed.unwrap_or(0.0);
    let width = source.width as f32;
    let height = source.height as f32;
    get_wgpu_effect_pipeline(
        state,
        "lens.displacement",
        DISPLACEMENT_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(state, "lens.displacement", source, Some(dest), |f32s, _| {
        f32s[0] = intensity;
        f32s[1] = frequency;
        f32s[2] = seed;
        f32s[4] = width;
        f32s[5] = height;
    });
}

/// Applies a lens-dirt overlay to `source` and writes to `dest`.
pub fn apply_lens_dirt_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &LensDirtEffect,
) {
    let intensity = effect.intensity.unwrap_or(1.0);
    let threshold = effect.threshold.unwrap_or(0.55);
    let seed = effect.seed.unwrap_or(0.0);
    get_wgpu_effect_pipeline(
        state,
        "lens.lensDirt",
        LENS_DIRT_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(state, "lens.lensDirt", source, Some(dest), |f32s, _| {
        f32s[0] = intensity;
        f32s[1] = threshold;
        f32s[2] = seed;
    });
}

/// Applies lens distortion (barrel/pincushion) to `source` and writes to `dest`.
pub fn apply_lens_distortion_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &LensDistortionEffect,
) {
    let amount = effect.amount.unwrap_or(0.2);
    let scale = effect.scale.unwrap_or(1.0);
    get_wgpu_effect_pipeline(
        state,
        "lens.lensDistortion",
        LENS_DISTORTION_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(
        state,
        "lens.lensDistortion",
        source,
        Some(dest),
        |f32s, _| {
            f32s[0] = amount;
            f32s[1] = scale;
        },
    );
}

/// Applies a lens flare (single-pass approximation) to `source` and writes to
/// `dest`.
pub fn apply_lens_flare_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &LensFlareEffect,
) {
    let threshold = effect.threshold.unwrap_or(0.8);
    let intensity = effect.intensity.unwrap_or(1.0);
    let ghosts = effect.ghosts.unwrap_or(4) as f32;
    let halo = effect.halo.unwrap_or(0.5);
    get_wgpu_effect_pipeline(
        state,
        "lens.lensFlare",
        LENS_FLARE_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(state, "lens.lensFlare", source, Some(dest), |f32s, _| {
        f32s[0] = threshold;
        f32s[1] = intensity;
        f32s[2] = ghosts;
        f32s[3] = halo;
    });
}

/// Applies a tilt-shift focus band to `source` and writes to `dest`.
pub fn apply_tilt_shift_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &TiltShiftEffect,
) {
    let center = effect.center.unwrap_or(0.5);
    let width_param = effect.width.unwrap_or(0.3);
    let blur = effect.blur.unwrap_or(4.0);
    let width = source.width as f32;
    let height = source.height as f32;
    get_wgpu_effect_pipeline(
        state,
        "lens.tiltShift",
        TILT_SHIFT_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(state, "lens.tiltShift", source, Some(dest), |f32s, _| {
        f32s[0] = center;
        f32s[1] = width_param;
        f32s[2] = blur;
        f32s[4] = width;
        f32s[5] = height;
    });
}

/// Applies a vignette to `source` and writes to `dest`.
pub fn apply_vignette_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &VignetteEffect,
) {
    let intensity = effect.intensity.unwrap_or(1.0);
    let radius = effect.radius.unwrap_or(0.75);
    let softness = effect.softness.unwrap_or(0.45);
    let color = effect.color.unwrap_or(0x000000ff);
    let r = ((color >> 24) & 0xff) as f32 / 255.0;
    let g = ((color >> 16) & 0xff) as f32 / 255.0;
    let b = ((color >> 8) & 0xff) as f32 / 255.0;
    let a = (color & 0xff) as f32 / 255.0;
    get_wgpu_effect_pipeline(
        state,
        "lens.vignette",
        VIGNETTE_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(state, "lens.vignette", source, Some(dest), |f32s, _| {
        f32s[0] = intensity;
        f32s[1] = radius;
        f32s[2] = softness;
        f32s[4] = r;
        f32s[5] = g;
        f32s[6] = b;
        f32s[7] = a;
    });
}

/// Default WGPU runner for [`BokehDepthOfFieldEffect`].
pub const DEFAULT_WGPU_BOKEH_DEPTH_OF_FIELD_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::BokehDepthOfField(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_bokeh_depth_of_field_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`ChromaticAberrationEffect`].
pub const DEFAULT_WGPU_CHROMATIC_ABERRATION_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::ChromaticAberration(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_chromatic_aberration_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`DisplacementEffect`].
pub const DEFAULT_WGPU_DISPLACEMENT_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Displacement(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_displacement_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`LensDirtEffect`].
pub const DEFAULT_WGPU_LENS_DIRT_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::LensDirt(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_lens_dirt_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`LensDistortionEffect`].
pub const DEFAULT_WGPU_LENS_DISTORTION_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::LensDistortion(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_lens_distortion_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`LensFlareEffect`].
pub const DEFAULT_WGPU_LENS_FLARE_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::LensFlare(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_lens_flare_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`TiltShiftEffect`].
pub const DEFAULT_WGPU_TILT_SHIFT_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::TiltShift(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_tilt_shift_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`VignetteEffect`].
pub const DEFAULT_WGPU_VIGNETTE_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Vignette(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_vignette_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

// Slot layout: [0]=maxBlur, [1]=pad, [2..3]=resolution.
const BOKEH_DOF_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms {
  u_maxBlur : f32,
  _pad0 : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let texel = vec2f(1.0) / uni.u_resolution;
  // No depth texture in WebGPU yet: circle of confusion is fixed, so the disc uses the full radius.
  let blur = uni.u_maxBlur;
  var sum = vec4f(0.0);
  var total = 0.0;
  for (var i = 0; i < 16; i = i + 1) {
    let ang = f32(i) * 0.39269908;
    let rad = (f32(i % 4) + 1.0) * 0.25;
    let offset = vec2f(cos(ang), sin(ang)) * rad * blur * texel;
    sum = sum + textureSampleLevel(tex, smp, uv + offset, 0.0);
    total = total + 1.0;
  }
  return sum / total;
}"#;

// Slot layout: [0]=intensity, [1]=radial flag (1.0/0.0).
const CHROMATIC_ABERRATION_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms {
  u_intensity : f32,
  u_radial : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let centered = uv - vec2f(0.5);
  let scale = mix(1.0, length(centered) * 2.0, uni.u_radial);
  let dir = mix(vec2f(1.0, 0.0), normalize(centered + vec2f(1e-5)), uni.u_radial);
  let offset = dir * uni.u_intensity * scale;
  let r = textureSampleLevel(tex, smp, uv + offset, 0.0).r;
  let g = textureSampleLevel(tex, smp, uv, 0.0).g;
  let b = textureSampleLevel(tex, smp, uv - offset, 0.0).b;
  let a = textureSampleLevel(tex, smp, uv, 0.0).a;
  return vec4f(r, g, b, a);
}"#;

// Slot layout: [0]=intensity, [1]=frequency, [2]=seed, [4..5]=resolution.
const DISPLACEMENT_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms {
  u_intensity : f32,
  u_frequency : f32,
  u_seed : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let f = uni.u_frequency;
  let warp = vec2f(
    sin(uv.y * f + uni.u_seed) + sin(uv.y * f * 2.3 + uni.u_seed * 1.7) * 0.5,
    cos(uv.x * f * 0.8 + uni.u_seed * 1.3)
  );
  let displaced = uv + warp * (uni.u_intensity / uni.u_resolution);
  return textureSampleLevel(tex, smp, displaced, 0.0);
}"#;

// Slot layout: [0]=intensity, [1]=threshold, [2]=seed.
const LENS_DIRT_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms {
  u_intensity : f32,
  u_threshold : f32,
  u_seed : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn dirtHash(p : vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453123); }

fn dirtAmount(uv : vec2f, seed : f32) -> f32 {
  var acc = 0.0;
  for (var i = 0; i < 8; i = i + 1) {
    let fi = f32(i);
    let c = vec2f(dirtHash(vec2f(fi, seed)), dirtHash(vec2f(fi + 9.0, seed)));
    let r = 0.06 + 0.16 * dirtHash(vec2f(fi + 3.0, seed));
    let d = distance(uv, c) / r;
    acc = acc + smoothstep(1.0, 0.0, d) * (0.3 + 0.7 * dirtHash(vec2f(fi + 5.0, seed)));
  }
  return clamp(acc, 0.0, 1.0);
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let lum = dot(c.rgb, vec3f(0.299, 0.587, 0.114));
  let bright = max(0.0, lum - uni.u_threshold);
  let dirt = dirtAmount(uv, uni.u_seed + 1.0);
  return vec4f(c.rgb + bright * dirt * uni.u_intensity * 2.0, c.a);
}"#;

// Slot layout: [0]=amount, [1]=scale.
const LENS_DISTORTION_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms {
  u_amount : f32,
  u_scale : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let centered = (uv - vec2f(0.5)) / uni.u_scale;
  let r2 = dot(centered, centered);
  let distorted = centered * (1.0 + uni.u_amount * r2) + vec2f(0.5);
  if (distorted.x < 0.0 || distorted.x > 1.0 || distorted.y < 0.0 || distorted.y > 1.0) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }
  return textureSampleLevel(tex, smp, distorted, 0.0);
}"#;

// Slot layout: [0]=threshold, [1]=intensity, [2]=ghosts, [3]=halo.
const LENS_FLARE_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms {
  u_threshold : f32,
  u_intensity : f32,
  u_ghosts : f32,
  u_halo : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn brightPass(uv : vec2f) -> vec3f {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return vec3f(0.0); }
  let c = textureSampleLevel(tex, smp, uv, 0.0).rgb;
  let l = dot(c, vec3f(0.2126, 0.7152, 0.0722));
  return c * max(0.0, l - uni.u_threshold);
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let scene = textureSampleLevel(tex, smp, uv, 0.0);
  let toCenter = vec2f(0.5) - uv;
  var flare = vec3f(0.0);
  let count = i32(clamp(uni.u_ghosts, 0.0, 8.0));
  for (var i = 0; i < 8; i = i + 1) {
    if (i >= count) { break; }
    let t = (f32(i) + 1.0) / (f32(count) + 1.0);
    let ghostUv = uv + toCenter * (2.0 * t);
    flare = flare + brightPass(ghostUv);
  }
  let haloDir = normalize(toCenter + vec2f(1e-5));
  flare = flare + brightPass(uv + haloDir * uni.u_halo) * uni.u_halo;
  return vec4f(scene.rgb + flare * uni.u_intensity, scene.a);
}"#;

// Slot layout: [0]=center, [1]=width, [2]=blur, [3]=pad, [4..5]=resolution.
const TILT_SHIFT_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms {
  u_center : f32,
  u_width : f32,
  u_blur : f32,
  _pad0 : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let texel = vec2f(1.0) / uni.u_resolution;
  let dist = abs(uv.y - uni.u_center);
  let edge = uni.u_width * 0.5;
  let amount = smoothstep(edge, edge + uni.u_width, dist);
  let radius = amount * uni.u_blur;
  var sum = vec4f(0.0);
  var total = 0.0;
  for (var i = -3; i <= 3; i = i + 1) {
    let offset = vec2f(0.0, f32(i)) * radius * texel;
    sum = sum + textureSampleLevel(tex, smp, uv + offset, 0.0);
    total = total + 1.0;
  }
  return sum / total;
}"#;

// Slot layout: [0]=intensity, [1]=radius, [2]=softness, [3]=pad, [4..7]=color rgba.
const VIGNETTE_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms {
  u_intensity : f32,
  u_radius : f32,
  u_softness : f32,
  _pad0 : f32,
  u_color : vec4f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let centered = uv - vec2f(0.5);
  let dist = length(centered) * 1.41421356;
  let vig = smoothstep(uni.u_radius, uni.u_radius - uni.u_softness, dist);
  let darken = (1.0 - vig) * uni.u_intensity * uni.u_color.a;
  return vec4f(mix(c.rgb, uni.u_color.rgb, darken), c.a);
}"#;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::effect_program_cache::build_wgpu_effect_module_wgsl;

    #[test]
    fn vignette_fragment_aligns_color_to_vec4_slot() {
        let module = build_wgpu_effect_module_wgsl(VIGNETTE_FRAGMENT_WGSL);
        assert!(module.contains("u_color : vec4f"));
        assert!(module.contains("u_softness"));
    }

    #[test]
    fn chromatic_aberration_fragment_supports_radial_flag() {
        let module = build_wgpu_effect_module_wgsl(CHROMATIC_ABERRATION_FRAGMENT_WGSL);
        assert!(module.contains("u_radial"));
        // R/G/B are sampled at offset/zero/-offset.
        assert!(module.contains("uv + offset"));
        assert!(module.contains("uv - offset"));
    }

    #[test]
    fn lens_distortion_fragment_remaps_radially() {
        let module = build_wgpu_effect_module_wgsl(LENS_DISTORTION_FRAGMENT_WGSL);
        assert!(module.contains("1.0 + uni.u_amount * r2"));
    }
}
