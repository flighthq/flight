import { createMatrix3x2 } from '@flighthq/geometry';
import { createRenderState as _createRenderState, setBackgroundColor } from '@flighthq/render-core';
import type { WebGLRenderOptions, WebGLRenderState } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { compileDefaultProgram, createDefaultBitmapShader } from './webglShader';

export function createWebGLRenderState(
  canvas: HTMLCanvasElement,
  options: Partial<WebGLRenderOptions> = {},
): WebGLRenderState {
  const contextAttribs: WebGLContextAttributes = {
    alpha: true,
    antialias: options.antialias ?? false,
    powerPreference: options.powerPreference ?? 'default',
    ...options.contextAttributes,
  };

  const gl = canvas.getContext('webgl2', contextAttribs) as WebGL2RenderingContext | null;
  if (!gl) throw new Error('Failed to get WebGL2 context.');

  const shaderLoc = compileDefaultProgram(gl);
  const matrixArray = new Float32Array(9);
  const defaultBitmapShader = createDefaultBitmapShader(shaderLoc, matrixArray);

  // Static index buffer [0, 1, 2, 0, 2, 3]
  const quadIndexBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadIndexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);

  // Dynamic vertex buffer: 4 vertices × 4 floats (x, y, u, v) × 4 bytes = 64 bytes
  const quadVertexBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quadVertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, 64, gl.DYNAMIC_DRAW);

  const state = _createRenderState({
    allowSmoothing: options.imageSmoothingEnabled ?? true,
    pixelRatio: options.pixelRatio ?? window.devicePixelRatio | 1,
    renderTransform2D: createMatrix3x2(),
    roundPixels: options.roundPixels ?? false,
  }) as WebGLRenderStateInternal;

  if (options.backgroundColor) setBackgroundColor(state, options.backgroundColor);

  state.canvas = canvas;
  state.gl = gl;
  state.currentBlendMode = null;
  state.currentProgram = null;
  state.currentTexture = null;
  state.defaultBitmapShader = defaultBitmapShader;
  state.shaderLoc = shaderLoc;
  state.textureCache = new WeakMap();
  state.quadVertexBuffer = quadVertexBuffer;
  state.quadIndexBuffer = quadIndexBuffer;
  state.quadVertexData = new Float32Array(16);
  state.matrixArray = matrixArray;

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.DEPTH_TEST);

  return state;
}
