import type { ImageRenderCacheResult } from './ImageRenderCacheResult';
import type { Renderable } from './Renderable';
import type { RenderNodeAdapter } from './RenderNodeAdapter';
import type { RenderPrimitive } from './RenderPrimitive';

export const ImageRenderCacheKind: unique symbol = Symbol('ImageRenderCache');
export type ImageRenderCacheKind = typeof ImageRenderCacheKind;

export interface ImageRenderCachePrimitive extends RenderPrimitive {
  cache: ImageRenderCacheResult;
  kind: ImageRenderCacheKind;
  owner: Renderable;
}

export type ImageRenderCacheAdapter = RenderNodeAdapter & {
  result: ImageRenderCacheResult | null;
};
