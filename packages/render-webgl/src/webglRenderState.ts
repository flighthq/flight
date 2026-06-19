import { createMatrix } from '@flighthq/geometry';
import {
  createRenderState as _createRenderState,
  createRenderStateRuntime,
  setRenderStateBackgroundColor,
} from '@flighthq/render';
import type { WebGLRenderOptions, WebGLRenderState, WebGLRenderStateRuntime } from '@flighthq/types';
import { EntityRuntimeKey } from '@flighthq/types';

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
  }) as WebGLRenderState;

  state.applyBlendMode = null;
  (state as { canvas: HTMLCanvasElement }).canvas = canvas;
  (state as { gl: WebGL2RenderingContext }).gl = gl;

  if (options.backgroundColor != null) setRenderStateBackgroundColor(state, options.backgroundColor);

  const runtime = createWebGLRenderStateRuntime();
  state[EntityRuntimeKey] = runtime;
  runtime.currentBlendMode = null;
  runtime.currentFramebuffer = null;
  runtime.currentMaskDepth = 0;
  runtime.currentProgram = null;
  runtime.currentScissorRect = null;
  runtime.currentTexture = null;
  runtime.renderTargetViewport = null;
  runtime.defaultBitmapShader = defaultBitmapShader;
  runtime.shaderLoc = shaderLoc;
  runtime.spriteBatchBlendMode = null;
  runtime.spriteBatchMaterial = null;
  runtime.spriteBatchMaterialRenderer = null;
  runtime.spriteBatchMaterialFloats = 0;
  runtime.spriteBatchMaterialData = new Float32Array(8 * 256);
  runtime.spriteBatchMaterialBuffer = null;
  runtime.spriteBatchCount = 0;
  runtime.spriteBatchInstanceBuffer = null;
  runtime.spriteBatchInstanceData = new Float32Array(13 * 256);
  runtime.spriteBatchTexture = null;
  runtime.textureCache = new WeakMap();
  runtime.quadVertexBuffer = quadVertexBuffer;
  runtime.quadIndexBuffer = quadIndexBuffer;
  runtime.quadVertexData = new Float32Array(16);
  runtime.matrixArray = matrixArray;
  runtime.scissorStack = [];
  runtime.clipForms = [];

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.DEPTH_TEST);

  return state;
}

// Allocates the package-private GPU runtime for a WebGLRenderState. createWebGLRenderState attaches
// one to each state under EntityRuntimeKey and populates its fields; getWebGLRenderStateRuntime reads
// it back. The render path writes the returned object every frame, so the return is intentionally
// mutable (not Readonly).
export function createWebGLRenderStateRuntime(): WebGLRenderStateRuntime {
  return createRenderStateRuntime() as WebGLRenderStateRuntime;
}

// Frees the GPU resources createWebGLRenderState and the lazy ensure* helpers allocated on the
// state's runtime: the compiled shader programs and the vertex/index/instance buffers. Call when the
// render state is no longer needed. Pass the state returned by createWebGLRenderState — render-cache
// states derived from it (createWebGLCacheState) alias these resources and become invalid too.
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
  const runtime = getWebGLRenderStateRuntime(state);
  const gl = state.gl;

  // Dedupe: several shader wrappers (e.g. defaultBitmapShader) share shaderLoc.program.
  const programs = new Set<WebGLProgram>();
  if (runtime.shaderLoc) programs.add(runtime.shaderLoc.program);
  if (runtime.defaultBitmapShader) programs.add(runtime.defaultBitmapShader.program);
  if (runtime.colorTransformBitmapShader) programs.add(runtime.colorTransformBitmapShader.program);
  if (runtime.particleShader) programs.add(runtime.particleShader.program);
  if (runtime.quadBatchShader) programs.add(runtime.quadBatchShader.program);
  if (runtime.colorTransformInstancedShader) programs.add(runtime.colorTransformInstancedShader.program);
  if (runtime.uniformColorTransformShader) programs.add(runtime.uniformColorTransformShader.program);
  for (const program of programs) gl.deleteProgram(program);

  gl.deleteBuffer(runtime.quadVertexBuffer);
  gl.deleteBuffer(runtime.quadIndexBuffer);
  if (runtime.particleCornerBuffer) gl.deleteBuffer(runtime.particleCornerBuffer);
  if (runtime.particleInstanceBuffer) gl.deleteBuffer(runtime.particleInstanceBuffer);
  if (runtime.quadBatchCornerBuffer) gl.deleteBuffer(runtime.quadBatchCornerBuffer);
  if (runtime.spriteBatchInstanceBuffer) gl.deleteBuffer(runtime.spriteBatchInstanceBuffer);
  if (runtime.spriteBatchMaterialBuffer) gl.deleteBuffer(runtime.spriteBatchMaterialBuffer);
}

// Resolves the package-private GPU runtime attached to a WebGLRenderState. Mutable by design: the
// render path writes its fields every frame.
export function getWebGLRenderStateRuntime(state: WebGLRenderState): WebGLRenderStateRuntime {
  return state[EntityRuntimeKey] as WebGLRenderStateRuntime;
}
