import { getSceneNodeRuntime } from '@flighthq/scene-core';
import type { ImageCacheResult, SceneNode, SceneNodeRuntime } from '@flighthq/types';

import type { ImageCacheResolver } from './imageCacheRenderNodeResolver';
import { createImageCacheResolver, isImageCacheResolver } from './imageCacheRenderNodeResolver';

export function clearImageCache(source: SceneNode<symbol, object>): void {
  (getSceneNodeRuntime(source) as SceneNodeRuntime<symbol, object>).resolver = null;
}

export function getImageCache(source: SceneNode<symbol, object>): ImageCacheResult | null {
  const resolver = (getSceneNodeRuntime(source) as SceneNodeRuntime<symbol, object>).resolver;
  return isImageCacheResolver(resolver) ? resolver.result : null;
}

export function setImageCache(source: SceneNode<symbol, object>, result: ImageCacheResult): void {
  const runtime = getSceneNodeRuntime(source) as SceneNodeRuntime<symbol, object>;
  if (!isImageCacheResolver(runtime.resolver)) {
    runtime.resolver = createImageCacheResolver();
  }
  (runtime.resolver as ImageCacheResolver).result = result;
}
