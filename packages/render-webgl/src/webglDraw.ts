import type { WebGLBitmapShader, WebGLRenderState } from '@flighthq/types';
import { BlendMode } from '@flighthq/types';

import { getWebGLRenderStateRuntime } from './webglRenderState';
import { setWebGLAttributes, setWebGLMatrixFromValues } from './webglShader';

type WebGLBlendFactor = 'ONE' | 'ONE_MINUS_SRC_ALPHA';

const NORMAL_BLEND: readonly [WebGLBlendFactor, WebGLBlendFactor] = ['ONE', 'ONE_MINUS_SRC_ALPHA'];

// Auditable map from a blend-mode intent to the WebGL fixed-function blendFunc factors
// (premultiplied alpha) that realize it. `null` means there is no fixed-function
// equivalent — such modes would need shader-based blending — so the intent degrades to
// normal compositing.
const WEBGL_BLEND_MODE: Record<BlendMode, readonly [WebGLBlendFactor, WebGLBlendFactor] | null> = {
  [BlendMode.Add]: ['ONE', 'ONE'],
  [BlendMode.Alpha]: null,
  [BlendMode.Darken]: null,
  [BlendMode.Difference]: null,
  [BlendMode.Erase]: null,
  [BlendMode.Hardlight]: null,
  [BlendMode.Invert]: null,
  [BlendMode.Layer]: NORMAL_BLEND,
  [BlendMode.Lighten]: null,
  [BlendMode.Multiply]: null,
  [BlendMode.Normal]: NORMAL_BLEND,
  [BlendMode.Overlay]: null,
  [BlendMode.Screen]: null,
  [BlendMode.Shader]: null,
  [BlendMode.Subtract]: null,
};

export function applyWebGLBlendMode(state: WebGLRenderState, blendMode: BlendMode | null): void {
  const runtime = getWebGLRenderStateRuntime(state);
  if (blendMode === runtime.currentBlendMode) return;
  runtime.currentBlendMode = blendMode;
  const [src, dst] = (blendMode !== null ? WEBGL_BLEND_MODE[blendMode] : null) ?? NORMAL_BLEND;
  state.gl.blendFunc(state.gl[src], state.gl[dst]);
}

export function bindWebGLTexture(state: WebGLRenderState, imageSource: CanvasImageSource): WebGLTexture {
  const runtime = getWebGLRenderStateRuntime(state);
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
    // shape opaque white.) Mirrors updateWebGLTexture, which already premultiplies canvas uploads.
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

export function createWebGLTexture(state: WebGLRenderState): WebGLTexture {
  const runtime = getWebGLRenderStateRuntime(state);
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

export function drawWebGLQuad(
  state: WebGLRenderState,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
): void {
  const runtime = getWebGLRenderStateRuntime(state);
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
  setWebGLAttributes(gl, shaderLoc);
  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
}

export function enableWebGLBlendModeSupport(state: WebGLRenderState): void {
  state.applyBlendMode = applyWebGLBlendMode;
}

export function setWebGLQuadMatrixFromOffset(
  state: WebGLRenderState,
  a: number,
  b: number,
  c: number,
  d: number,
  tx: number,
  ty: number,
  dx: number,
  dy: number,
): void {
  const runtime = getWebGLRenderStateRuntime(state);
  setWebGLMatrixFromValues(
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

export function updateWebGLTexture(state: WebGLRenderState, texture: WebGLTexture, canvas: HTMLCanvasElement): void {
  const runtime = getWebGLRenderStateRuntime(state);
  const gl = state.gl;
  if (runtime.currentTexture !== texture) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    runtime.currentTexture = texture;
  }
  // Browsers pass canvas pixel data to WebGL as straight (unmultiplied) alpha.
  // Premultiply on upload so the texture matches the (ONE, ONE_MINUS_SRC_ALPHA) blend mode.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
}

export function useWebGLProgram(state: WebGLRenderState, shader?: WebGLBitmapShader): void {
  const runtime = getWebGLRenderStateRuntime(state);
  const resolved = shader ?? runtime.defaultBitmapShader;
  runtime.shaderLoc = resolved.locations;
  const program = resolved.program;
  if (runtime.currentProgram !== program) {
    state.gl.useProgram(program);
    runtime.currentProgram = program;
  }
}
