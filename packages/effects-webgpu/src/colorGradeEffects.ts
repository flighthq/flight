import { drawWebGPUFilterPass } from '@flighthq/filters-webgpu';
import type {
  BrightnessContrastEffect,
  ChannelMixerEffect,
  ColorGradeEffect,
  GrayscaleEffect,
  HueSaturationEffect,
  InvertEffect,
  LiftGammaGainEffect,
  LookupTableGradeEffect,
  PosterizeEffect,
  SepiaEffect,
  WebGPURenderEffectRunner,
  WebGPURenderState,
  WebGPURenderTarget,
  WhiteBalanceEffect,
} from '@flighthq/types';

import { getWebGPUEffectPipeline } from './effectProgramCache';

// Single-pass color-grading recipes, the WebGPU mirror of effects-webgl's colorGradeEffects, ported to
// WGSL. Each reads `source`, writes `dest`, and compiles its fragment once per state via
// getWebGPUEffectPipeline with a 'replace' blend. Packed-RGBA intent fields (lift/gamma/gain) are
// unpacked to normalized floats here in JS before upload. Uniforms are written into the f32/i32 slot in
// struct field order, std140-aligned: scalars pack into the leading vec4 and vec4f members start on a
// 16-byte (slot-of-4) boundary.

// Brightness/contrast: shift then scale about mid-grey.
export function applyBrightnessContrastEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<BrightnessContrastEffect>,
): void {
  const brightness = effect.brightness ?? 0;
  const contrast = effect.contrast ?? 1;
  const pipeline = getWebGPUEffectPipeline(
    state,
    'colorGrade.brightnessContrast',
    BRIGHTNESS_CONTRAST_FRAGMENT_WGSL,
    'replace',
  );
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = brightness;
    f32[1] = contrast;
  });
}

// Channel mixer: apply a 3x4 row-major RGB->RGB matrix plus per-row offset. The matrix is uploaded as
// three vec4f rows (r/g/b), each 16-byte aligned, so the std140 layout maps a row directly onto a slot.
export function applyChannelMixerEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<ChannelMixerEffect>,
): void {
  const matrix = new Float32Array(12);
  for (let i = 0; i < 12; i++) matrix[i] = effect.matrix[i] ?? IDENTITY_CHANNEL_MIXER[i];
  const pipeline = getWebGPUEffectPipeline(state, 'colorGrade.channelMixer', CHANNEL_MIXER_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    for (let i = 0; i < 12; i++) f32[i] = matrix[i];
  });
}

// Color grade: combined exposure, brightness, contrast, saturation, and temperature/tint shift.
export function applyColorGradeEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<ColorGradeEffect>,
): void {
  const exposure = Math.pow(2, effect.exposure ?? 0);
  const contrast = effect.contrast ?? 1;
  const saturation = effect.saturation ?? 1;
  const temperature = effect.temperature ?? 0;
  const tint = effect.tint ?? 0;
  const brightness = effect.brightness ?? 0;
  const pipeline = getWebGPUEffectPipeline(state, 'colorGrade.colorGrade', COLOR_GRADE_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = exposure;
    f32[1] = contrast;
    f32[2] = saturation;
    f32[3] = temperature;
    f32[4] = tint;
    f32[5] = brightness;
  });
}

// Grayscale: mix toward luminance by intensity.
export function applyGrayscaleEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<GrayscaleEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  const pipeline = getWebGPUEffectPipeline(state, 'colorGrade.grayscale', GRAYSCALE_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = intensity;
  });
}

// Hue/saturation/lightness: convert to HSL, adjust, convert back.
export function applyHueSaturationEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<HueSaturationEffect>,
): void {
  const hue = (effect.hue ?? 0) / 360;
  const saturation = effect.saturation ?? 1;
  const lightness = effect.lightness ?? 0;
  const pipeline = getWebGPUEffectPipeline(state, 'colorGrade.hueSaturation', HUE_SATURATION_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = hue;
    f32[1] = saturation;
    f32[2] = lightness;
  });
}

// Invert: mix toward 1 - rgb by intensity.
export function applyInvertEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<InvertEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  const pipeline = getWebGPUEffectPipeline(state, 'colorGrade.invert', INVERT_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = intensity;
  });
}

// Lift/gamma/gain: unpack packed-RGBA neutrals to per-channel offsets/exponents/multipliers in JS.
// Neutral packed values: lift 0x000000ff, gamma 0x808080ff, gain 0xffffffff. Each vec3 is uploaded
// into its own 16-byte-aligned slot so the std140 vec3 alignment is satisfied.
export function applyLiftGammaGainEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<LiftGammaGainEffect>,
): void {
  const lift = unpackColor(effect.lift ?? 0x000000ff);
  const gammaRaw = unpackColor(effect.gamma ?? 0x808080ff);
  const gain = unpackColor(effect.gain ?? 0xffffffff);
  // Map gamma's 0.5-neutral to a 1.0-neutral exponent so 0x808080 leaves the image unchanged.
  const gamma: readonly [number, number, number] = [
    1 / Math.max(gammaRaw[0] * 2, 1e-3),
    1 / Math.max(gammaRaw[1] * 2, 1e-3),
    1 / Math.max(gammaRaw[2] * 2, 1e-3),
  ];
  const pipeline = getWebGPUEffectPipeline(state, 'colorGrade.liftGammaGain', LIFT_GAMMA_GAIN_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = lift[0];
    f32[1] = lift[1];
    f32[2] = lift[2];
    f32[4] = gamma[0];
    f32[5] = gamma[1];
    f32[6] = gamma[2];
    f32[8] = gain[0];
    f32[9] = gain[1];
    f32[10] = gain[2];
  });
}

// LUT grade: passthrough with a strength mix. A real 3D LUT grade needs an uploaded LUT cube texture
// (size from effect.size) sampled per pixel as an extra bound texture; that texture path is not yet
// wired, so this keeps the pass compiling and color-neutral until the LUT upload is added.
export function applyLookupTableGradeEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<LookupTableGradeEffect>,
): void {
  const strength = effect.strength ?? 1;
  const pipeline = getWebGPUEffectPipeline(state, 'colorGrade.lutGrade', LUT_GRADE_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = strength;
  });
}

// Posterize: floor each channel to `levels` discrete steps.
export function applyPosterizeEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<PosterizeEffect>,
): void {
  const levels = Math.max(2, effect.levels ?? 8);
  const pipeline = getWebGPUEffectPipeline(state, 'colorGrade.posterize', POSTERIZE_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = levels;
  });
}

// Sepia: mix toward a sepia matrix transform by intensity.
export function applySepiaEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<SepiaEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  const pipeline = getWebGPUEffectPipeline(state, 'colorGrade.sepia', SEPIA_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = intensity;
  });
}

// White balance: warm/cool temperature and magenta/green tint channel shift.
export function applyWhiteBalanceEffectToWebGPU(
  state: WebGPURenderState,
  source: Readonly<WebGPURenderTarget>,
  dest: Readonly<WebGPURenderTarget>,
  effect: Readonly<WhiteBalanceEffect>,
): void {
  const temperature = effect.temperature ?? 0;
  const tint = effect.tint ?? 0;
  const pipeline = getWebGPUEffectPipeline(state, 'colorGrade.whiteBalance', WHITE_BALANCE_FRAGMENT_WGSL, 'replace');
  drawWebGPUFilterPass(state, source as WebGPURenderTarget, dest as WebGPURenderTarget, pipeline, (f32) => {
    f32[0] = temperature;
    f32[1] = tint;
  });
}

export const defaultWebGPUBrightnessContrastEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyBrightnessContrastEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as BrightnessContrastEffect);
};

export const defaultWebGPUChannelMixerEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyChannelMixerEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as ChannelMixerEffect);
};

export const defaultWebGPUColorGradeEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyColorGradeEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as ColorGradeEffect);
};

export const defaultWebGPUGrayscaleEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyGrayscaleEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as GrayscaleEffect);
};

export const defaultWebGPUHueSaturationEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyHueSaturationEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as HueSaturationEffect);
};

export const defaultWebGPUInvertEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyInvertEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as InvertEffect);
};

export const defaultWebGPULiftGammaGainEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyLiftGammaGainEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as LiftGammaGainEffect);
};

export const defaultWebGPULookupTableGradeEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyLookupTableGradeEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as LookupTableGradeEffect);
};

export const defaultWebGPUPosterizeEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyPosterizeEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as PosterizeEffect);
};

export const defaultWebGPUSepiaEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applySepiaEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as SepiaEffect);
};

export const defaultWebGPUWhiteBalanceEffectRunner: WebGPURenderEffectRunner = (ctx, effect) => {
  applyWhiteBalanceEffectToWebGPU(ctx.state, ctx.source, ctx.dest, effect as WhiteBalanceEffect);
};

// Unpack a packed RGBA integer (0xRRGGBBAA) into normalized [r, g, b] floats. Alpha is dropped — these
// grade values describe RGB channels only.
function unpackColor(c: number): readonly [number, number, number] {
  return [((c >>> 24) & 255) / 255, ((c >>> 16) & 255) / 255, ((c >>> 8) & 255) / 255];
}

const IDENTITY_CHANNEL_MIXER: readonly number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

// Slot layout: [0]=brightness, [1]=contrast.
const BRIGHTNESS_CONTRAST_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { u_brightness : f32, u_contrast : f32, _pad0 : f32, _pad1 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let rgb = (c.rgb + uni.u_brightness - 0.5) * uni.u_contrast + 0.5;
  return vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)), c.a);
}`;

// Slot layout: three vec4f rows, each 16-byte aligned — [0..3]=row r, [4..7]=row g, [8..11]=row b.
const CHANNEL_MIXER_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { u_row_r : vec4f, u_row_g : vec4f, u_row_b : vec4f, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let r = uni.u_row_r.x * c.r + uni.u_row_r.y * c.g + uni.u_row_r.z * c.b + uni.u_row_r.w;
  let g = uni.u_row_g.x * c.r + uni.u_row_g.y * c.g + uni.u_row_g.z * c.b + uni.u_row_g.w;
  let b = uni.u_row_b.x * c.r + uni.u_row_b.y * c.g + uni.u_row_b.z * c.b + uni.u_row_b.w;
  return vec4f(clamp(vec3f(r, g, b), vec3f(0.0), vec3f(1.0)), c.a);
}`;

// Slot layout: [0]=exposure, [1]=contrast, [2]=saturation, [3]=temperature, [4]=tint, [5]=brightness.
const COLOR_GRADE_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms {
  u_exposure : f32,
  u_contrast : f32,
  u_saturation : f32,
  u_temperature : f32,
  u_tint : f32,
  u_brightness : f32,
  _pad0 : f32,
  _pad1 : f32,
}
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  var rgb = c.rgb * uni.u_exposure + uni.u_brightness;
  rgb.r += uni.u_temperature * 0.5;
  rgb.b -= uni.u_temperature * 0.5;
  rgb.g += uni.u_tint * 0.5;
  let l = dot(rgb, vec3f(0.2126, 0.7152, 0.0722));
  rgb = mix(vec3f(l), rgb, uni.u_saturation);
  rgb = (rgb - 0.5) * uni.u_contrast + 0.5;
  return vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)), c.a);
}`;

// Slot layout: [0]=intensity.
const GRAYSCALE_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { u_intensity : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let l = dot(c.rgb, vec3f(0.2126, 0.7152, 0.0722));
  return vec4f(mix(c.rgb, vec3f(l), uni.u_intensity), c.a);
}`;

// Slot layout: [0]=hue (turns), [1]=saturation, [2]=lightness.
const HUE_SATURATION_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { u_hue : f32, u_saturation : f32, u_lightness : f32, _pad0 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

fn rgb2hsl(c : vec3f) -> vec3f {
  let mx = max(c.r, max(c.g, c.b));
  let mn = min(c.r, min(c.g, c.b));
  let l = (mx + mn) * 0.5;
  var h = 0.0;
  var s = 0.0;
  let d = mx - mn;
  if (d > 0.0001) {
    s = select(d / (2.0 - mx - mn), d / (mx + mn), l < 0.5);
    if (mx == c.r) {
      h = (c.g - c.b) / d + select(0.0, 6.0, c.g < c.b);
    } else if (mx == c.g) {
      h = (c.b - c.r) / d + 2.0;
    } else {
      h = (c.r - c.g) / d + 4.0;
    }
    h /= 6.0;
  }
  return vec3f(h, s, l);
}

fn hue2rgb(p : f32, q : f32, t_in : f32) -> f32 {
  var t = t_in;
  if (t < 0.0) { t += 1.0; }
  if (t > 1.0) { t -= 1.0; }
  if (t < 1.0 / 6.0) { return p + (q - p) * 6.0 * t; }
  if (t < 1.0 / 2.0) { return q; }
  if (t < 2.0 / 3.0) { return p + (q - p) * (2.0 / 3.0 - t) * 6.0; }
  return p;
}

fn hsl2rgb(hsl : vec3f) -> vec3f {
  let h = hsl.x;
  let s = hsl.y;
  let l = hsl.z;
  if (s <= 0.0) { return vec3f(l); }
  let q = select(l + s - l * s, l * (1.0 + s), l < 0.5);
  let p = 2.0 * l - q;
  return vec3f(hue2rgb(p, q, h + 1.0 / 3.0), hue2rgb(p, q, h), hue2rgb(p, q, h - 1.0 / 3.0));
}

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  var hsl = rgb2hsl(c.rgb);
  hsl.x = fract(hsl.x + uni.u_hue);
  hsl.y = clamp(hsl.y * uni.u_saturation, 0.0, 1.0);
  hsl.z = clamp(hsl.z + uni.u_lightness, 0.0, 1.0);
  return vec4f(hsl2rgb(hsl), c.a);
}`;

// Slot layout: [0]=intensity.
const INVERT_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { u_intensity : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  return vec4f(mix(c.rgb, vec3f(1.0) - c.rgb, uni.u_intensity), c.a);
}`;

// Slot layout: three vec3 in 16-byte-aligned slots — [0..2]=lift, [4..6]=gamma, [8..10]=gain.
const LIFT_GAMMA_GAIN_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { u_lift : vec3f, u_gamma : vec3f, u_gain : vec3f, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  var rgb = c.rgb * uni.u_gain + uni.u_lift * (vec3f(1.0) - c.rgb);
  rgb = pow(max(rgb, vec3f(0.0)), uni.u_gamma);
  return vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)), c.a);
}`;

// Slot layout: [0]=strength.
const LUT_GRADE_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { u_strength : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  // Passthrough: a real 3D LUT samples an uploaded LUT cube texture here, then mixes by u_strength.
  let graded = c.rgb;
  return vec4f(mix(c.rgb, graded, uni.u_strength), c.a);
}`;

// Slot layout: [0]=levels.
const POSTERIZE_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { u_levels : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let rgb = floor(c.rgb * uni.u_levels) / (uni.u_levels - 1.0);
  return vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)), c.a);
}`;

// Slot layout: [0]=intensity.
const SEPIA_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { u_intensity : f32, _pad0 : f32, _pad1 : f32, _pad2 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  let sepia = vec3f(
    dot(c.rgb, vec3f(0.393, 0.769, 0.189)),
    dot(c.rgb, vec3f(0.349, 0.686, 0.168)),
    dot(c.rgb, vec3f(0.272, 0.534, 0.131))
  );
  return vec4f(mix(c.rgb, sepia, uni.u_intensity), c.a);
}`;

// Slot layout: [0]=temperature, [1]=tint.
const WHITE_BALANCE_FRAGMENT_WGSL = /* wgsl */ `
struct Uniforms { u_temperature : f32, u_tint : f32, _pad0 : f32, _pad1 : f32, }
@group(0) @binding(0) var<uniform> uni : Uniforms;
@group(1) @binding(0) var tex : texture_2d<f32>;
@group(1) @binding(1) var smp : sampler;

@fragment
fn fs_main(@location(0) uv : vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(tex, smp, uv, 0.0);
  var rgb = c.rgb;
  rgb.r += uni.u_temperature * 0.5;
  rgb.b -= uni.u_temperature * 0.5;
  rgb.g += uni.u_tint * 0.5;
  return vec4f(clamp(rgb, vec3f(0.0), vec3f(1.0)), c.a);
}`;
