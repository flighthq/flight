import { multiplyMatrix } from '@flighthq/geometry';
import { acquireMatrix, releaseMatrix } from '@flighthq/geometry/matrixPool';
import { createNullRendererData } from '@flighthq/render';
import { isImageRenderCachePrimitive, registerImageRenderCacheRenderer } from '@flighthq/render';
import type {
  DisplayObjectMaskRenderer,
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  ImageRenderCacheResult,
  RenderState,
  WebGLRenderState,
} from '@flighthq/types';

import type { WebGLRenderStateInternal } from './internal';
import { bindWebGLTexture, drawWebGLQuad, setWebGLBlendMode, useWebGLProgram } from './webglDraw';
import { setWebGLAttribs, setWebGLBaseUniforms, setWebGLMatrixFromTransform } from './webglShader';

export function drawWebGLImageCacheResult(
  state: WebGLRenderState,
  renderNode: DisplayObjectRenderNode,
  cache: ImageRenderCacheResult,
): void {
  const cacheSource = cache.source;
  if (cacheSource === null) return;
  const src = cacheSource.src;
  if (src === null) return;
  if (cacheSource.width <= 0 || cacheSource.height <= 0) return;

  const internal = state as WebGLRenderStateInternal;
  useWebGLProgram(internal);
  setWebGLBlendMode(internal, renderNode.blendMode);
  bindWebGLTexture(internal, src);

  const quadTransform = acquireMatrix();
  multiplyMatrix(quadTransform, renderNode.transform2D, cache.transform);

  const { gl, shaderLoc, matrixArray } = internal;
  setWebGLAttribs(gl, shaderLoc);
  setWebGLMatrixFromTransform(gl, shaderLoc, matrixArray, quadTransform, internal.canvas);
  setWebGLBaseUniforms(gl, shaderLoc, renderNode);
  releaseMatrix(quadTransform);

  drawWebGLQuad(internal, 0, 0, cacheSource.width, cacheSource.height, 0, 0, 1, 1);
}

function drawWebGLRenderImageCache(state: RenderState, renderNode: DisplayObjectRenderNode): void {
  const source = renderNode.source;
  if (!isImageRenderCachePrimitive(source)) return;
  const cache = source.cache;
  const cacheSource = cache.source;
  if (cacheSource === null) return;
  const src = cacheSource.src;
  if (src === null) return;
  if (cacheSource.width <= 0 || cacheSource.height <= 0) return;

  const internal = state as WebGLRenderStateInternal;
  useWebGLProgram(internal);
  setWebGLBlendMode(state as WebGLRenderState, renderNode.blendMode);
  bindWebGLTexture(internal, src);

  const { gl, shaderLoc, matrixArray } = internal;
  setWebGLAttribs(gl, shaderLoc);
  setWebGLMatrixFromTransform(gl, shaderLoc, matrixArray, renderNode.transform2D, internal.canvas);
  setWebGLBaseUniforms(gl, shaderLoc, renderNode);

  drawWebGLQuad(internal, 0, 0, cacheSource.width, cacheSource.height, 0, 0, 1, 1);
}

function drawWebGLRenderImageCacheMask(state: RenderState, node: DisplayObjectRenderNode): void {
  drawWebGLRenderImageCache(state, node);
}

export const defaultWebGLRenderImageCacheRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawWebGLRenderImageCache,
};

export const defaultWebGLRenderImageCacheMaskRenderer: DisplayObjectMaskRenderer = {
  drawMask: drawWebGLRenderImageCacheMask,
};

export function enableWebGLRenderImageCache(state: RenderState): void {
  registerImageRenderCacheRenderer(state, defaultWebGLRenderImageCacheRenderer);
}
