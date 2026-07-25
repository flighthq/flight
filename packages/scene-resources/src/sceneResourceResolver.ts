import { createEntity } from '@flighthq/entity';
import { cancelResourceLoad, createResourceLoader, disposeResourceLoader, startResourceLoad } from '@flighthq/loader';
import type { Scene3DResourceResolver, Scene3DResourceResolverOptions } from '@flighthq/types';
import { Scene3DResourceResolverRuntimeKey } from '@flighthq/types';
import type { Scene3DResourceResolverWithRuntime } from '@flighthq/types';

import { fetchWebImageResource } from './imageResourceFetch';
import {
  createScene3DMaterialTextureRegistry,
  registerBuiltInScene3DMaterialTextures,
} from './sceneMaterialTextureRegistry';

// Explicit preconfigured assembly for the common Standard PBR + Unlit path. The primitive constructor
// above stays empty so importing/creating it cannot silently pull material families into a custom lane.
export function createBuiltInScene3DResourceResolver(
  options?: Readonly<Scene3DResourceResolverOptions>,
): Scene3DResourceResolver {
  const resolver = createScene3DResourceResolver(options);
  registerBuiltInScene3DMaterialTextures(resolver.registry);
  return resolver;
}

export function createScene3DResourceResolver(options?: Readonly<Scene3DResourceResolverOptions>): Scene3DResourceResolver {
  // Streaming so passes can queue after the loader has started; dedupe off since each pending texture
  // is queued once under a unique auto-assigned key, and disabling it avoids an unbounded dedupe map.
  const loader = createResourceLoader({ dedupe: false, maxConcurrent: options?.maxConcurrent, streaming: true });
  startResourceLoad(loader);

  return createEntity({
    fetch: options?.fetch ?? fetchWebImageResource,
    registry: options?.registry ?? createScene3DMaterialTextureRegistry(),
    [Scene3DResourceResolverRuntimeKey]: {
      inFlight: new Map(),
      loader,
      resolved: new Map(),
      signals: null,
    },
  });
}

// Releases the resolver: cancels and disposes the loader, aborts every in-flight controller, and
// clears the in-flight map. GC-managed teardown (no GPU/native resource), so dispose, not destroy.
export function disposeScene3DResourceResolver(resolver: Scene3DResourceResolver): void {
  const runtime = (resolver as Scene3DResourceResolverWithRuntime)[Scene3DResourceResolverRuntimeKey];
  cancelResourceLoad(runtime.loader);
  disposeResourceLoader(runtime.loader);
  for (const entry of runtime.inFlight.values()) {
    entry.controller.abort();
  }
  runtime.inFlight.clear();
  runtime.resolved.clear();
}
