import type { RenderCache } from './RenderCache';
import type { RenderCacheAdapterSignals } from './RenderCacheAdapterSignals';
import type { RenderNodeAdapter } from './RenderNodeAdapter';

export type RenderCacheAdapter = RenderNodeAdapter & {
  // The handle this adapter substitutes for its source during rendering. Null means
  // the source renders normally. A handle with no backend resource composites to nothing.
  cache: RenderCache | null;
  signals: RenderCacheAdapterSignals | null;
};
