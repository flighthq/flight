import type { RenderCacheAdapterSignals } from './RenderCacheAdapterSignals';
import type { RenderNodeAdapter } from './RenderNodeAdapter';

export type RenderCacheAdapter = RenderNodeAdapter & {
  signals: RenderCacheAdapterSignals | null;
};
