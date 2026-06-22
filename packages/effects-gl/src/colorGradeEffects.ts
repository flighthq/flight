import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type {
  BrightnessContrastEffect,
  ChannelMixerEffect,
  ColorGradeEffect,
  GlRenderEffectRunner,
  GlRenderState,
  GlRenderTarget,
  GrayscaleEffect,
  HueSaturationEffect,
  InvertEffect,
  LiftGammaGainEffect,
  LookupTableGradeEffect,
  PosterizeEffect,
  SepiaEffect,
  WhiteBalanceEffect,
} from '@flighthq/types';

import { getGlEffectProgram } from './effectProgramCache';

// Single-pass color-grading recipes. Each reads `source`, writes `dest`, and compiles its fragment once
// per state via getGlEffectProgram. Packed-RGBA intent fields (lift/gamma/gain) are unpacked to
// normalized floats here in JS before being uploaded as uniforms.

// Brightness/contrast: shift then scale about mid-grey.
export function applyBrightnessContrastEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<BrightnessContrastEffect>,
): void {
  const brightness = effect.brightness ?? 0;
  const contrast = effect.contrast ?? 1;
  const program = getGlEffectProgram(state, 'colorGrade.brightnessContrast', BRIGHTNESS_CONTRAST_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_brightness'), brightness);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_contrast'), contrast);
  });
}

// Channel mixer: apply a 3x4 row-major RGB->RGB matrix plus per-row offset, uploaded as 12 floats.
export function applyChannelMixerEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<ChannelMixerEffect>,
): void {
  const matrix = new Float32Array(12);
  for (let i = 0; i < 12; i++) matrix[i] = effect.matrix[i] ?? IDENTITY_CHANNEL_MIXER[i];
  const program = getGlEffectProgram(state, 'colorGrade.channelMixer', CHANNEL_MIXER_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1fv(gl.getUniformLocation(p.program, 'u_matrix'), matrix);
  });
}

// Color grade: combined exposure, brightness, contrast, saturation, and temperature/tint shift.
export function applyColorGradeEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<ColorGradeEffect>,
): void {
  const exposure = effect.exposure ?? 0;
  const contrast = effect.contrast ?? 1;
  const saturation = effect.saturation ?? 1;
  const temperature = effect.temperature ?? 0;
  const tint = effect.tint ?? 0;
  const brightness = effect.brightness ?? 0;
  const program = getGlEffectProgram(state, 'colorGrade.colorGrade', COLOR_GRADE_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_exposure'), Math.pow(2, exposure));
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_contrast'), contrast);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_saturation'), saturation);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_temperature'), temperature);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_tint'), tint);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_brightness'), brightness);
  });
}

// Grayscale: mix toward luminance by intensity.
export function applyGrayscaleEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<GrayscaleEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  const program = getGlEffectProgram(state, 'colorGrade.grayscale', GRAYSCALE_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_intensity'), intensity);
  });
}

// Hue/saturation/lightness: convert to HSL, adjust, convert back.
export function applyHueSaturationEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<HueSaturationEffect>,
): void {
  const hue = effect.hue ?? 0;
  const saturation = effect.saturation ?? 1;
  const lightness = effect.lightness ?? 0;
  const program = getGlEffectProgram(state, 'colorGrade.hueSaturation', HUE_SATURATION_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_hue'), hue / 360);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_saturation'), saturation);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_lightness'), lightness);
  });
}

// Invert: mix toward 1 - rgb by intensity.
export function applyInvertEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<InvertEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  const program = getGlEffectProgram(state, 'colorGrade.invert', INVERT_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_intensity'), intensity);
  });
}

// Lift/gamma/gain: unpack packed-RGBA neutrals to per-channel offsets/exponents/multipliers in JS.
// Neutral packed values: lift 0x000000ff, gamma 0x808080ff, gain 0xffffffff.
export function applyLiftGammaGainEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
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
  const program = getGlEffectProgram(state, 'colorGrade.liftGammaGain', LIFT_GAMMA_GAIN_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform3f(gl.getUniformLocation(p.program, 'u_lift'), lift[0], lift[1], lift[2]);
    gl.uniform3f(gl.getUniformLocation(p.program, 'u_gamma'), gamma[0], gamma[1], gamma[2]);
    gl.uniform3f(gl.getUniformLocation(p.program, 'u_gain'), gain[0], gain[1], gain[2]);
  });
}

// LUT grade: passthrough with a strength mix. A real 3D LUT grade needs an uploaded LUT cube texture
// (size from effect.size) sampled per pixel; that texture path is not yet wired, so this keeps the
// pass compiling and color-neutral until the LUT upload is added.
export function applyLookupTableGradeEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<LookupTableGradeEffect>,
): void {
  const strength = effect.strength ?? 1;
  const program = getGlEffectProgram(state, 'colorGrade.lutGrade', LUT_GRADE_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_strength'), strength);
  });
}

// Posterize: floor each channel to `levels` discrete steps.
export function applyPosterizeEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<PosterizeEffect>,
): void {
  const levels = Math.max(2, effect.levels ?? 8);
  const program = getGlEffectProgram(state, 'colorGrade.posterize', POSTERIZE_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_levels'), levels);
  });
}

// Sepia: mix toward a sepia matrix transform by intensity.
export function applySepiaEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<SepiaEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  const program = getGlEffectProgram(state, 'colorGrade.sepia', SEPIA_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_intensity'), intensity);
  });
}

// White balance: warm/cool temperature and magenta/green tint channel shift.
export function applyWhiteBalanceEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<WhiteBalanceEffect>,
): void {
  const temperature = effect.temperature ?? 0;
  const tint = effect.tint ?? 0;
  const program = getGlEffectProgram(state, 'colorGrade.whiteBalance', WHITE_BALANCE_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_temperature'), temperature);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_tint'), tint);
  });
}

export const defaultGlBrightnessContrastEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyBrightnessContrastEffectToGl(ctx.state, ctx.source, ctx.dest, effect as BrightnessContrastEffect);
};

export const defaultGlChannelMixerEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyChannelMixerEffectToGl(ctx.state, ctx.source, ctx.dest, effect as ChannelMixerEffect);
};

export const defaultGlColorGradeEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyColorGradeEffectToGl(ctx.state, ctx.source, ctx.dest, effect as ColorGradeEffect);
};

export const defaultGlGrayscaleEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyGrayscaleEffectToGl(ctx.state, ctx.source, ctx.dest, effect as GrayscaleEffect);
};

export const defaultGlHueSaturationEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyHueSaturationEffectToGl(ctx.state, ctx.source, ctx.dest, effect as HueSaturationEffect);
};

export const defaultGlInvertEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyInvertEffectToGl(ctx.state, ctx.source, ctx.dest, effect as InvertEffect);
};

export const defaultGlLiftGammaGainEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyLiftGammaGainEffectToGl(ctx.state, ctx.source, ctx.dest, effect as LiftGammaGainEffect);
};

export const defaultGlLookupTableGradeEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyLookupTableGradeEffectToGl(ctx.state, ctx.source, ctx.dest, effect as LookupTableGradeEffect);
};

export const defaultGlPosterizeEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyPosterizeEffectToGl(ctx.state, ctx.source, ctx.dest, effect as PosterizeEffect);
};

export const defaultGlSepiaEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applySepiaEffectToGl(ctx.state, ctx.source, ctx.dest, effect as SepiaEffect);
};

export const defaultGlWhiteBalanceEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyWhiteBalanceEffectToGl(ctx.state, ctx.source, ctx.dest, effect as WhiteBalanceEffect);
};

// Unpack a packed RGBA integer (0xRRGGBBAA) into normalized [r, g, b] floats. Alpha is dropped — these
// grade values describe RGB channels only.
function unpackColor(c: number): readonly [number, number, number] {
  return [((c >>> 24) & 255) / 255, ((c >>> 16) & 255) / 255, ((c >>> 8) & 255) / 255];
}

const IDENTITY_CHANNEL_MIXER: readonly number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

const BRIGHTNESS_CONTRAST_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_brightness;
uniform float u_contrast;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec3 rgb = (c.rgb + u_brightness - 0.5) * u_contrast + 0.5;
  o_color = vec4(clamp(rgb, 0.0, 1.0), c.a);
}`;

const CHANNEL_MIXER_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_matrix[12];
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float r = u_matrix[0] * c.r + u_matrix[1] * c.g + u_matrix[2] * c.b + u_matrix[3];
  float g = u_matrix[4] * c.r + u_matrix[5] * c.g + u_matrix[6] * c.b + u_matrix[7];
  float b = u_matrix[8] * c.r + u_matrix[9] * c.g + u_matrix[10] * c.b + u_matrix[11];
  o_color = vec4(clamp(vec3(r, g, b), 0.0, 1.0), c.a);
}`;

const COLOR_GRADE_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_exposure;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_temperature;
uniform float u_tint;
uniform float u_brightness;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec3 rgb = c.rgb * u_exposure + u_brightness;
  rgb.r += u_temperature * 0.5;
  rgb.b -= u_temperature * 0.5;
  rgb.g += u_tint * 0.5;
  float l = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  rgb = mix(vec3(l), rgb, u_saturation);
  rgb = (rgb - 0.5) * u_contrast + 0.5;
  o_color = vec4(clamp(rgb, 0.0, 1.0), c.a);
}`;

const GRAYSCALE_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  o_color = vec4(mix(c.rgb, vec3(l), u_intensity), c.a);
}`;

const HUE_SATURATION_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_hue;
uniform float u_saturation;
uniform float u_lightness;
out vec4 o_color;
vec3 rgb2hsl(vec3 c) {
  float mx = max(c.r, max(c.g, c.b));
  float mn = min(c.r, min(c.g, c.b));
  float l = (mx + mn) * 0.5;
  float h = 0.0;
  float s = 0.0;
  float d = mx - mn;
  if (d > 0.0001) {
    s = l < 0.5 ? d / (mx + mn) : d / (2.0 - mx - mn);
    if (mx == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
  }
  return vec3(h, s, l);
}
float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 1.0 / 2.0) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
  return p;
}
vec3 hsl2rgb(vec3 hsl) {
  float h = hsl.x;
  float s = hsl.y;
  float l = hsl.z;
  if (s <= 0.0) return vec3(l);
  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;
  return vec3(hue2rgb(p, q, h + 1.0 / 3.0), hue2rgb(p, q, h), hue2rgb(p, q, h - 1.0 / 3.0));
}
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec3 hsl = rgb2hsl(c.rgb);
  hsl.x = fract(hsl.x + u_hue);
  hsl.y = clamp(hsl.y * u_saturation, 0.0, 1.0);
  hsl.z = clamp(hsl.z + u_lightness, 0.0, 1.0);
  o_color = vec4(hsl2rgb(hsl), c.a);
}`;

const INVERT_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  o_color = vec4(mix(c.rgb, 1.0 - c.rgb, u_intensity), c.a);
}`;

const LIFT_GAMMA_GAIN_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform vec3 u_lift;
uniform vec3 u_gamma;
uniform vec3 u_gain;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec3 rgb = c.rgb * u_gain + u_lift * (1.0 - c.rgb);
  rgb = pow(max(rgb, 0.0), u_gamma);
  o_color = vec4(clamp(rgb, 0.0, 1.0), c.a);
}`;

const LUT_GRADE_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_strength;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  // Passthrough: a real 3D LUT samples an uploaded LUT cube here, then mixes by u_strength.
  vec3 graded = c.rgb;
  o_color = vec4(mix(c.rgb, graded, u_strength), c.a);
}`;

const POSTERIZE_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_levels;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec3 rgb = floor(c.rgb * u_levels) / (u_levels - 1.0);
  o_color = vec4(clamp(rgb, 0.0, 1.0), c.a);
}`;

const SEPIA_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec3 sepia = vec3(
    dot(c.rgb, vec3(0.393, 0.769, 0.189)),
    dot(c.rgb, vec3(0.349, 0.686, 0.168)),
    dot(c.rgb, vec3(0.272, 0.534, 0.131))
  );
  o_color = vec4(mix(c.rgb, sepia, u_intensity), c.a);
}`;

const WHITE_BALANCE_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_temperature;
uniform float u_tint;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec3 rgb = c.rgb;
  rgb.r += u_temperature * 0.5;
  rgb.b -= u_temperature * 0.5;
  rgb.g += u_tint * 0.5;
  o_color = vec4(clamp(rgb, 0.0, 1.0), c.a);
}`;
