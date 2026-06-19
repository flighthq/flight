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
    pixelRatio: options.pixelRatio ?? 1,
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
  state.spriteBatchMaterial = null;
  state.spriteBatchMaterialRenderer = null;
  state.spriteBatchMaterialFloats = 0;
  state.spriteBatchMaterialData = new Float32Array(8 * 256);
  state.spriteBatchMaterialBuffer = null;
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
  state.clipForms = [];

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.DEPTH_TEST);

  return state;
}

// Frees the GPU resources createWebGLRenderState and the lazy ensure* helpers allocated on `state`:
// the compiled shader programs and the vertex/index/instance buffers. Call when the render state is
// no longer needed. Pass the state returned by createWebGLRenderState — render-cache states derived
// from it (createWebGLCacheState) alias these resources and become invalid too.
//
// Two things are intentionally NOT freed here:
//   - User-registered material shaders (materialBitmapShaderMap and setWebGLShader bindings): their
//     programs may be shared across states, so freeing them is the registrant's responsibility.
//   - textureCache textures: textureCache is a WeakMap and cannot be enumerated. Those textures are
//     freed per-node by the dispose* paths, or by the browser when the GL context is lost.
//
// Deleting an already-deleted WebGL program or buffer is a silent no-op, so destroying a screen
// state whose resources a cache state still aliases is safe.
export function destroyWebGLRenderState(state: WebGLRenderState): void {
  const internal = state as WebGLRenderStateInternal;
  const gl = internal.gl;

  // Dedupe: several shader wrappers (e.g. defaultBitmapShader) share shaderLoc.program.
  const programs = new Set<WebGLProgram>();
  if (internal.shaderLoc) programs.add(internal.shaderLoc.program);
  if (internal.defaultBitmapShader) programs.add(internal.defaultBitmapShader.program);
  if (internal.colorTransformBitmapShader) programs.add(internal.colorTransformBitmapShader.program);
  if (internal.particleShader) programs.add(internal.particleShader.program);
  if (internal.quadBatchShader) programs.add(internal.quadBatchShader.program);
  if (internal.colorTransformInstancedShader) programs.add(internal.colorTransformInstancedShader.program);
  if (internal.uniformColorTransformShader) programs.add(internal.uniformColorTransformShader.program);
  for (const program of programs) gl.deleteProgram(program);

  gl.deleteBuffer(internal.quadVertexBuffer);
  gl.deleteBuffer(internal.quadIndexBuffer);
  if (internal.particleCornerBuffer) gl.deleteBuffer(internal.particleCornerBuffer);
  if (internal.particleInstanceBuffer) gl.deleteBuffer(internal.particleInstanceBuffer);
  if (internal.quadBatchCornerBuffer) gl.deleteBuffer(internal.quadBatchCornerBuffer);
  if (internal.spriteBatchInstanceBuffer) gl.deleteBuffer(internal.spriteBatchInstanceBuffer);
  if (internal.spriteBatchMaterialBuffer) gl.deleteBuffer(internal.spriteBatchMaterialBuffer);
}
