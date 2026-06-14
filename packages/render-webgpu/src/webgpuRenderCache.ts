import { noopRendererData } from '@flighthq/render';
import { isImageRenderCachePrimitive, registerImageRenderCacheRenderer } from '@flighthq/render';
import type {
  DisplayObjectMaskRenderer,
  DisplayObjectRenderer,
  DisplayObjectRenderNode,
  ImageRenderCacheResult,
  RenderState,
  WebGPURenderState,
} from '@flighthq/types';

import type { WebGPURenderStateInternal } from './internal';
import { bindWebGPUTexture, drawWebGPUQuad } from './webgpuDraw';

export function drawWebGPUImageCacheResult(
  state: WebGPURenderState,
  renderNode: DisplayObjectRenderNode,
  cache: ImageRenderCacheResult,
): void {
  const cacheSource = cache.source;
  if (cacheSource === null) return;
  const src = cacheSource.src;
  if (src === null) return;
  if (cacheSource.width <= 0 || cacheSource.height <= 0) return;

  const internal = state as WebGPURenderStateInternal;
  if (internal.renderPass === null) return;

  internal.applyBlendMode?.(internal, renderNode.blendMode);
  const textureEntry = bindWebGPUTexture(internal, src);

  const { a, b, c, d, tx, ty } = renderNode.transform2D;
  const { a: ca, b: cb, c: cc, d: cd, tx: ctx, ty: cty } = cache.transform;
  const composedTransform = {
    a: a * ca + c * cb,
    b: b * ca + d * cb,
    c: a * cc + c * cd,
    d: b * cc + d * cd,
    tx: a * ctx + c * cty + tx,
    ty: b * ctx + d * cty + ty,
  };

  // Temporarily override transform2D for the draw
  const savedTransform = renderNode.transform2D;
  (renderNode as { transform2D: typeof composedTransform }).transform2D = composedTransform;
  drawWebGPUQuad(internal, renderNode, textureEntry, 0, 0, cacheSource.width, cacheSource.height, 0, 0, 1, 1);
  (renderNode as { transform2D: typeof savedTransform }).transform2D = savedTransform;
}

function drawWebGPURenderImageCache(state: RenderState, renderNode: DisplayObjectRenderNode): void {
  const source = renderNode.source;
  if (!isImageRenderCachePrimitive(source)) return;
  const cache = source.cache;
  const cacheSource = cache.source;
  if (cacheSource === null) return;
  const src = cacheSource.src;
  if (src === null) return;
  if (cacheSource.width <= 0 || cacheSource.height <= 0) return;

  const internal = state as WebGPURenderStateInternal;
  if (internal.renderPass === null) return;

  internal.applyBlendMode?.(internal, renderNode.blendMode);
  const textureEntry = bindWebGPUTexture(internal, src);

  drawWebGPUQuad(internal, renderNode, textureEntry, 0, 0, cacheSource.width, cacheSource.height, 0, 0, 1, 1);
}

function drawWebGPURenderImageCacheMask(state: RenderState, node: DisplayObjectRenderNode): void {
  drawWebGPURenderImageCache(state, node);
}

export const defaultWebGPURenderImageCacheRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  draw: drawWebGPURenderImageCache,
};

export const defaultWebGPURenderImageCacheMaskRenderer: DisplayObjectMaskRenderer = {
  drawMask: drawWebGPURenderImageCacheMask,
};

export function enableWebGPURenderImageCache(state: RenderState): void {
  registerImageRenderCacheRenderer(state, defaultWebGPURenderImageCacheRenderer);
}
