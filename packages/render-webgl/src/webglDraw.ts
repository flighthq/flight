import { enableRenderFeatures } from '@flighthq/render';
import type { WebGLRenderState } from '@flighthq/types';
import { BlendMode, RenderFeatures } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { setWebGLAttribs, setWebGLMatrixFromValues } from './webglShader';
import type { WebGLBitmapShader } from './webglShaderTypes';

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
  if (blendMode === state.currentBlendMode) return;
  state.currentBlendMode = blendMode;
  const [src, dst] = (blendMode !== null ? WEBGL_BLEND_MODE[blendMode] : null) ?? NORMAL_BLEND;
  state.gl.blendFunc(state.gl[src], state.gl[dst]);
}

export function bindWebGLTexture(state: WebGLRenderStateInternal, imageSource: CanvasImageSource): WebGLTexture {
  const { gl, textureCache } = state;
  let texture = textureCache.get(imageSource);
  if (!texture) {
    const filter = state.allowSmoothing ? gl.LINEAR : gl.NEAREST;
    texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Images have straight alpha — premultiply on upload.
    // Canvas sources are already premultiplied by the 2D context — don't premultiply again.
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !(imageSource instanceof HTMLCanvasElement));
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageSource as TexImageSource);
    textureCache.set(imageSource, texture);
    state.currentTexture = texture;
  } else if (state.currentTexture !== texture) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    state.currentTexture = texture;
  }
  return texture;
}

export function createWebGLTexture(state: WebGLRenderStateInternal): WebGLTexture {
  const { gl } = state;
  const filter = state.allowSmoothing ? gl.LINEAR : gl.NEAREST;
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  state.currentTexture = texture;
  return texture;
}

export function drawWebGLQuad(
  state: WebGLRenderStateInternal,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
): void {
  const { gl, quadVertexData, quadVertexBuffer, quadIndexBuffer, shaderLoc } = state;
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
  setWebGLAttribs(gl, shaderLoc);
  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
}

export function enableWebGLBlendModeSupport(state: WebGLRenderState): void {
  state.applyBlendMode = applyWebGLBlendMode;
  enableRenderFeatures(state, RenderFeatures.BlendMode);
}

export function setQuadMatrixFromOffset(
  state: WebGLRenderStateInternal,
  a: number,
  b: number,
  c: number,
  d: number,
  tx: number,
  ty: number,
  dx: number,
  dy: number,
): void {
  setWebGLMatrixFromValues(
    state.gl,
    state.shaderLoc,
    state.matrixArray,
    a,
    b,
    c,
    d,
    tx + a * dx + c * dy,
    ty + b * dx + d * dy,
    state.renderTargetViewport ?? state.canvas,
  );
}

export function updateWebGLTexture(
  state: WebGLRenderStateInternal,
  texture: WebGLTexture,
  canvas: HTMLCanvasElement,
): void {
  const { gl } = state;
  if (state.currentTexture !== texture) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    state.currentTexture = texture;
  }
  // Browsers pass canvas pixel data to WebGL as straight (unmultiplied) alpha.
  // Premultiply on upload so the texture matches the (ONE, ONE_MINUS_SRC_ALPHA) blend mode.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
}

export function useWebGLProgram(
  state: WebGLRenderStateInternal,
  shader: WebGLBitmapShader = state.defaultBitmapShader,
): void {
  state.shaderLoc = shader.locations;
  const program = shader.program;
  if (state.currentProgram !== program) {
    state.gl.useProgram(program);
    state.currentProgram = program;
  }
}
