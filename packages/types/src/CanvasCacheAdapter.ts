import type { CanvasCache } from './CanvasCache';
import type { RenderCacheAdapter } from './RenderCacheAdapter';

export type CanvasCacheAdapter = RenderCacheAdapter & {
  primitive: CanvasCache | null;
};
