import { createEntity } from '@flighthq/entity';
import type { DisplayObject, ImageCacheResult, PresentationRenderable } from '@flighthq/types';

import { ImageCacheKind } from './imageCacheKind';

export interface ImageCachePrimitive extends PresentationRenderable {
  cache: ImageCacheResult;
  owner: DisplayObject;
}

export function createImageCachePrimitive(owner: DisplayObject, cache: ImageCacheResult): ImageCachePrimitive {
  return createEntity({
    cache,
    kind: ImageCacheKind,
    owner,
  });
}

export function isImageCachePrimitive(source: unknown): source is ImageCachePrimitive {
  return typeof source === 'object' && source !== null && (source as ImageCachePrimitive).kind === ImageCacheKind;
}
