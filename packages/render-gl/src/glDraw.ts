import type { GlBitmapShader, GlBlendRealization, GlRenderState } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import { getGlRenderStateRuntime } from './glRenderState';
import { setGlAttributes, setGlMatrixFromValues } from './glShader';

// Applies the blend mode's registered fixed-function realization to the GL context, skipping the
// work when the mode is unchanged. A mode with no registered realization (an unregistered vendor
// mode, or a built-in with no fixed-function equivalent such as Overlay) degrades to normal
// premultiplied compositing. Register realizations with registerGlBlendMode /
// registerDefaultGlBlendModes before drawing.
export function applyGlBlendMode(state: GlRenderState, blendMode: BlendMode | null): void {
  const runtime = getGlRenderStateRuntime(state);
  if (blendMode === runtime.currentBlendMode) return;
  runtime.currentBlendMode = blendMode;
  const gl = state.gl;
  const realization = (blendMode !== null ? runtime.glBlendModeRegistry?.get(blendMode) : null) ?? NORMAL_BLEND;
  gl.blendEquation(gl[realization.equation ?? 'FUNC_ADD']);
  gl.blendFunc(gl[realization.src], gl[realization.dst]);
}

export function bindGlTexture(state: GlRenderState, imageSource: CanvasImageSource): WebGLTexture {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;
  const textureCache = runtime.textureCache;
  let texture = textureCache.get(imageSource);
  if (!texture) {
    const filter = state.allowSmoothing ? gl.LINEAR : gl.NEAREST;
    texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Both image and canvas sources present straight (un-premultiplied) alpha to texImage2D, so
    // premultiply on upload to match the premultiplied (ONE, ONE_MINUS_SRC_ALPHA) blend used
    // everywhere — uploaded images, canvas-backed shapes/text, and render-target composites. (A
    // straight-alpha texture under premultiplied blend blows RGB out to full, turning a 40%-white
    // shape opaque white.) Mirrors updateGlTexture, which already premultiplies canvas uploads.
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageSource as TexImageSource);
    textureCache.set(imageSource, texture);
    runtime.currentTexture = texture;
  } else if (runtime.currentTexture !== texture) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    runtime.currentTexture = texture;
  }
  return texture;
}

export function createGlTexture(state: GlRenderState): WebGLTexture {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;
  const filter = state.allowSmoothing ? gl.LINEAR : gl.NEAREST;
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  runtime.currentTexture = texture;
  return texture;
}

export function drawGlQuad(
  state: GlRenderState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
): void {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;
  const { quadVertexData, quadVertexBuffer, quadIndexBuffer, shaderLoc } = runtime;
  const v = quadVertexData;
  v[0] = x0;
  v[1] = y0;
  v[2] = u0;
  v[3] = v0;
  v[4] = x1;
  v[5] = y0;
  v[6] = u1;
  v[7] = v0;
  v[8] = x1;
  v[9] = y1;
  v[10] = u1;
  v[11] = v1;
  v[12] = x0;
  v[13] = y1;
  v[14] = u0;
  v[15] = v1;
  gl.bindBuffer(gl.ARRAY_BUFFER, quadVertexBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, v);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadIndexBuffer);
  setGlAttributes(gl, shaderLoc);
  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
}

export function enableGlBlendModeSupport(state: GlRenderState): void {
  registerDefaultGlBlendModes(state);
  state.applyBlendMode = applyGlBlendMode;
}

// Reports whether the render state has a fixed-function realization registered for the mode. A false
// result means applyGlBlendMode would fall back to normal compositing for it — either an unregistered
// vendor mode or a built-in (Overlay, HardLight, Difference, Invert) that needs a shader pass.
export function isBlendModeSupported(state: GlRenderState, blendMode: BlendMode): boolean {
  return getGlRenderStateRuntime(state).glBlendModeRegistry?.has(blendMode) ?? false;
}

// Registers the built-in fixed-function blend modes on the state. Overlay/HardLight/Difference/Invert
// are intentionally omitted — they have no fixed-function equivalent and need a shader pass — so they
// stay unregistered and fall back to normal compositing.
export function registerDefaultGlBlendModes(state: GlRenderState): void {
  for (const [mode, realization] of DEFAULT_GL_BLEND_MODES) registerGlBlendMode(state, mode, realization);
}

// Binds a fixed-function realization to a blend mode on this render state. Last-write-wins, so a
// caller can override a built-in mode or add a vendor-prefixed one; the registry is created lazily on
// first registration so a state that never enables blend support carries no map.
export function registerGlBlendMode(state: GlRenderState, blendMode: BlendMode, realization: GlBlendRealization): void {
  const runtime = getGlRenderStateRuntime(state);
  (runtime.glBlendModeRegistry ??= new Map()).set(blendMode, realization);
}

export function setGlQuadMatrixFromOffset(
  state: GlRenderState,
  a: number,
  b: number,
  c: number,
  d: number,
  tx: number,
  ty: number,
  dx: number,
  dy: number,
): void {
  const runtime = getGlRenderStateRuntime(state);
  setGlMatrixFromValues(
    state.gl,
    runtime.shaderLoc,
    runtime.matrixArray,
    a,
    b,
    c,
    d,
    tx + a * dx + c * dy,
    ty + b * dx + d * dy,
    runtime.renderTargetViewport ?? state.canvas,
  );
}

export function updateGlTexture(state: GlRenderState, texture: WebGLTexture, canvas: HTMLCanvasElement): void {
  const runtime = getGlRenderStateRuntime(state);
  const gl = state.gl;
  if (runtime.currentTexture !== texture) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    runtime.currentTexture = texture;
  }
  // Browsers pass canvas pixel data to Gl as straight (unmultiplied) alpha.
  // Premultiply on upload so the texture matches the (ONE, ONE_MINUS_SRC_ALPHA) blend mode.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
}

export function useGlProgram(state: GlRenderState, shader?: GlBitmapShader): void {
  const runtime = getGlRenderStateRuntime(state);
  const resolved = shader ?? runtime.defaultBitmapShader;
  runtime.shaderLoc = resolved.locations;
  const program = resolved.program;
  if (runtime.currentProgram !== program) {
    state.gl.useProgram(program);
    runtime.currentProgram = program;
  }
}

const NORMAL_BLEND: GlBlendRealization = { src: 'ONE', dst: 'ONE_MINUS_SRC_ALPHA' };

// The built-in blend modes registerDefaultGlBlendModes installs, each with its fixed-function
// realization. Overlay/HardLight/Difference/Invert are deliberately absent — they have no
// fixed-function equivalent and need a shader pass.
const DEFAULT_GL_BLEND_MODES: readonly (readonly [BlendMode, GlBlendRealization])[] = [
  [BlendMode.Add, { src: 'ONE', dst: 'ONE' }],
  [BlendMode.Darken, { src: 'ONE', dst: 'ONE', equation: 'MIN' }],
  [BlendMode.Erase, { src: 'ZERO', dst: 'ONE_MINUS_SRC_ALPHA' }],
  [BlendMode.Layer, NORMAL_BLEND],
  [BlendMode.Lighten, { src: 'ONE', dst: 'ONE', equation: 'MAX' }],
  // Premultiplied multiply: result = src.rgb*dst + dst*(1-src.a). The (1-src.a) term restores the
  // destination where the source is transparent or partially covered (antialiased edges, the quad's
  // transparent surround), so those pixels leave the backdrop untouched instead of multiplying it
  // toward black — the straight-alpha (DST_COLOR, ZERO) form fringes there because this pipeline
  // uploads and shades premultiplied. Exact for an opaque backdrop.
  [BlendMode.Multiply, { src: 'DST_COLOR', dst: 'ONE_MINUS_SRC_ALPHA' }],
  // No blending: result = src (the premultiplied source replaces the destination). For opaque
  // content this matches Normal; unlike Normal it does not composite, so semi-transparent source
  // pixels overwrite the backdrop instead of blending over it.
  [BlendMode.None, { src: 'ONE', dst: 'ZERO' }],
  [BlendMode.Normal, NORMAL_BLEND],
  [BlendMode.Screen, { src: 'ONE', dst: 'ONE_MINUS_SRC_COLOR' }],
  [BlendMode.Subtract, { src: 'ONE', dst: 'ONE', equation: 'FUNC_REVERSE_SUBTRACT' }],
];
