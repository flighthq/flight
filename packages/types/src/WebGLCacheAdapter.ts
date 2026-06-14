import type { RenderCacheAdapter } from './RenderCacheAdapter';
import type { WebGLCache } from './WebGLCache';

export type WebGLCacheAdapter = RenderCacheAdapter & {
  primitive: WebGLCache | null;
};
