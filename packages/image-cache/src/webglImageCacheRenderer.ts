import { multiplyMatrix } from '@flighthq/geometry';
import { acquireMatrix, releaseMatrix } from '@flighthq/geometry/matrixPool';
import { createNullRendererData } from '@flighthq/render-core';
import {
  bindWebGLTexture,
  drawWebGLQuad,
  setWebGLAttribs,
  setWebGLBaseUniforms,
  setWebGLBlendMode,
  setWebGLMatrixFromTransform,
  useWebGLProgram,
  type WebGLRenderStateInternal,
} from '@flighthq/render-webgl';
import { getDisplayObjectRuntime } from '@flighthq/scenegraph-display';
import type { DisplayObjectRenderer, DisplayObjectRenderNode, RenderState, WebGLRenderState } from '@flighthq/types';

import { registerImageCacheRenderer } from './imageCacheTransformer';

function drawWebGLImageCache(state: RenderState, renderNode: DisplayObjectRenderNode): void {
  const cache = getDisplayObjectRuntime(renderNode.source).imageCache;
  if (cache === null) return;
  const cacheSource = cache.source;
  if (cacheSource === null) return;
  const src = cacheSource.src;
  if (src === null) return;
  if (cacheSource.width <= 0 || cacheSource.height <= 0) return;

  const internal = state as WebGLRenderStateInternal;
  useWebGLProgram(internal);
  setWebGLBlendMode(state as WebGLRenderState, renderNode.blendMode);
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

function drawWebGLImageCacheMask(_state: RenderState, _node: DisplayObjectRenderNode): void {}

export const defaultWebGLImageCacheRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawWebGLImageCache,
  drawMask: drawWebGLImageCacheMask,
};

export function enableWebGLImageCache(state: RenderState): void {
  registerImageCacheRenderer(state, defaultWebGLImageCacheRenderer);
}
