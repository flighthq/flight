import { createMatrix } from '@flighthq/geometry';
import { createRenderState as _createRenderState, setRenderStateBackgroundColor } from '@flighthq/render';
import type { WebGLRenderOptions, WebGLRenderState } from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { compileDefaultWebGLProgram, createDefaultWebGLBitmapShader } from './webglShader';

export function createWebGLRenderState(
  canvas: HTMLCanvasElement,
  options: Partial<WebGLRenderOptions> = {},
): WebGLRenderState {
  const contextAttribs: WebGLContextAttributes = {
    alpha: true,
    antialias: options.antialias ?? false,
    powerPreference: options.powerPreference ?? 'default',
    stencil: true,
    ...options.contextAttributes,
  };

  const gl = canvas.getContext('webgl2', contextAttribs) as WebGL2RenderingContext | null;
  if (!gl) throw new Error('Failed to get WebGL2 context.');

  const shaderLoc = compileDefaultWebGLProgram(gl);
  const matrixArray = new Float32Array(9);
  const defaultBitmapShader = createDefaultWebGLBitmapShader(shaderLoc, matrixArray);

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
    pixelRatio: options.pixelRatio ?? (window.devicePixelRatio || 1),
    renderTransform2D: createMatrix(),
    roundPixels: options.roundPixels ?? false,
    sceneGraphSyncPolicy: options.sceneGraphSyncPolicy,
  }) as WebGLRenderStateInternal;

  if (options.backgroundColor != null) setRenderStateBackgroundColor(state, options.backgroundColor);

  state.applyBlendMode = null;
  state.canvas = canvas;
  state.gl = gl;
  state.currentBlendMode = null;
  state.currentFramebuffer = null;
  state.currentMaskDepth = 0;
  state.currentProgram = null;
  state.currentScissorRect = null;
  state.currentTexture = null;
  state.renderTargetViewport = null;
  state.defaultBitmapShader = defaultBitmapShader;
  state.shaderLoc = shaderLoc;
  state.spriteBatchBlendMode = null;
  state.spriteBatchColorTransform = null;
  state.spriteBatchCount = 0;
  state.spriteBatchInstanceBuffer = null;
  state.spriteBatchInstanceData = new Float32Array(13 * 256);
  state.spriteBatchTexture = null;
  state.textureCache = new WeakMap();
  state.quadVertexBuffer = quadVertexBuffer;
  state.quadIndexBuffer = quadIndexBuffer;
  state.quadVertexData = new Float32Array(16);
  state.matrixArray = matrixArray;
  state.scissorStack = [];

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.DEPTH_TEST);

  return state;
}
