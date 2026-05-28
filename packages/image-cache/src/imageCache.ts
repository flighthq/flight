import { getGraphNodeRuntime } from '@flighthq/scenegraph-core';
import type { GraphNode, GraphNodeRuntime, ImageCacheResult } from '@flighthq/types';

export function getImageCache(source: GraphNode<symbol, object>): ImageCacheResult | null {
  return (getGraphNodeRuntime(source) as GraphNodeRuntime<symbol, object>).imageCache;
}

export function clearImageCache(source: GraphNode<symbol, object>): void {
  (getGraphNodeRuntime(source) as GraphNodeRuntime<symbol, object>).imageCache = null;
}
