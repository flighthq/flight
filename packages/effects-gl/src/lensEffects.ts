import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type {
  BokehDepthOfFieldEffect,
  ChromaticAberrationEffect,
  DisplacementEffect,
  GlRenderEffectRunner,
  GlRenderState,
  GlRenderTarget,
  LensDirtEffect,
  LensDistortionEffect,
  LensFlareEffect,
  TiltShiftEffect,
  VignetteEffect,
} from '@flighthq/types';

import { getGlEffectProgram } from './effectProgramCache';

// Lens-camera effect recipes. Each is a single-pass fragment shader keyed and compiled once per state
// via getGlEffectProgram, then drawn with drawGlFullscreenPass. Shaders work in centered
// coordinates (v_texCoord - 0.5) so radial math measures distance from the optical center. Packed RGBA
// color ints are unpacked to normalized vec4 uniforms in JS before upload.

// Bokeh depth-of-field: a disc-shaped blur. When the scene supplied a sampleable depth texture
// (ctx.sceneDepthTexture), it computes a per-pixel circle of confusion from focusDistance/focusRange and
// scales the disc radius by it (the real DoF). When depth is absent it falls back to a uniform disc blur
// of radius maxBlur. The second real consumer of the depth seam, alongside screen-space fog.
export function applyBokehDepthOfFieldEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  depthTexture: WebGLTexture | null,
  effect: Readonly<BokehDepthOfFieldEffect>,
): void {
  const maxBlur = effect.maxBlur ?? 4;
  const focusDistance = effect.focusDistance ?? 0.5;
  const focusRange = effect.focusRange ?? 0.2;
  const program = getGlEffectProgram(state, 'lens.bokehDoF', BOKEH_DOF_FRAGMENT_SRC);
  const inputs = depthTexture ? [source.texture, depthTexture] : [source.texture];
  drawGlFullscreenPass(state, program, inputs, dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_maxBlur'), maxBlur);
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_focusDistance'), focusDistance);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_focusRange'), focusRange);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_hasDepth'), depthTexture ? 1 : 0);
  });
}

// Chromatic aberration: sample the R/G/B channels at progressively larger offsets so colors fringe
// apart. When radial, the offset scales with distance from the optical center (true lens behavior);
// otherwise it is a uniform horizontal split.
export function applyChromaticAberrationEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<ChromaticAberrationEffect>,
): void {
  const intensity = effect.intensity ?? 0.005;
  const radial = effect.radial ?? true;
  const program = getGlEffectProgram(state, 'lens.chromaticAberration', CHROMATIC_ABERRATION_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_intensity'), intensity);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_radial'), radial ? 1 : 0);
  });
}

// Displacement / heat-haze: warp the sample uv by an animated sine field for a refractive wobble.
export function applyDisplacementEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<DisplacementEffect>,
): void {
  const intensity = effect.intensity ?? 8;
  const frequency = effect.frequency ?? 12;
  const seed = effect.seed ?? 0;
  const program = getGlEffectProgram(state, 'lens.displacement', DISPLACEMENT_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_intensity'), intensity);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_frequency'), frequency);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_seed'), seed);
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
  });
}

// Lens dirt: procedural soft smudges that brighten where the scene is bright — a cheap bloom-dirt overlay.
export function applyLensDirtEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<LensDirtEffect>,
): void {
  const intensity = effect.intensity ?? 1;
  const threshold = effect.threshold ?? 0.55;
  const seed = effect.seed ?? 0;
  const program = getGlEffectProgram(state, 'lens.lensDirt', LENS_DIRT_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_intensity'), intensity);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_threshold'), threshold);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_seed'), seed);
  });
}

// Lens distortion: remap uv by a radial polynomial. Positive amount bulges outward (barrel), negative
// pinches inward (pincushion); scale re-frames the result so corners stay in view.
export function applyLensDistortionEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<LensDistortionEffect>,
): void {
  const amount = effect.amount ?? 0.2;
  const scale = effect.scale ?? 1;
  const program = getGlEffectProgram(state, 'lens.lensDistortion', LENS_DISTORTION_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_amount'), amount);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_scale'), scale);
  });
}

// Lens flare: a single-pass approximation. A true flare is a multi-pass recipe (downsample a bright
// pass, then accumulate ghosts and a halo from it). Here, on each fragment, we sample the source's
// bright spots along the vector from the pixel toward the center, adding `ghosts` evenly spaced ghost
// samples plus a halo ring, scaled by threshold/intensity. It previews the look without the bright-pass
// buffer.
export function applyLensFlareEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<LensFlareEffect>,
): void {
  const threshold = effect.threshold ?? 0.8;
  const intensity = effect.intensity ?? 1;
  const ghosts = effect.ghosts ?? 4;
  const halo = effect.halo ?? 0.5;
  const program = getGlEffectProgram(state, 'lens.lensFlare', LENS_FLARE_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_threshold'), threshold);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_intensity'), intensity);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_ghosts'), ghosts);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_halo'), halo);
  });
}

// Tilt-shift: keep a horizontal focus band sharp and blur above and below it. The band is centered at
// `center` on Y with height `width`; blur strength ramps with distance outside the band. Blur is
// approximated by averaging a few neighbor taps using the pixel size from u_resolution.
export function applyTiltShiftEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<TiltShiftEffect>,
): void {
  const center = effect.center ?? 0.5;
  const width = effect.width ?? 0.3;
  const blur = effect.blur ?? 4;
  const program = getGlEffectProgram(state, 'lens.tiltShift', TILT_SHIFT_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_center'), center);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_width'), width);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_blur'), blur);
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
  });
}

// Vignette: darken toward the edges. Pixels inside `radius` stay full bright; beyond it, brightness
// falls off over `softness` and the color is blended toward the (unpacked) vignette color by intensity.
export function applyVignetteEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
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
  const program = getGlEffectProgram(state, 'lens.vignette', VIGNETTE_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_intensity'), intensity);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_radius'), radius);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_softness'), softness);
    gl.uniform4f(gl.getUniformLocation(p.program, 'u_color'), r, g, b, a);
  });
}

export const defaultGlBokehDepthOfFieldEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyBokehDepthOfFieldEffectToGl(
    ctx.state,
    ctx.source,
    ctx.dest,
    ctx.sceneDepthTexture,
    effect as BokehDepthOfFieldEffect,
  );
};

export const defaultGlChromaticAberrationEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyChromaticAberrationEffectToGl(ctx.state, ctx.source, ctx.dest, effect as ChromaticAberrationEffect);
};

export const defaultGlDisplacementEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyDisplacementEffectToGl(ctx.state, ctx.source, ctx.dest, effect as DisplacementEffect);
};

export const defaultGlLensDirtEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyLensDirtEffectToGl(ctx.state, ctx.source, ctx.dest, effect as LensDirtEffect);
};

export const defaultGlLensDistortionEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyLensDistortionEffectToGl(ctx.state, ctx.source, ctx.dest, effect as LensDistortionEffect);
};

export const defaultGlLensFlareEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyLensFlareEffectToGl(ctx.state, ctx.source, ctx.dest, effect as LensFlareEffect);
};

export const defaultGlTiltShiftEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyTiltShiftEffectToGl(ctx.state, ctx.source, ctx.dest, effect as TiltShiftEffect);
};

export const defaultGlVignetteEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyVignetteEffectToGl(ctx.state, ctx.source, ctx.dest, effect as VignetteEffect);
};

const BOKEH_DOF_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform float u_maxBlur;
uniform vec2 u_resolution;
uniform float u_focusDistance;
uniform float u_focusRange;
uniform float u_hasDepth;
out vec4 o_color;
void main() {
  vec2 texel = 1.0 / u_resolution;
  // Circle of confusion: with depth, blur scales by distance from the focus plane; without, full blur.
  float coc = 1.0;
  if (u_hasDepth > 0.5) {
    float depth = texture(u_texture1, v_texCoord).r;
    coc = clamp(abs(depth - u_focusDistance) / max(u_focusRange, 1e-4), 0.0, 1.0);
  }
  float blur = u_maxBlur * coc;
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int i = 0; i < 16; i++) {
    float a = float(i) * 0.39269908; // golden-ish angular step over the disc
    float r = (float(i % 4) + 1.0) * 0.25;
    vec2 offset = vec2(cos(a), sin(a)) * r * blur * texel;
    sum += texture(u_texture0, v_texCoord + offset);
    total += 1.0;
  }
  o_color = sum / total;
}`;

const CHROMATIC_ABERRATION_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
uniform float u_radial;
out vec4 o_color;
void main() {
  vec2 centered = v_texCoord - 0.5;
  float scale = mix(1.0, length(centered) * 2.0, u_radial);
  vec2 dir = mix(vec2(1.0, 0.0), normalize(centered + vec2(1e-5)), u_radial);
  vec2 offset = dir * u_intensity * scale;
  float r = texture(u_texture0, v_texCoord + offset).r;
  float g = texture(u_texture0, v_texCoord).g;
  float b = texture(u_texture0, v_texCoord - offset).b;
  float a = texture(u_texture0, v_texCoord).a;
  o_color = vec4(r, g, b, a);
}`;

const DISPLACEMENT_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
uniform float u_frequency;
uniform float u_seed;
uniform vec2 u_resolution;
out vec4 o_color;
void main() {
  float f = u_frequency;
  vec2 warp = vec2(
    sin(v_texCoord.y * f + u_seed) + sin(v_texCoord.y * f * 2.3 + u_seed * 1.7) * 0.5,
    cos(v_texCoord.x * f * 0.8 + u_seed * 1.3)
  );
  vec2 displaced = v_texCoord + warp * (u_intensity / u_resolution);
  o_color = texture(u_texture0, displaced);
}`;

const LENS_DIRT_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
uniform float u_threshold;
uniform float u_seed;
out vec4 o_color;
float dirtHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float dirtAmount(vec2 uv, float seed) {
  float acc = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    vec2 c = vec2(dirtHash(vec2(fi, seed)), dirtHash(vec2(fi + 9.0, seed)));
    float r = 0.06 + 0.16 * dirtHash(vec2(fi + 3.0, seed));
    float d = distance(uv, c) / r;
    acc += smoothstep(1.0, 0.0, d) * (0.3 + 0.7 * dirtHash(vec2(fi + 5.0, seed)));
  }
  return clamp(acc, 0.0, 1.0);
}
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  float bright = max(0.0, lum - u_threshold);
  float dirt = dirtAmount(v_texCoord, u_seed + 1.0);
  o_color = vec4(c.rgb + bright * dirt * u_intensity * 2.0, c.a);
}`;

const LENS_DISTORTION_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_amount;
uniform float u_scale;
out vec4 o_color;
void main() {
  vec2 centered = (v_texCoord - 0.5) / u_scale;
  float r2 = dot(centered, centered);
  vec2 distorted = centered * (1.0 + u_amount * r2) + 0.5;
  if (distorted.x < 0.0 || distorted.x > 1.0 || distorted.y < 0.0 || distorted.y > 1.0) {
    o_color = vec4(0.0, 0.0, 0.0, 1.0);
  } else {
    o_color = texture(u_texture0, distorted);
  }
}`;

const LENS_FLARE_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_threshold;
uniform float u_intensity;
uniform float u_ghosts;
uniform float u_halo;
out vec4 o_color;
vec3 brightPass(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec3(0.0);
  vec3 c = texture(u_texture0, uv).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return c * max(0.0, l - u_threshold);
}
void main() {
  vec4 scene = texture(u_texture0, v_texCoord);
  // Single-pass approximation of a flare: walk ghost samples along the vector toward the optical
  // center and add a halo ring, all from the bright pass of the scene itself (no separate buffer).
  vec2 toCenter = (vec2(0.5) - v_texCoord);
  vec3 flare = vec3(0.0);
  int count = int(clamp(u_ghosts, 0.0, 8.0));
  for (int i = 0; i < 8; i++) {
    if (i >= count) break;
    float t = (float(i) + 1.0) / (float(count) + 1.0);
    vec2 uv = v_texCoord + toCenter * (2.0 * t);
    flare += brightPass(uv);
  }
  vec2 haloDir = normalize(toCenter + vec2(1e-5));
  flare += brightPass(v_texCoord + haloDir * u_halo) * u_halo;
  o_color = vec4(scene.rgb + flare * u_intensity, scene.a);
}`;

const TILT_SHIFT_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_center;
uniform float u_width;
uniform float u_blur;
uniform vec2 u_resolution;
out vec4 o_color;
void main() {
  vec2 texel = 1.0 / u_resolution;
  float dist = abs(v_texCoord.y - u_center);
  float edge = u_width * 0.5;
  float amount = smoothstep(edge, edge + u_width, dist);
  float radius = amount * u_blur;
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int i = -3; i <= 3; i++) {
    vec2 offset = vec2(0.0, float(i)) * radius * texel;
    sum += texture(u_texture0, v_texCoord + offset);
    total += 1.0;
  }
  o_color = sum / total;
}`;

const VIGNETTE_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
uniform float u_radius;
uniform float u_softness;
uniform vec4 u_color;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  vec2 centered = v_texCoord - 0.5;
  float dist = length(centered) * 1.41421356;
  float vig = smoothstep(u_radius, u_radius - u_softness, dist);
  float darken = (1.0 - vig) * u_intensity * u_color.a;
  o_color = vec4(mix(c.rgb, u_color.rgb, darken), c.a);
}`;
