import { getSceneNodeRuntime } from '@flighthq/scene';
import type { ImageCacheResult, SceneNode, SceneNodeRuntime } from '@flighthq/types';

import type { ImageCacheSceneNodeResolver } from './imageCacheSceneNodeResolver';
import { createImageCacheSceneNodeResolver, isImageCacheSceneNodeResolver } from './imageCacheSceneNodeResolver';

export function clearImageCache(source: SceneNode<symbol, object>): void {
  (getSceneNodeRuntime(source) as SceneNodeRuntime<symbol, object>).resolver = null;
}

export function getImageCache(source: SceneNode<symbol, object>): ImageCacheResult | null {
  const resolver = (getSceneNodeRuntime(source) as SceneNodeRuntime<symbol, object>).resolver;
  return isImageCacheSceneNodeResolver(resolver) ? resolver.result : null;
}

export function setImageCache(source: SceneNode<symbol, object>, result: ImageCacheResult): void {
  const runtime = getSceneNodeRuntime(source) as SceneNodeRuntime<symbol, object>;
  if (!isImageCacheSceneNodeResolver(runtime.resolver)) {
    runtime.resolver = createImageCacheSceneNodeResolver();
  }
  (runtime.resolver as ImageCacheSceneNodeResolver).result = result;
}
