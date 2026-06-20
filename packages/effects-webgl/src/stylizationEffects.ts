import { drawWebGLFullscreenPass } from '@flighthq/render-webgl';
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
  WebGLRenderEffectRunner,
  WebGLRenderState,
  WebGLRenderTarget,
} from '@flighthq/types';

import { getWebGLEffectProgram } from './effectProgramCache';

// Stylization effect recipes: single-pass WebGL shaders for non-photoreal looks. Each apply* compiles
// (once per state) and draws a fullscreen pass; neighbor-sampling shaders receive u_resolution as the
// source pixel size so texel steps are exact. Outline's packed-RGBA color is unpacked to 0..1 in JS.

// CRT: barrel-distort the uv (curvature), darken alternating scanlines, vignette the edges, and split
// the channels outward (chromatic aberration) for a tube-monitor look.
export function applyCRTEffectToWebGL(
  state: WebGLRenderState,
  source: Readonly<WebGLRenderTarget>,
  dest: Readonly<WebGLRenderTarget>,
  effect: Readonly<CRTEffect>,
): void {
  const curvature = effect.curvature ?? 0.1;
  const scanlineIntensity = effect.scanlineIntensity ?? 0.3;
  const vignette = effect.vignette ?? 0.3;
  const aberration = effect.aberration ?? 0.005;
  const program = getWebGLEffectProgram(state, 'stylization.crt', CRT_FRAGMENT_SRC);
  drawWebGLFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_curvature'), curvature);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_scanlineIntensity'), scanlineIntensity);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_vignette'), vignette);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_aberration'), aberration);
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
  });
}

// Dither: quantize each channel to `levels` steps with a 4x4 ordered Bayer threshold for a retro
// banded-but-textured look.
export function applyDitherEffectToWebGL(
  state: WebGLRenderState,
  source: Readonly<WebGLRenderTarget>,
  dest: Readonly<WebGLRenderTarget>,
  effect: Readonly<DitherEffect>,
): void {
  const levels = effect.levels ?? 4;
  const program = getWebGLEffectProgram(state, 'stylization.dither', DITHER_FRAGMENT_SRC);
  drawWebGLFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_levels'), Math.max(2, levels));
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
  });
}

// Film grain: add per-pixel hash noise scaled by intensity, with grain cell size and a seed so the
// noise can be animated frame to frame.
export function applyFilmGrainEffectToWebGL(
  state: WebGLRenderState,
  source: Readonly<WebGLRenderTarget>,
  dest: Readonly<WebGLRenderTarget>,
  effect: Readonly<FilmGrainEffect>,
): void {
  const intensity = effect.intensity ?? 0.1;
  const size = effect.size ?? 1;
  const seed = effect.seed ?? 0;
  const program = getWebGLEffectProgram(state, 'stylization.filmGrain', FILM_GRAIN_FRAGMENT_SRC);
  drawWebGLFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_intensity'), intensity);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_size'), Math.max(0.0001, size));
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_seed'), seed);
  });
}

// Halftone: sample luminance, then carve a rotated dot grid whose dot radius tracks darkness — the
// classic print/comic screen. `scale` sets the cell size, `angle` rotates the grid.
export function applyHalftoneEffectToWebGL(
  state: WebGLRenderState,
  source: Readonly<WebGLRenderTarget>,
  dest: Readonly<WebGLRenderTarget>,
  effect: Readonly<HalftoneEffect>,
): void {
  const scale = effect.scale ?? 6;
  const angle = effect.angle ?? 0.4;
  const program = getWebGLEffectProgram(state, 'stylization.halftone', HALFTONE_FRAGMENT_SRC);
  drawWebGLFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_scale'), Math.max(1, scale));
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_angle'), angle);
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
  });
}

// Kuwahara: edge-preserving smoothing. Over a fixed small radius split the neighborhood into four
// overlapping quadrants, compute each mean and variance, and emit the lowest-variance mean — flattens
// regions while keeping edges crisp. `radius` gates the sampled extent.
export function applyKuwaharaEffectToWebGL(
  state: WebGLRenderState,
  source: Readonly<WebGLRenderTarget>,
  dest: Readonly<WebGLRenderTarget>,
  effect: Readonly<KuwaharaEffect>,
): void {
  const radius = effect.radius ?? 3;
  const program = getWebGLEffectProgram(state, 'stylization.kuwahara', KUWAHARA_FRAGMENT_SRC);
  drawWebGLFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_radius'), Math.max(1, radius));
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
  });
}

// Outline: Sobel edge detection on luminance; where the gradient magnitude exceeds `threshold`, mix
// the pixel toward the outline color by `thickness`. Color arrives packed RGBA, unpacked to 0..1 here.
export function applyOutlineEffectToWebGL(
  state: WebGLRenderState,
  source: Readonly<WebGLRenderTarget>,
  dest: Readonly<WebGLRenderTarget>,
  effect: Readonly<OutlineEffect>,
): void {
  const threshold = effect.threshold ?? 0.2;
  const thickness = effect.thickness ?? 1;
  const color = effect.color ?? 0x000000ff;
  const program = getWebGLEffectProgram(state, 'stylization.outline', OUTLINE_FRAGMENT_SRC);
  drawWebGLFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_threshold'), threshold);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_thickness'), thickness);
    gl.uniform4f(
      gl.getUniformLocation(p.program, 'u_color'),
      ((color >>> 24) & 0xff) / 255,
      ((color >>> 16) & 0xff) / 255,
      ((color >>> 8) & 0xff) / 255,
      (color & 0xff) / 255,
    );
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
  });
}

// Pixelate: snap uv to the center of `size`-pixel blocks before sampling, producing hard mosaic blocks.
export function applyPixelateEffectToWebGL(
  state: WebGLRenderState,
  source: Readonly<WebGLRenderTarget>,
  dest: Readonly<WebGLRenderTarget>,
  effect: Readonly<PixelateEffect>,
): void {
  const size = effect.size ?? 8;
  const program = getWebGLEffectProgram(state, 'stylization.pixelate', PIXELATE_FRAGMENT_SRC);
  drawWebGLFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_size'), Math.max(1, size));
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
  });
}

// Scanlines: darken by a vertical sine band; `count` sets the line density, `intensity` the darkening.
export function applyScanlinesEffectToWebGL(
  state: WebGLRenderState,
  source: Readonly<WebGLRenderTarget>,
  dest: Readonly<WebGLRenderTarget>,
  effect: Readonly<ScanlinesEffect>,
): void {
  const count = effect.count ?? 240;
  const intensity = effect.intensity ?? 0.3;
  const program = getWebGLEffectProgram(state, 'stylization.scanlines', SCANLINES_FRAGMENT_SRC);
  drawWebGLFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_count'), count);
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_intensity'), intensity);
  });
}

// Sharpen: unsharp mask via a 3x3 Laplacian kernel; `amount` scales the high-frequency boost.
export function applySharpenEffectToWebGL(
  state: WebGLRenderState,
  source: Readonly<WebGLRenderTarget>,
  dest: Readonly<WebGLRenderTarget>,
  effect: Readonly<SharpenEffect>,
): void {
  const amount = effect.amount ?? 0.5;
  const program = getWebGLEffectProgram(state, 'stylization.sharpen', SHARPEN_FRAGMENT_SRC);
  drawWebGLFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_amount'), amount);
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
  });
}

// Sketch: detect luminance edges and invert them into dark pencil strokes over a light page; `strength`
// scales how dark the strokes get.
export function applySketchEffectToWebGL(
  state: WebGLRenderState,
  source: Readonly<WebGLRenderTarget>,
  dest: Readonly<WebGLRenderTarget>,
  effect: Readonly<SketchEffect>,
): void {
  const strength = effect.strength ?? 1;
  const program = getWebGLEffectProgram(state, 'stylization.sketch', SKETCH_FRAGMENT_SRC);
  drawWebGLFullscreenPass(state, program, [source.texture], dest, (gl, p) => {
    gl.uniform1f(gl.getUniformLocation(p.program, 'u_strength'), strength);
    gl.uniform2f(gl.getUniformLocation(p.program, 'u_resolution'), source.width, source.height);
  });
}

export const defaultWebGLCRTEffectRunner: WebGLRenderEffectRunner = (ctx, effect) => {
  applyCRTEffectToWebGL(ctx.state, ctx.source, ctx.dest, effect as CRTEffect);
};

export const defaultWebGLDitherEffectRunner: WebGLRenderEffectRunner = (ctx, effect) => {
  applyDitherEffectToWebGL(ctx.state, ctx.source, ctx.dest, effect as DitherEffect);
};

export const defaultWebGLFilmGrainEffectRunner: WebGLRenderEffectRunner = (ctx, effect) => {
  applyFilmGrainEffectToWebGL(ctx.state, ctx.source, ctx.dest, effect as FilmGrainEffect);
};

export const defaultWebGLHalftoneEffectRunner: WebGLRenderEffectRunner = (ctx, effect) => {
  applyHalftoneEffectToWebGL(ctx.state, ctx.source, ctx.dest, effect as HalftoneEffect);
};

export const defaultWebGLKuwaharaEffectRunner: WebGLRenderEffectRunner = (ctx, effect) => {
  applyKuwaharaEffectToWebGL(ctx.state, ctx.source, ctx.dest, effect as KuwaharaEffect);
};

export const defaultWebGLOutlineEffectRunner: WebGLRenderEffectRunner = (ctx, effect) => {
  applyOutlineEffectToWebGL(ctx.state, ctx.source, ctx.dest, effect as OutlineEffect);
};

export const defaultWebGLPixelateEffectRunner: WebGLRenderEffectRunner = (ctx, effect) => {
  applyPixelateEffectToWebGL(ctx.state, ctx.source, ctx.dest, effect as PixelateEffect);
};

export const defaultWebGLScanlinesEffectRunner: WebGLRenderEffectRunner = (ctx, effect) => {
  applyScanlinesEffectToWebGL(ctx.state, ctx.source, ctx.dest, effect as ScanlinesEffect);
};

export const defaultWebGLSharpenEffectRunner: WebGLRenderEffectRunner = (ctx, effect) => {
  applySharpenEffectToWebGL(ctx.state, ctx.source, ctx.dest, effect as SharpenEffect);
};

export const defaultWebGLSketchEffectRunner: WebGLRenderEffectRunner = (ctx, effect) => {
  applySketchEffectToWebGL(ctx.state, ctx.source, ctx.dest, effect as SketchEffect);
};

const CRT_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_curvature;
uniform float u_scanlineIntensity;
uniform float u_vignette;
uniform float u_aberration;
uniform vec2 u_resolution;
out vec4 o_color;
vec2 barrel(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0;
  c += c * u_curvature * dot(c, c);
  return c * 0.5 + 0.5;
}
void main() {
  vec2 uv = barrel(v_texCoord);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    o_color = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec2 off = vec2(u_aberration, 0.0);
  float r = texture(u_texture0, uv + off).r;
  float g = texture(u_texture0, uv).g;
  float b = texture(u_texture0, uv - off).b;
  float a = texture(u_texture0, uv).a;
  vec3 col = vec3(r, g, b);
  float line = sin(uv.y * u_resolution.y * 3.14159265) * 0.5 + 0.5;
  col *= 1.0 - u_scanlineIntensity * (1.0 - line);
  vec2 vc = uv * 2.0 - 1.0;
  col *= 1.0 - u_vignette * dot(vc, vc);
  o_color = vec4(col, a);
}`;

const DITHER_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_levels;
uniform vec2 u_resolution;
out vec4 o_color;
float bayer(ivec2 p) {
  int x = p.x & 3;
  int y = p.y & 3;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return float(m[y * 4 + x]) / 16.0;
}
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  ivec2 px = ivec2(v_texCoord * u_resolution);
  float t = bayer(px) - 0.5;
  float steps = u_levels - 1.0;
  vec3 q = floor(c.rgb * steps + 0.5 + t) / steps;
  o_color = vec4(clamp(q, 0.0, 1.0), c.a);
}`;

const FILM_GRAIN_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_intensity;
uniform float u_size;
uniform float u_seed;
out vec4 o_color;
float hash(vec2 p) {
  p = floor(p / u_size);
  return fract(sin(dot(p, vec2(127.1, 311.7)) + u_seed) * 43758.5453123);
}
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float n = hash(v_texCoord * 1024.0) - 0.5;
  o_color = vec4(c.rgb + n * u_intensity, c.a);
}`;

const HALFTONE_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_scale;
uniform float u_angle;
uniform vec2 u_resolution;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float lum = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec2 p = v_texCoord * u_resolution;
  float s = sin(u_angle), co = cos(u_angle);
  vec2 rp = vec2(p.x * co - p.y * s, p.x * s + p.y * co);
  vec2 cell = mod(rp, u_scale) - u_scale * 0.5;
  float dist = length(cell) / (u_scale * 0.5);
  float radius = sqrt(1.0 - lum);
  float dot1 = step(dist, radius);
  o_color = vec4(c.rgb * dot1, c.a);
}`;

const KUWAHARA_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_radius;
uniform vec2 u_resolution;
out vec4 o_color;
const int R = 4;
void main() {
  vec2 texel = 1.0 / u_resolution;
  int r = int(min(float(R), u_radius));
  vec3 means[4];
  float vars[4];
  ivec2 lo[4] = ivec2[4](ivec2(-1, -1), ivec2(0, -1), ivec2(-1, 0), ivec2(0, 0));
  for (int q = 0; q < 4; q++) {
    vec3 sum = vec3(0.0);
    vec3 sumSq = vec3(0.0);
    float n = 0.0;
    for (int y = 0; y <= R; y++) {
      for (int x = 0; x <= R; x++) {
        if (x > r || y > r) continue;
        ivec2 d = ivec2(x, y) * sign(lo[q] + ivec2(1)) + lo[q] * r;
        vec2 off = vec2(float(d.x), float(d.y)) * texel;
        vec3 col = texture(u_texture0, v_texCoord + off).rgb;
        sum += col;
        sumSq += col * col;
        n += 1.0;
      }
    }
    vec3 mean = sum / n;
    means[q] = mean;
    vec3 v = sumSq / n - mean * mean;
    vars[q] = v.r + v.g + v.b;
  }
  float minVar = vars[0];
  vec3 result = means[0];
  for (int q = 1; q < 4; q++) {
    if (vars[q] < minVar) {
      minVar = vars[q];
      result = means[q];
    }
  }
  o_color = vec4(result, texture(u_texture0, v_texCoord).a);
}`;

const OUTLINE_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_threshold;
uniform float u_thickness;
uniform vec4 u_color;
uniform vec2 u_resolution;
out vec4 o_color;
float lum(vec2 uv) {
  return dot(texture(u_texture0, uv).rgb, vec3(0.2126, 0.7152, 0.0722));
}
void main() {
  vec2 texel = u_thickness / u_resolution;
  float tl = lum(v_texCoord + texel * vec2(-1.0, -1.0));
  float t = lum(v_texCoord + texel * vec2(0.0, -1.0));
  float tr = lum(v_texCoord + texel * vec2(1.0, -1.0));
  float l = lum(v_texCoord + texel * vec2(-1.0, 0.0));
  float rr = lum(v_texCoord + texel * vec2(1.0, 0.0));
  float bl = lum(v_texCoord + texel * vec2(-1.0, 1.0));
  float b = lum(v_texCoord + texel * vec2(0.0, 1.0));
  float br = lum(v_texCoord + texel * vec2(1.0, 1.0));
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * rr + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  float edge = sqrt(gx * gx + gy * gy);
  vec4 c = texture(u_texture0, v_texCoord);
  float k = step(u_threshold, edge);
  o_color = mix(c, u_color, k * u_color.a);
}`;

const PIXELATE_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_size;
uniform vec2 u_resolution;
out vec4 o_color;
void main() {
  vec2 blocks = u_resolution / u_size;
  vec2 uv = (floor(v_texCoord * blocks) + 0.5) / blocks;
  o_color = texture(u_texture0, uv);
}`;

const SCANLINES_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_count;
uniform float u_intensity;
out vec4 o_color;
void main() {
  vec4 c = texture(u_texture0, v_texCoord);
  float line = sin(v_texCoord.y * u_count * 3.14159265) * 0.5 + 0.5;
  o_color = vec4(c.rgb * (1.0 - u_intensity * (1.0 - line)), c.a);
}`;

const SHARPEN_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_amount;
uniform vec2 u_resolution;
out vec4 o_color;
void main() {
  vec2 texel = 1.0 / u_resolution;
  vec3 c = texture(u_texture0, v_texCoord).rgb;
  vec3 n = texture(u_texture0, v_texCoord + vec2(0.0, -texel.y)).rgb;
  vec3 s = texture(u_texture0, v_texCoord + vec2(0.0, texel.y)).rgb;
  vec3 e = texture(u_texture0, v_texCoord + vec2(texel.x, 0.0)).rgb;
  vec3 w = texture(u_texture0, v_texCoord + vec2(-texel.x, 0.0)).rgb;
  vec3 high = c * 4.0 - n - s - e - w;
  float a = texture(u_texture0, v_texCoord).a;
  o_color = vec4(clamp(c + high * u_amount, 0.0, 1.0), a);
}`;

const SKETCH_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 v_texCoord;
uniform sampler2D u_texture0;
uniform float u_strength;
uniform vec2 u_resolution;
out vec4 o_color;
float lum(vec2 uv) {
  return dot(texture(u_texture0, uv).rgb, vec3(0.2126, 0.7152, 0.0722));
}
void main() {
  vec2 texel = 1.0 / u_resolution;
  float tl = lum(v_texCoord + texel * vec2(-1.0, -1.0));
  float t = lum(v_texCoord + texel * vec2(0.0, -1.0));
  float tr = lum(v_texCoord + texel * vec2(1.0, -1.0));
  float l = lum(v_texCoord + texel * vec2(-1.0, 0.0));
  float rr = lum(v_texCoord + texel * vec2(1.0, 0.0));
  float bl = lum(v_texCoord + texel * vec2(-1.0, 1.0));
  float b = lum(v_texCoord + texel * vec2(0.0, 1.0));
  float br = lum(v_texCoord + texel * vec2(1.0, 1.0));
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * rr + br;
  float gy = -tl - 2.0 * t - tr + bl + 2.0 * b + br;
  float edge = sqrt(gx * gx + gy * gy);
  float pencil = clamp(1.0 - edge * u_strength, 0.0, 1.0);
  float a = texture(u_texture0, v_texCoord).a;
  o_color = vec4(vec3(pencil), a);
}`;
