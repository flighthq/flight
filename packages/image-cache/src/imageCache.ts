import { getGraphNodeRuntime } from '@flighthq/scenegraph-core';
import type { GraphNode, GraphNodeRuntime, ImageCacheResult } from '@flighthq/types';

export function clearImageCache(source: GraphNode<symbol, object>): void {
  (getGraphNodeRuntime(source) as GraphNodeRuntime<symbol, object>).imageCache = null;
}

export function getImageCache(source: GraphNode<symbol, object>): ImageCacheResult | null {
  return (getGraphNodeRuntime(source) as GraphNodeRuntime<symbol, object>).imageCache;
}

export function setImageCache(source: GraphNode<symbol, object>, result: ImageCacheResult): void {
  (getGraphNodeRuntime(source) as GraphNodeRuntime<symbol, object>).imageCache = result;
}
