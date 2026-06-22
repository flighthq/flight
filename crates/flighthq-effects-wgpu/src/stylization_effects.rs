//! WGPU stylization effect recipes.
//!
//! Non-photoreal looks: film grain, scanlines, CRT, pixelation, halftone,
//! dithering, outlines, sharpening, Kuwahara oil-paint, glitch, and pencil
//! sketch.  Neighbor-sampling shaders receive `u_resolution` as the source
//! pixel size so texel steps are exact; outline's packed RGBA color is unpacked
//! before upload.
//!
//! Mirrors the TS `stylizationEffects` from `effects-webgpu`.

use flighthq_effects::RenderEffect;
use flighthq_effects::types::{
    CrtEffect, DitherEffect, FilmGrainEffect, GlitchEffect, HalftoneEffect, KuwaharaEffect,
    OutlineEffect, PixelateEffect, ScanlinesEffect, SharpenEffect, SketchEffect,
};
use flighthq_render_wgpu::render_state::{WgpuRenderState, WgpuRenderTarget};

use crate::effect_program_cache::{
    WgpuEffectBlend, draw_wgpu_effect_filter_pass, get_wgpu_effect_pipeline,
};
use crate::render_effect_registry::{WgpuRenderEffectContext, WgpuRenderEffectRunner};

/// Applies a CRT monitor simulation to `source` and writes to `dest`.
pub fn apply_crt_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &CrtEffect,
) {
    let curvature = effect.curvature.unwrap_or(0.1);
    let scanline_intensity = effect.scanline_intensity.unwrap_or(0.3);
    let vignette = effect.vignette.unwrap_or(0.3);
    let aberration = effect.aberration.unwrap_or(0.005);
    let width = source.width as f32;
    let height = source.height as f32;
    get_wgpu_effect_pipeline(
        state,
        "stylization.crt",
        CRT_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(state, "stylization.crt", source, Some(dest), |f32s, _| {
        f32s[0] = curvature;
        f32s[1] = scanline_intensity;
        f32s[2] = vignette;
        f32s[3] = aberration;
        f32s[4] = width;
        f32s[5] = height;
    });
}

/// Applies ordered dithering to `source` and writes to `dest`.
pub fn apply_dither_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &DitherEffect,
) {
    let levels = effect.levels.unwrap_or(4).max(2) as f32;
    let width = source.width as f32;
    let height = source.height as f32;
    get_wgpu_effect_pipeline(
        state,
        "stylization.dither",
        DITHER_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(
        state,
        "stylization.dither",
        source,
        Some(dest),
        |f32s, _| {
            f32s[0] = levels;
            f32s[2] = width;
            f32s[3] = height;
        },
    );
}

/// Applies animated film grain to `source` and writes to `dest`.
pub fn apply_film_grain_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &FilmGrainEffect,
) {
    let intensity = effect.intensity.unwrap_or(0.1);
    let size = effect.size.unwrap_or(1.0).max(0.0001);
    let seed = effect.seed.unwrap_or(0.0);
    get_wgpu_effect_pipeline(
        state,
        "stylization.filmGrain",
        FILM_GRAIN_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(
        state,
        "stylization.filmGrain",
        source,
        Some(dest),
        |f32s, _| {
            f32s[0] = intensity;
            f32s[1] = size;
            f32s[2] = seed;
        },
    );
}

/// Applies a digital glitch to `source` and writes to `dest`.
pub fn apply_glitch_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &GlitchEffect,
) {
    let intensity = effect.intensity.unwrap_or(0.5);
    let block_size = effect.block_size.unwrap_or(24.0);
    let color_shift = effect.color_shift.unwrap_or(8.0);
    let seed = effect.seed.unwrap_or(0.0);
    let width = source.width as f32;
    let height = source.height as f32;
    get_wgpu_effect_pipeline(
        state,
        "stylization.glitch",
        GLITCH_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(
        state,
        "stylization.glitch",
        source,
        Some(dest),
        |f32s, _| {
            f32s[0] = intensity;
            f32s[1] = block_size;
            f32s[2] = color_shift;
            f32s[3] = seed;
            f32s[4] = width;
            f32s[5] = height;
        },
    );
}

/// Applies a halftone dot pattern to `source` and writes to `dest`.
pub fn apply_halftone_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &HalftoneEffect,
) {
    let scale = effect.scale.unwrap_or(6.0).max(1.0);
    let angle = effect.angle.unwrap_or(0.4);
    let width = source.width as f32;
    let height = source.height as f32;
    get_wgpu_effect_pipeline(
        state,
        "stylization.halftone",
        HALFTONE_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(
        state,
        "stylization.halftone",
        source,
        Some(dest),
        |f32s, _| {
            f32s[0] = scale;
            f32s[1] = angle;
            f32s[2] = width;
            f32s[3] = height;
        },
    );
}

/// Applies a Kuwahara oil-paint filter to `source` and writes to `dest`.
pub fn apply_kuwahara_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &KuwaharaEffect,
) {
    let radius = effect.radius.unwrap_or(3).max(1) as f32;
    let width = source.width as f32;
    let height = source.height as f32;
    get_wgpu_effect_pipeline(
        state,
        "stylization.kuwahara",
        KUWAHARA_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(
        state,
        "stylization.kuwahara",
        source,
        Some(dest),
        |f32s, _| {
            f32s[0] = radius;
            f32s[2] = width;
            f32s[3] = height;
        },
    );
}

/// Applies edge outlining to `source` and writes to `dest`.
pub fn apply_outline_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &OutlineEffect,
) {
    let threshold = effect.threshold.unwrap_or(0.2);
    let thickness = effect.thickness.unwrap_or(1.0);
    let color = effect.color.unwrap_or(0x000000ff);
    let r = ((color >> 24) & 0xff) as f32 / 255.0;
    let g = ((color >> 16) & 0xff) as f32 / 255.0;
    let b = ((color >> 8) & 0xff) as f32 / 255.0;
    let a = (color & 0xff) as f32 / 255.0;
    let width = source.width as f32;
    let height = source.height as f32;
    get_wgpu_effect_pipeline(
        state,
        "stylization.outline",
        OUTLINE_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(
        state,
        "stylization.outline",
        source,
        Some(dest),
        |f32s, _| {
            f32s[0] = threshold;
            f32s[1] = thickness;
            f32s[2] = width;
            f32s[3] = height;
            f32s[4] = r;
            f32s[5] = g;
            f32s[6] = b;
            f32s[7] = a;
        },
    );
}

/// Applies block pixelation to `source` and writes to `dest`.
pub fn apply_pixelate_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &PixelateEffect,
) {
    let size = effect.size.unwrap_or(8.0).max(1.0);
    let width = source.width as f32;
    let height = source.height as f32;
    get_wgpu_effect_pipeline(
        state,
        "stylization.pixelate",
        PIXELATE_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(
        state,
        "stylization.pixelate",
        source,
        Some(dest),
        |f32s, _| {
            f32s[0] = size;
            f32s[2] = width;
            f32s[3] = height;
        },
    );
}

/// Applies horizontal scanlines to `source` and writes to `dest`.
pub fn apply_scanlines_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &ScanlinesEffect,
) {
    let count = effect.count.unwrap_or(240.0);
    let intensity = effect.intensity.unwrap_or(0.3);
    get_wgpu_effect_pipeline(
        state,
        "stylization.scanlines",
        SCANLINES_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(
        state,
        "stylization.scanlines",
        source,
        Some(dest),
        |f32s, _| {
            f32s[0] = count;
            f32s[1] = intensity;
        },
    );
}

/// Applies an unsharp-mask sharpen to `source` and writes to `dest`.
pub fn apply_sharpen_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &SharpenEffect,
) {
    let amount = effect.amount.unwrap_or(0.5);
    let width = source.width as f32;
    let height = source.height as f32;
    get_wgpu_effect_pipeline(
        state,
        "stylization.sharpen",
        SHARPEN_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(
        state,
        "stylization.sharpen",
        source,
        Some(dest),
        |f32s, _| {
            f32s[0] = amount;
            f32s[2] = width;
            f32s[3] = height;
        },
    );
}

/// Applies a pencil-sketch stylization to `source` and writes to `dest`.
pub fn apply_sketch_effect_to_wgpu(
    state: &mut WgpuRenderState,
    source: &WgpuRenderTarget,
    dest: &WgpuRenderTarget,
    effect: &SketchEffect,
) {
    let strength = effect.strength.unwrap_or(1.0);
    let width = source.width as f32;
    let height = source.height as f32;
    get_wgpu_effect_pipeline(
        state,
        "stylization.sketch",
        SKETCH_FRAGMENT_WGSL,
        WgpuEffectBlend::Replace,
    );
    draw_wgpu_effect_filter_pass(
        state,
        "stylization.sketch",
        source,
        Some(dest),
        |f32s, _| {
            f32s[0] = strength;
            f32s[2] = width;
            f32s[3] = height;
        },
    );
}

/// Default WGPU runner for [`CrtEffect`].
pub const DEFAULT_WGPU_CRT_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Crt(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_crt_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`DitherEffect`].
pub const DEFAULT_WGPU_DITHER_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Dither(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_dither_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`FilmGrainEffect`].
pub const DEFAULT_WGPU_FILM_GRAIN_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::FilmGrain(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_film_grain_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`GlitchEffect`].
pub const DEFAULT_WGPU_GLITCH_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Glitch(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_glitch_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`HalftoneEffect`].
pub const DEFAULT_WGPU_HALFTONE_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Halftone(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_halftone_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`KuwaharaEffect`].
pub const DEFAULT_WGPU_KUWAHARA_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Kuwahara(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_kuwahara_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`OutlineEffect`].
pub const DEFAULT_WGPU_OUTLINE_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Outline(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_outline_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`PixelateEffect`].
pub const DEFAULT_WGPU_PIXELATE_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Pixelate(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_pixelate_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`ScanlinesEffect`].
pub const DEFAULT_WGPU_SCANLINES_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Scanlines(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_scanlines_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`SharpenEffect`].
pub const DEFAULT_WGPU_SHARPEN_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Sharpen(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_sharpen_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

/// Default WGPU runner for [`SketchEffect`].
pub const DEFAULT_WGPU_SKETCH_EFFECT_RUNNER: WgpuRenderEffectRunner =
    |ctx: &mut WgpuRenderEffectContext, effect: &RenderEffect| {
        if let RenderEffect::Sketch(effect) = effect {
            // SAFETY: the pipeline guarantees source/dest are live and disjoint from state.
            let (source, dest) = unsafe { (&*ctx.source, &*ctx.dest) };
            apply_sketch_effect_to_wgpu(ctx.state, source, dest, effect);
        }
    };

// Slot layout: [0]=curvature, [1]=scanlineIntensity, [2]=vignette, [3]=aberration, [4..5]=resolution.
const CRT_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
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

// Slot layout: [0]=levels, [1]=pad, [2..3]=resolution.
const DITHER_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms {
  u_levels : f32,
  _pad0 : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn bayer(p : vec2i) -> f32 {
  let x = p.x & 3;
  let y = p.y & 3;
  var m = array<i32, 16>(0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return f32(m[y * 4 + x]) / 16.0;
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let px = vec2i(uv * uni.u_resolution);
  let t = bayer(px) - 0.5;
  let steps = uni.u_levels - 1.0;
  let q = floor(c.rgb * steps + 0.5 + t) / steps;
  return vec4f(clamp(q, vec3f(0.0), vec3f(1.0)), c.a);
}"#;

// Slot layout: [0]=intensity, [1]=size, [2]=seed.
const FILM_GRAIN_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
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

// Slot layout: [0]=intensity, [1]=blockSize, [2]=colorShift, [3]=seed, [4..5]=resolution.
const GLITCH_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
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
  let tear = step(1.0 - uni.u_intensity * 0.6, r);
  let shiftPx = (glitchHash(block * 1.7 + uni.u_seed) - 0.5) * 2.0 * tear * uni.u_intensity * 40.0;
  let baseUv = vec2f(uv.x + shiftPx / uni.u_resolution.x, uv.y);
  let cs = (uni.u_colorShift * (0.4 + tear)) / uni.u_resolution.x;
  let rC = textureSampleLevel(tex, smp, vec2f(baseUv.x + cs, baseUv.y), 0.0).r;
  let gC = textureSampleLevel(tex, smp, baseUv, 0.0).g;
  let bC = textureSampleLevel(tex, smp, vec2f(baseUv.x - cs, baseUv.y), 0.0).b;
  let a = textureSampleLevel(tex, smp, baseUv, 0.0).a;
  var col = vec3f(rC, gC, bC);
  let corrupt = step(0.985 - uni.u_intensity * 0.04, glitchHash(block * 3.3 + uni.u_seed * 2.0));
  col = mix(col, vec3f(1.0), corrupt * 0.6);
  return vec4f(col, a);
}"#;

// Slot layout: [0]=scale, [1]=angle, [2..3]=resolution.
const HALFTONE_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms {
  u_scale : f32,
  u_angle : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let lum = dot(c.rgb, vec3f(0.2126, 0.7152, 0.0722));
  let p = uv * uni.u_resolution;
  let s = sin(uni.u_angle);
  let co = cos(uni.u_angle);
  let rp = vec2f(p.x * co - p.y * s, p.x * s + p.y * co);
  let cell = (rp % vec2f(uni.u_scale)) - uni.u_scale * 0.5;
  let dist = length(cell) / (uni.u_scale * 0.5);
  let radius = sqrt(1.0 - lum);
  let dot1 = step(dist, radius);
  return vec4f(c.rgb * dot1, c.a);
}"#;

// Slot layout: [0]=radius, [1]=pad, [2..3]=resolution.
const KUWAHARA_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
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
  var lo = array<vec2i, 4>(vec2i(-1, -1), vec2i(0, -1), vec2i(-1, 0), vec2i(0, 0));
  for (var q = 0; q < 4; q++) {
    var sum = vec3f(0.0);
    var sumSq = vec3f(0.0);
    var n = 0.0;
    for (var y = 0; y <= R; y++) {
      for (var x = 0; x <= R; x++) {
        if (x > r || y > r) { continue; }
        let d = vec2i(x, y) * sign(lo[q] + vec2i(1)) + lo[q] * r;
        let off = vec2f(f32(d.x), f32(d.y)) * texel;
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
  for (var q = 1; q < 4; q++) {
    if (vars[q] < minVar) {
      minVar = vars[q];
      result = means[q];
    }
  }
  return vec4f(result, textureSampleLevel(tex, smp, uv, 0.0).a);
}"#;

// Slot layout: [0]=threshold, [1]=thickness, [2..3]=resolution, [4..7]=color rgba.
const OUTLINE_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms {
  u_threshold : f32,
  u_thickness : f32,
  u_resolution : vec2f,
  u_color : vec4f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn lum(uv : vec2f) -> f32 {
  return dot(textureSampleLevel(tex, smp, uv, 0.0).rgb, vec3f(0.2126, 0.7152, 0.0722));
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let texel = uni.u_thickness / uni.u_resolution;
  let tl = lum(uv + texel * vec2f(-1.0, -1.0));
  let t = lum(uv + texel * vec2f(0.0, -1.0));
  let tr = lum(uv + texel * vec2f(1.0, -1.0));
  let l = lum(uv + texel * vec2f(-1.0, 0.0));
  let rr = lum(uv + texel * vec2f(1.0, 0.0));
  let bl = lum(uv + texel * vec2f(-1.0, 1.0));
  let b = lum(uv + texel * vec2f(0.0, 1.0));
  let br = lum(uv + texel * vec2f(1.0, 1.0));
  let gx = -tl - 2.0 * l - bl + tr + 2.0 * rr + br;
  let gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  let edge = sqrt(gx * gx + gy * gy);
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let k = step(uni.u_threshold, edge);
  return mix(c, uni.u_color, k * uni.u_color.a);
}"#;

// Slot layout: [0]=size, [1]=pad, [2..3]=resolution.
const PIXELATE_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms {
  u_size : f32,
  _pad0 : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uvIn : vec2f) -> @location(0) vec4f {
  let blocks = uni.u_resolution / uni.u_size;
  let uv = (floor(uvIn * blocks) + 0.5) / blocks;
  return textureSampleLevel(tex, smp, uv, 0.0);
}"#;

// Slot layout: [0]=count, [1]=intensity.
const SCANLINES_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms {
  u_count : f32,
  u_intensity : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let line = sin(uv.y * uni.u_count * 3.14159265) * 0.5 + 0.5;
  return vec4f(c.rgb * (1.0 - uni.u_intensity * (1.0 - line)), c.a);
}"#;

// Slot layout: [0]=amount, [1]=pad, [2..3]=resolution.
const SHARPEN_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms {
  u_amount : f32,
  _pad0 : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let texel = 1.0 / uni.u_resolution;
  let c = textureSampleLevel(tex, smp, uv, 0.0).rgb;
  let n = textureSampleLevel(tex, smp, uv + vec2f(0.0, -texel.y), 0.0).rgb;
  let s = textureSampleLevel(tex, smp, uv + vec2f(0.0, texel.y), 0.0).rgb;
  let e = textureSampleLevel(tex, smp, uv + vec2f(texel.x, 0.0), 0.0).rgb;
  let w = textureSampleLevel(tex, smp, uv + vec2f(-texel.x, 0.0), 0.0).rgb;
  let high = c * 4.0 - n - s - e - w;
  let a = textureSampleLevel(tex, smp, uv, 0.0).a;
  return vec4f(clamp(c + high * uni.u_amount, vec3f(0.0), vec3f(1.0)), a);
}"#;

// Slot layout: [0]=strength, [1]=pad, [2..3]=resolution.
const SKETCH_FRAGMENT_WGSL: &str = /* wgsl */
    r#"
struct Uniforms {
  u_strength : f32,
  _pad0 : f32,
  u_resolution : vec2f,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn lum(uv : vec2f) -> f32 {
  return dot(textureSampleLevel(tex, smp, uv, 0.0).rgb, vec3f(0.2126, 0.7152, 0.0722));
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let texel = 1.0 / uni.u_resolution;
  let tl = lum(uv + texel * vec2f(-1.0, -1.0));
  let t = lum(uv + texel * vec2f(0.0, -1.0));
  let tr = lum(uv + texel * vec2f(1.0, -1.0));
  let l = lum(uv + texel * vec2f(-1.0, 0.0));
  let rr = lum(uv + texel * vec2f(1.0, 0.0));
  let bl = lum(uv + texel * vec2f(-1.0, 1.0));
  let b = lum(uv + texel * vec2f(0.0, 1.0));
  let br = lum(uv + texel * vec2f(1.0, 1.0));
  let gx = -tl - 2.0 * l - bl + tr + 2.0 * rr + br;
  let gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  let edge = sqrt(gx * gx + gy * gy);
  let pencil = clamp(1.0 - edge * uni.u_strength, 0.0, 1.0);
  let a = textureSampleLevel(tex, smp, uv, 0.0).a;
  return vec4f(vec3f(pencil), a);
}"#;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::effect_program_cache::build_wgpu_effect_module_wgsl;

    #[test]
    fn dither_fragment_uses_bayer_matrix() {
        let module = build_wgpu_effect_module_wgsl(DITHER_FRAGMENT_WGSL);
        assert!(module.contains("array<i32, 16>(0, 8, 2, 10"));
        assert!(module.contains("u_levels"));
    }

    #[test]
    fn outline_fragment_aligns_color_to_vec4_slot() {
        let module = build_wgpu_effect_module_wgsl(OUTLINE_FRAGMENT_WGSL);
        assert!(module.contains("u_resolution : vec2f"));
        assert!(module.contains("u_color : vec4f"));
        // Sobel kernel weights present.
        assert!(module.contains("2.0 * l"));
    }

    #[test]
    fn crt_fragment_barrel_distorts_and_scanlines() {
        let module = build_wgpu_effect_module_wgsl(CRT_FRAGMENT_WGSL);
        assert!(module.contains("fn barrel"));
        assert!(module.contains("u_scanlineIntensity"));
        assert!(module.contains("u_aberration"));
    }
}
