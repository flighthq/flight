import { drawGlFullscreenPass } from '@flighthq/render-gl';
import type {
  GlRenderEffectRunner,
  GlRenderState,
  GlRenderTarget,
  GodRaysEffect,
  ScreenSpaceFogEffect,
  SsaoEffect,
  SsrEffect,
} from '@flighthq/types';

import { getGlEffectProgram } from './effectProgramCache';

// Atmospheric / depth recipes. Fog reads the scene's sampleable depth via ctx.sceneDepthTexture when the
// scene produced one (the real depth-driven recipe) and falls back to a screen-space proxy when null —
// the reference consumer of the depth seam. SSAO and SSR still ship color-only stand-ins: real SSAO needs
// a full view-space kernel reconstructed from depth, and SSR additionally needs a normals attachment
// (not yet wired) — both are documented at their definitions. God rays is genuinely color-only by nature
// (radial light scattering), not a stand-in.

// God rays: radial light scattering from a screen-space light position (centerX, centerY). Marches
// SAMPLES steps along the ray from each fragment toward the light, accumulating color with per-step
// decay and weight, then scales by exposure. A true single-pass recipe — no depth needed. Reads
// u_texture0; u_resolution is set so the light direction is computed in a consistent space.
export function applyGodRaysEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<GodRaysEffect>,
): void {
  const centerX = effect.centerX ?? 0.5;
  const centerY = effect.centerY ?? 0.5;
  const density = effect.density ?? 0.96;
  const decay = effect.decay ?? 0.93;
  const weight = effect.weight ?? 0.4;
  const exposure = effect.exposure ?? 0.6;
  const samples = Math.max(1, Math.round(effect.samples ?? 64));
  const program = getGlEffectProgram(state, `atmospheric.godRays.${samples}`, buildGodRaysFragment(samples));
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_lightPosition'), centerX, centerY);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_density'), density);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_decay'), decay);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_weight'), weight);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_exposure'), exposure);
  });
}

// Screen-space fog: blends the scene toward an unpacked fog color by distance. When the scene supplied a
// sampleable DEPTH texture (`depthTexture`), this is the real recipe — fog factor = 1 - exp(-density *
// depth) over the [near, far] window, read per fragment. When depth is absent (a flat 2D scene that did
// not write depth), it falls back to the screen-Y gradient as a depth proxy (bottom of frame reads as
// "far"). color is a packed RGBA int unpacked to 0..1 floats on the JS side. Demonstrates the
// ctx.sceneDepthTexture seam: real depth path when present, sentinel proxy when null.
export function applyScreenSpaceFogEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  depthTexture: WebGLTexture | null,
  effect: Readonly<ScreenSpaceFogEffect>,
): void {
  const packed = effect.color ?? 0xc8d2dcff;
  const r = ((packed >>> 24) & 0xff) / 255;
  const g = ((packed >>> 16) & 0xff) / 255;
  const b = ((packed >>> 8) & 0xff) / 255;
  const density = effect.density ?? 1;
  const near = effect.near ?? 0;
  const far = effect.far ?? 1;
  const program = getGlEffectProgram(state, 'atmospheric.screenSpaceFog', SCREEN_SPACE_FOG_FRAGMENT_SRC);
  const inputs = depthTexture ? [source.texture, depthTexture] : [source.texture];
  drawGlFullscreenPass(state, program, inputs, dest, (gl, p) => {
    gl.uniform3f(gl.getUniformLocation(p.program, 'u_fogColor'), r, g, b);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_density'), density);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_near'), near);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_far'), far);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_hasDepth'), depthTexture ? 1 : 0);
  });
}

// SSAO: ambient-occlusion approximation. Real SSAO reconstructs view-space position/normals from a
// sampleable DEPTH texture and accumulates occlusion over `samples` kernel offsets within `radius`,
// gated by `bias`; none of that depth data exists in the color-only context. This stand-in darkens
// fragments by local luminance variation (high-contrast neighborhoods read as creases/contact) scaled
// by intensity, sampling neighbors via u_resolution-derived texel steps.
export function applySsaoEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  effect: Readonly<SsaoEffect>,
): void {
  const radius = effect.radius ?? 1;
  const intensity = effect.intensity ?? 1;
  const program = getGlEffectProgram(state, 'atmospheric.ssao', SSAO_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_radius'), radius);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_intensity'), intensity);
  });
}

// SSR: screen-space reflections. The real recipe ray-marches reflected rays against a sampleable DEPTH
// buffer using view-space normals, walking `steps` increments up to `maxDistance` at the given
// `resolution`; depth and normals are absent in the color-only context, so this is a passthrough copy
// that preserves the pipeline stage. maxDistance/resolution/steps are reserved for the depth-driven recipe.
export function applySsrEffectToGl(
  state: GlRenderState,
  source: Readonly<GlRenderTarget>,
  dest: Readonly<GlRenderTarget>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  effect: Readonly<SsrEffect>,
): void {
  const program = getGlEffectProgram(state, 'atmospheric.ssr', SSR_FRAGMENT_SRC);
  drawGlFullscreenPass(state, program, [source.texture], dest, () => {});
}

export const defaultGlGodRaysEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyGodRaysEffectToGl(ctx.state, ctx.source, ctx.dest, effect as GodRaysEffect);
};

export const defaultGlScreenSpaceFogEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applyScreenSpaceFogEffectToGl(ctx.state, ctx.source, ctx.dest, ctx.sceneDepthTexture, effect as ScreenSpaceFogEffect);
};

export const defaultGlSsaoEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applySsaoEffectToGl(ctx.state, ctx.source, ctx.dest, effect as SsaoEffect);
};

export const defaultGlSsrEffectRunner: GlRenderEffectRunner = (ctx, effect) => {
  applySsrEffectToGl(ctx.state, ctx.source, ctx.dest, effect as SsrEffect);
};

function buildGodRaysFragment(samples: number): string {
  return GOD_RAYS_FRAGMENT_HEAD + samples.toFixed(1) + GOD_RAYS_FRAGMENT_TAIL;
}

const GOD_RAYS_FRAGMENT_HEAD = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform vec2 u_resolution;
uniform vec2 u_lightPosition;
uniform float u_density;
uniform float u_decay;
uniform float u_weight;
uniform float u_exposure;
out vec4 o_color;
const float SAMPLES = `;

const GOD_RAYS_FRAGMENT_TAIL = `;
void main() {
  vec2 delta = (v_texCoord - u_lightPosition) * (u_density / SAMPLES);
  vec2 coord = v_texCoord;
  vec4 base = texture(u_texture0, v_texCoord);
  vec3 accum = base.rgb;
  float illumination = 1.0;
  for (int i = 0; i < int(SAMPLES); i++) {
    coord -= delta;
    vec3 s = texture(u_texture0, coord).rgb;
    s *= illumination * u_weight;
    accum += s;
    illumination *= u_decay;
  }
  o_color = vec4(base.rgb + accum * u_exposure, base.a);
}`;

const SSAO_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform vec2 u_resolution;
uniform float u_radius;
uniform float u_intensity;
out vec4 o_color;
float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}
void main() {
  vec2 texel = (1.0 / u_resolution) * max(u_radius, 1.0);
  vec4 center = texture(u_texture0, v_texCoord);
  float lc = luma(center.rgb);
  float variation = 0.0;
  variation += abs(lc - luma(texture(u_texture0, v_texCoord + vec2(-1.0, 0.0) * texel).rgb));
  variation += abs(lc - luma(texture(u_texture0, v_texCoord + vec2(1.0, 0.0) * texel).rgb));
  variation += abs(lc - luma(texture(u_texture0, v_texCoord + vec2(0.0, -1.0) * texel).rgb));
  variation += abs(lc - luma(texture(u_texture0, v_texCoord + vec2(0.0, 1.0) * texel).rgb));
  variation *= 0.25;
  float occlusion = clamp(variation * u_intensity, 0.0, 1.0);
  o_color = vec4(center.rgb * (1.0 - occlusion), center.a);
}`;

const SSR_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
out vec4 o_color;
void main() {
  o_color = texture(u_texture0, v_texCoord);
}`;

const SCREEN_SPACE_FOG_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform vec3 u_fogColor;
uniform float u_density;
uniform float u_near;
uniform float u_far;
uniform float u_hasDepth;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float fog;
  if (u_hasDepth > 0.5) {
    // Real depth path: window-space depth remapped over [near, far], exponential fog by density.
    float depth = texture(u_texture1, v_texCoord).r;
    float d = clamp((depth - u_near) / max(u_far - u_near, 1e-4), 0.0, 1.0);
    fog = clamp(1.0 - exp(-u_density * d), 0.0, 1.0);
  } else {
    // Sentinel path: no depth written (flat 2D scene) — screen-Y gradient as a depth proxy.
    fog = clamp((1.0 - v_texCoord.y) * u_density, 0.0, 1.0);
  }
  o_color = vec4(mix(c.rgb, u_fogColor, fog), c.a);
}`;
