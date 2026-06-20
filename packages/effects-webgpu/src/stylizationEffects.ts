import { drawWebGPUFilterPass } from '@flighthq/filters-webgpu';
import type {
  CRTEffect,
  DitherEffect,
  FilmGrainEffect,
  HalftoneEffect,
  KuwaharaEffect,
  OutlineEffect,
  PixelateEffect,
  ScanlinesEffect,
  SharpenEffect,
  SketchEffect,
  WebGPURenderEffectRunner,
  WebGPURenderState,
  WebGPURenderTarget,
} from '@flighthq/types';

import { getWebGPUEffectPipeline } from './effectProgramCache';

// Stylization effect recipes: single-pass WGSL shaders for non-photoreal looks, the WebGPU mirror of
// effects-webgl's stylizationEffects.ts. Each apply* compiles (once per state) and draws a fullscreen
// pass; neighbor-sampling shaders receive u_resolution as the source pixel size so texel steps are
// exact. Outline's packed-RGBA color is unpacked to 0..1 in JS. Uniforms are written into the
// ring-buffer slot in struct field order; std140 alignment means a vec2f/vec4f field starts on its
// natural boundary, so the JS writes skip padding slots accordingly (noted per recipe).

// CRT: barrel-distort the uv (curvature), darken alternating scanlines, vignette the edges, and split
// the channels outward (chromatic aberration) for a tube-monitor look.
export function applyCRTEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<CRTEffect>,
): void {
  const curvature = effect.curvature ?? 0.1;
  const scanlineIntensity = effect.scanlineIntensity ?? 0.3;
  const vignette = effect.vignette ?? 0.3;
  const aberration = effect.aberration ?? 0.005;
  const pipeline = getWebGPUEffectPipeline(state, 'stylization.crt', CRT_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = curvature;
    f32[1] = scanlineIntensity;
    f32[2] = vignette;
    f32[3] = aberration;
    f32[4] = source.width;
    f32[5] = source.height;
  });
}

// Dither: quantize each channel to `levels` steps with a 4x4 ordered Bayer threshold for a retro
// banded-but-textured look.
export function applyDitherEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<DitherEffect>,
): void {
  const levels = effect.levels ?? 4;
  const pipeline = getWebGPUEffectPipeline(state, 'stylization.dither', DITHER_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = Math.max(2, levels);
    // u_resolution (vec2f) aligns to slot [2].
    f32[2] = source.width;
    f32[3] = source.height;
  });
}

// Film grain: add per-pixel hash noise scaled by intensity, with grain cell size and a seed so the
// noise can be animated frame to frame.
export function applyFilmGrainEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<FilmGrainEffect>,
): void {
  const intensity = effect.intensity ?? 0.1;
  const size = effect.size ?? 1;
  const seed = effect.seed ?? 0;
  const pipeline = getWebGPUEffectPipeline(state, 'stylization.filmGrain', FILM_GRAIN_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = intensity;
    f32[1] = Math.max(0.0001, size);
    f32[2] = seed;
  });
}

// Halftone: sample luminance, then carve a rotated dot grid whose dot radius tracks darkness — the
// classic print/comic screen. `scale` sets the cell size, `angle` rotates the grid.
export function applyHalftoneEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<HalftoneEffect>,
): void {
  const scale = effect.scale ?? 6;
  const angle = effect.angle ?? 0.4;
  const pipeline = getWebGPUEffectPipeline(state, 'stylization.halftone', HALFTONE_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = Math.max(1, scale);
    f32[1] = angle;
    // u_resolution (vec2f) aligns to slot [2].
    f32[2] = source.width;
    f32[3] = source.height;
  });
}

// Kuwahara: edge-preserving smoothing. Over a fixed small radius split the neighborhood into four
// overlapping quadrants, compute each mean and variance, and emit the lowest-variance mean — flattens
// regions while keeping edges crisp. `radius` gates the sampled extent.
export function applyKuwaharaEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<KuwaharaEffect>,
): void {
  const radius = effect.radius ?? 3;
  const pipeline = getWebGPUEffectPipeline(state, 'stylization.kuwahara', KUWAHARA_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = Math.max(1, radius);
    // u_resolution (vec2f) aligns to slot [2].
    f32[2] = source.width;
    f32[3] = source.height;
  });
}

// Outline: Sobel edge detection on luminance; where the gradient magnitude exceeds `threshold`, mix
// the pixel toward the outline color by `thickness`. Color arrives packed RGBA, unpacked to 0..1 here.
export function applyOutlineEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<OutlineEffect>,
): void {
  const threshold = effect.threshold ?? 0.2;
  const thickness = effect.thickness ?? 1;
  const color = effect.color ?? 0x000000ff;
  const r = ((color >>> 24) & 0xff) / 255;
  const g = ((color >>> 16) & 0xff) / 255;
  const b = ((color >>> 8) & 0xff) / 255;
  const a = (color & 0xff) / 255;
  const pipeline = getWebGPUEffectPipeline(state, 'stylization.outline', OUTLINE_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = threshold;
    f32[1] = thickness;
    // u_resolution (vec2f) aligns to slot [2].
    f32[2] = source.width;
    f32[3] = source.height;
    // u_color (vec4f) aligns to slot [4].
    f32[4] = r;
    f32[5] = g;
    f32[6] = b;
    f32[7] = a;
  });
}

// Pixelate: snap uv to the center of `size`-pixel blocks before sampling, producing hard mosaic blocks.
export function applyPixelateEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<PixelateEffect>,
): void {
  const size = effect.size ?? 8;
  const pipeline = getWebGPUEffectPipeline(state, 'stylization.pixelate', PIXELATE_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = Math.max(1, size);
    // u_resolution (vec2f) aligns to slot [2].
    f32[2] = source.width;
    f32[3] = source.height;
  });
}

// Scanlines: darken by a vertical sine band; `count` sets the line density, `intensity` the darkening.
export function applyScanlinesEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<ScanlinesEffect>,
): void {
  const count = effect.count ?? 240;
  const intensity = effect.intensity ?? 0.3;
  const pipeline = getWebGPUEffectPipeline(state, 'stylization.scanlines', SCANLINES_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = count;
    f32[1] = intensity;
  });
}

// Sharpen: unsharp mask via a 3x3 Laplacian kernel; `amount` scales the high-frequency boost.
export function applySharpenEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<SharpenEffect>,
): void {
  const amount = effect.amount ?? 0.5;
  const pipeline = getWebGPUEffectPipeline(state, 'stylization.sharpen', SHARPEN_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = amount;
    // u_resolution (vec2f) aligns to slot [2].
    f32[2] = source.width;
    f32[3] = source.height;
  });
}

// Sketch: detect luminance edges and invert them into dark pencil strokes over a light page; `strength`
// scales how dark the strokes get.
export function applySketchEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<SketchEffect>,
): void {
  const strength = effect.strength ?? 1;
  const pipeline = getWebGPUEffectPipeline(state, 'stylization.sketch', SKETCH_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = strength;
    // u_resolution (vec2f) aligns to slot [2].
    f32[2] = source.width;
    f32[3] = source.height;
  });
}

export const defaultWebGPUCRTEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyCRTEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as CRTEffect);
};

export const defaultWebGPUDitherEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyDitherEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as DitherEffect);
};

export const defaultWebGPUFilmGrainEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyFilmGrainEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as FilmGrainEffect);
};

export const defaultWebGPUHalftoneEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyHalftoneEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as HalftoneEffect);
};

export const defaultWebGPUKuwaharaEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyKuwaharaEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as KuwaharaEffect);
};

export const defaultWebGPUOutlineEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyOutlineEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as OutlineEffect);
};

export const defaultWebGPUPixelateEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyPixelateEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as PixelateEffect);
};

export const defaultWebGPUScanlinesEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyScanlinesEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as ScanlinesEffect);
};

export const defaultWebGPUSharpenEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applySharpenEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as SharpenEffect);
};

export const defaultWebGPUSketchEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applySketchEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as SketchEffect);
};

// Slot layout: [0]=curvature, [1]=scanlineIntensity, [2]=vignette, [3]=aberration, [4..5]=resolution.
const CRT_FRAGMENT_WGSL = /* wgsl */ `
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
}`;

// Slot layout: [0]=levels, [1]=pad, [2..3]=resolution.
const DITHER_FRAGMENT_WGSL = /* wgsl */ `
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
}`;

// Slot layout: [0]=intensity, [1]=size, [2]=seed.
const FILM_GRAIN_FRAGMENT_WGSL = /* wgsl */ `
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
}`;

// Slot layout: [0]=scale, [1]=angle, [2..3]=resolution.
const HALFTONE_FRAGMENT_WGSL = /* wgsl */ `
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
}`;

// Slot layout: [0]=radius, [1]=pad, [2..3]=resolution.
const KUWAHARA_FRAGMENT_WGSL = /* wgsl */ `
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
}`;

// Slot layout: [0]=threshold, [1]=thickness, [2..3]=resolution, [4..7]=color rgba.
const OUTLINE_FRAGMENT_WGSL = /* wgsl */ `
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
}`;

// Slot layout: [0]=size, [1]=pad, [2..3]=resolution.
const PIXELATE_FRAGMENT_WGSL = /* wgsl */ `
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
}`;

// Slot layout: [0]=count, [1]=intensity.
const SCANLINES_FRAGMENT_WGSL = /* wgsl */ `
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
}`;

// Slot layout: [0]=amount, [1]=pad, [2..3]=resolution.
const SHARPEN_FRAGMENT_WGSL = /* wgsl */ `
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
}`;

// Slot layout: [0]=strength, [1]=pad, [2..3]=resolution.
const SKETCH_FRAGMENT_WGSL = /* wgsl */ `
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
}`;
