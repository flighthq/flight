import type { Entity } from './Entity.ts';
import type { RenderCache } from './RenderCache.ts';
import type { RenderCacheAdapterSignals } from './RenderCacheAdapterSignals.ts';
import type { RenderProxyAdapter } from './RenderProxyAdapter.ts';

// An Entity like every other object a create* factory returns, so it can carry runtime state on the
// standard slot instead of growing fields on the public shape. RenderProxyAdapter itself stays a bare
// behavioural contract — a caller may still hand any object with an `adapt` to setRenderProxyAdapter.
export type RenderCacheAdapter = Entity &
  RenderProxyAdapter & {
    // The handle this adapter substitutes for its source during rendering. Null means
    // the source renders normally. A handle with no backend resource composites to nothing.
    cache: RenderCache | null;
    signals: RenderCacheAdapterSignals | null;
  };
