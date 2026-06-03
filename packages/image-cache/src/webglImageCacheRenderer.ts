import { createNullRendererData } from '@flighthq/render';
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
import type {
  DisplayObjectMaskRenderer,
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  RenderState,
  WebGLRenderState,
} from '@flighthq/types';

import { isImageCachePrimitive } from './imageCachePrimitive';
import { registerImageCacheRenderer } from './imageCacheSceneNodeResolver';

function drawWebGLImageCache(state: RenderState, renderNode: DisplayObjectRenderNode): void {
  const source = renderNode.source;
  if (!isImageCachePrimitive(source)) return;
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

function drawWebGLImageCacheMask(state: RenderState, node: DisplayObjectRenderNode): void {
  drawWebGLImageCache(state, node);
}

export const defaultWebGLImageCacheRenderer: DisplayObjectRenderer = {
  createData: createNullRendererData,
  draw: drawWebGLImageCache,
};

export const defaultWebGLImageCacheMaskRenderer: DisplayObjectMaskRenderer = {
  drawMask: drawWebGLImageCacheMask,
};

export function enableWebGLImageCache(state: RenderState): void {
  registerImageCacheRenderer(state, defaultWebGLImageCacheRenderer);
}
