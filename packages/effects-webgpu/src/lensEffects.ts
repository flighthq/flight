import { drawWebGPUFilterPass } from '@flighthq/filters-webgpu';
import type {
  BokehDepthOfFieldEffect,
  ChromaticAberrationEffect,
  DisplacementEffect,
  LensDirtEffect,
  LensDistortionEffect,
  LensFlareEffect,
  TiltShiftEffect,
  VignetteEffect,
  WebGPURenderEffectRunner,
  WebGPURenderState,
  WebGPURenderTarget,
} from '@flighthq/types';

import { getWebGPUEffectPipeline } from './effectProgramCache';

// Lens-camera effect recipes — the WebGPU mirrors of effects-webgl's lensEffects, ported to WGSL. Each
// is a single-pass fragment shader keyed and compiled once per state via getWebGPUEffectPipeline, then
// drawn with drawWebGPUFilterPass. Shaders work in centered coordinates (uv - 0.5) so radial math
// measures distance from the optical center; packed RGBA color ints are unpacked to normalized
// components in JS before upload. Each Uniforms struct is std140-aligned, so vec-aligned fields land on
// 16-byte boundaries and the setUniforms callback skips padding slots accordingly.

// Bokeh depth-of-field: a disc-shaped blur. The real DoF computes a per-pixel circle of confusion from a
// sampleable depth texture (focusDistance/focusRange) and scales the disc radius by it — but WebGPU does
// not produce a scene depth texture yet (ctx.sceneDepthTexture is null), so there is no second source to
// bind here. This recipe always falls back to a uniform disc blur of radius maxBlur. When the depth seam
// lands it can take a depth source as group 2 and recover the true circle of confusion, matching
// effects-webgl's applyBokehDepthOfFieldEffectToWebGL.
export function applyBokehDepthOfFieldEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<BokehDepthOfFieldEffect>,
): void {
  const maxBlur = effect.maxBlur ?? 4;
  const width = source.width;
  const height = source.height;
  const pipeline = getWebGPUEffectPipeline(state, 'lens.bokehDoF', BOKEH_DOF_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = maxBlur;
    f32[2] = width;
    f32[3] = height;
  });
}

// Chromatic aberration: sample the R/G/B channels at progressively larger offsets so colors fringe
// apart. When radial, the offset scales with distance from the optical center (true lens behavior);
// otherwise it is a uniform horizontal split.
export function applyChromaticAberrationEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<ChromaticAberrationEffect>,
): void {
  const intensity = effect.intensity ?? 0.005;
  const radial = effect.radial ?? true;
  const pipeline = getWebGPUEffectPipeline(
    state,
    'lens.chromaticAberration',
    CHROMATIC_ABERRATION_FRAGMENT_WGSL,
    'replace',
  );
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = intensity;
    f32[1] = radial ? 1 : 0;
  });
}

// Displacement / heat-haze: warp the sample uv by an animated sine field for a refractive wobble.
export function applyDisplacementEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<DisplacementEffect>,
): void {
  const intensity = effect.intensity ?? 8;
  const frequency = effect.frequency ?? 12;
  const seed = effect.seed ?? 0;
  const pipeline = getWebGPUEffectPipeline(state, 'lens.displacement', DISPLACEMENT_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = intensity;
    f32[1] = frequency;
    f32[2] = seed;
    // u_resolution (vec2f) aligns to slot [4].
    f32[4] = source.width;
    f32[5] = source.height;
  });
}

// Lens dirt: procedural soft smudges that brighten where the scene is bright — a cheap bloom-dirt overlay.
export function applyLensDirtEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<LensDirtEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  const threshold = effect.threshold ?? 0.55;
  const seed = effect.seed ?? 0;
  const pipeline = getWebGPUEffectPipeline(state, 'lens.lensDirt', LENS_DIRT_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = intensity;
    f32[1] = threshold;
    f32[2] = seed;
  });
}

// Lens distortion: remap uv by a radial polynomial. Positive amount bulges outward (barrel), negative
// pinches inward (pincushion); scale re-frames the result so corners stay in view.
export function applyLensDistortionEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<LensDistortionEffect>,
): void {
  const amount = effect.amount ?? 0.2;
  const scale = effect.scale ?? 1;
  const pipeline = getWebGPUEffectPipeline(state, 'lens.lensDistortion', LENS_DISTORTION_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = amount;
    f32[1] = scale;
  });
}

// Lens flare: a single-pass approximation. A true flare is a multi-pass recipe (downsample a bright
// pass, then accumulate ghosts and a halo from it). Here, on each fragment, we sample the source's
// bright spots along the vector from the pixel toward the center, adding `ghosts` evenly spaced ghost
// samples plus a halo ring, scaled by threshold/intensity. It previews the look without the bright-pass
// buffer.
export function applyLensFlareEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<LensFlareEffect>,
): void {
  const threshold = effect.threshold ?? 0.8;
  const intensity = effect.intensity ?? 1;
  const ghosts = effect.ghosts ?? 4;
  const halo = effect.halo ?? 0.5;
  const pipeline = getWebGPUEffectPipeline(state, 'lens.lensFlare', LENS_FLARE_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = threshold;
    f32[1] = intensity;
    f32[2] = ghosts;
    f32[3] = halo;
  });
}

// Tilt-shift: keep a horizontal focus band sharp and blur above and below it. The band is centered at
// `center` on Y with height `width`; blur strength ramps with distance outside the band. Blur is
// approximated by averaging a few neighbor taps using the pixel size from the resolution uniform.
export function applyTiltShiftEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<TiltShiftEffect>,
): void {
  const center = effect.center ?? 0.5;
  const width = effect.width ?? 0.3;
  const blur = effect.blur ?? 4;
  const pipeline = getWebGPUEffectPipeline(state, 'lens.tiltShift', TILT_SHIFT_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = center;
    f32[1] = width;
    f32[2] = blur;
    f32[4] = source.width;
    f32[5] = source.height;
  });
}

// Vignette: darken toward the edges. Pixels inside `radius` stay full bright; beyond it, brightness
// falls off over `softness` and the color is blended toward the (unpacked) vignette color by intensity.
// Single-pass reference recipe, the WebGPU mirror of effects-webgl's applyVignetteEffectToWebGL. The
// fragment works in centered coordinates (uv - 0.5) so radial math measures distance from the center;
// the packed RGBA color int is unpacked to normalized components in JS before upload.
export function applyVignetteEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<VignetteEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  const radius = effect.radius ?? 0.75;
  const softness = effect.softness ?? 0.45;
  const color = effect.color ?? 0x000000ff;
  const r = ((color >>> 24) & 0xff) / 255;
  const g = ((color >>> 16) & 0xff) / 255;
  const b = ((color >>> 8) & 0xff) / 255;
  const a = (color & 0xff) / 255;
  const pipeline = getWebGPUEffectPipeline(state, 'lens.vignette', VIGNETTE_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = intensity;
    f32[1] = radius;
    f32[2] = softness;
    f32[4] = r;
    f32[5] = g;
    f32[6] = b;
    f32[7] = a;
  });
}

export const defaultWebGPUBokehDepthOfFieldEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyBokehDepthOfFieldEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as BokehDepthOfFieldEffect);
};

export const defaultWebGPUChromaticAberrationEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyChromaticAberrationEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as ChromaticAberrationEffect);
};

export const defaultWebGPUDisplacementEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyDisplacementEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as DisplacementEffect);
};

export const defaultWebGPULensDirtEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyLensDirtEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as LensDirtEffect);
};

export const defaultWebGPULensDistortionEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyLensDistortionEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as LensDistortionEffect);
};

export const defaultWebGPULensFlareEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyLensFlareEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as LensFlareEffect);
};

export const defaultWebGPUTiltShiftEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyTiltShiftEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as TiltShiftEffect);
};

export const defaultWebGPUVignetteEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyVignetteEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as VignetteEffect);
};

// Slot layout: [0]=maxBlur, [1]=pad, [2..3]=resolution (vec2 aligned to 8 bytes). With no depth source
// the circle of confusion is fixed at 1.0, so the disc samples the full maxBlur radius everywhere.
const BOKEH_DOF_FRAGMENT_WGSL = /* wgsl */ `
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
    let ang = f32(i) * 0.39269908; // golden-ish angular step over the disc
    let rad = (f32(i % 4) + 1.0) * 0.25;
    let offset = vec2f(cos(ang), sin(ang)) * rad * blur * texel;
    sum = sum + textureSampleLevel(tex, smp, uv + offset, 0.0);
    total = total + 1.0;
  }
  return sum / total;
}`;

// Slot layout: [0]=intensity, [1]=radial flag (1.0/0.0).
const CHROMATIC_ABERRATION_FRAGMENT_WGSL = /* wgsl */ `
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
}`;

// Slot layout: [0]=amount, [1]=scale.
// Slot layout: [0]=intensity, [1]=frequency, [2]=seed, [4..5]=resolution.
const DISPLACEMENT_FRAGMENT_WGSL = /* wgsl */ `
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
}`;

// Slot layout: [0]=intensity, [1]=threshold, [2]=seed.
const LENS_DIRT_FRAGMENT_WGSL = /* wgsl */ `
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
}`;

const LENS_DISTORTION_FRAGMENT_WGSL = /* wgsl */ `
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
}`;

// Slot layout: [0]=threshold, [1]=intensity, [2]=ghosts, [3]=halo.
const LENS_FLARE_FRAGMENT_WGSL = /* wgsl */ `
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
  // Single-pass approximation of a flare: walk ghost samples along the vector toward the optical
  // center and add a halo ring, all from the bright pass of the scene itself (no separate buffer).
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
}`;

// Slot layout: [0]=center, [1]=width, [2]=blur, [3]=pad, [4..5]=resolution (vec2 aligned to 16 bytes).
const TILT_SHIFT_FRAGMENT_WGSL = /* wgsl */ `
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
}`;

// Slot layout: [0]=intensity, [1]=radius, [2]=softness, [3]=pad, [4..7]=color rgba. The std140-style
// struct aligns the vec4 color to a 16-byte boundary, so the JS writes skip slot [3].
const VIGNETTE_FRAGMENT_WGSL = /* wgsl */ `
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
}`;
