import { createEntity } from '@flighthq/entity';
import { cancelResourceLoad, createResourceLoader, disposeResourceLoader, startResourceLoad } from '@flighthq/loader';
import type { SceneResourceResolver, SceneResourceResolverOptions } from '@flighthq/types';

import { fetchWebImageResource } from './imageResourceFetch';
import {
  createSceneMaterialTextureRegistry,
  registerBuiltInSceneMaterialTextures,
} from './sceneMaterialTextureRegistry';
import { SceneResourceResolverRuntimeKey } from './sceneResourceResolverRuntime';
import type { SceneResourceResolverWithRuntime } from './sceneResourceResolverRuntime';

// Explicit preconfigured assembly for the common Standard PBR + Unlit path. The primitive constructor
// above stays empty so importing/creating it cannot silently pull material families into a custom lane.
export function createBuiltInSceneResourceResolver(
  options?: Readonly<SceneResourceResolverOptions>,
): SceneResourceResolver {
  const resolver = createSceneResourceResolver(options);
  registerBuiltInSceneMaterialTextures(resolver.registry);
  return resolver;
}

export function createSceneResourceResolver(options?: Readonly<SceneResourceResolverOptions>): SceneResourceResolver {
  // Streaming so passes can queue after the loader has started; dedupe off since each pending texture
  // is queued once under a unique auto-assigned key, and disabling it avoids an unbounded dedupe map.
  const loader = createResourceLoader({ dedupe: false, maxConcurrent: options?.maxConcurrent, streaming: true });
  startResourceLoad(loader);

  return createEntity({
    fetch: options?.fetch ?? fetchWebImageResource,
    registry: options?.registry ?? createSceneMaterialTextureRegistry(),
    [SceneResourceResolverRuntimeKey]: {
      inFlight: new Map(),
      loader,
      resolved: new Map(),
      signals: null,
    },
  });
}

// Releases the resolver: cancels and disposes the loader, aborts every in-flight controller, and
// clears the in-flight map. GC-managed teardown (no GPU/native resource), so dispose, not destroy.
export function disposeSceneResourceResolver(resolver: SceneResourceResolver): void {
  const runtime = (resolver as SceneResourceResolverWithRuntime)[SceneResourceResolverRuntimeKey];
  cancelResourceLoad(runtime.loader);
  disposeResourceLoader(runtime.loader);
  for (const entry of runtime.inFlight.values()) {
    entry.controller.abort();
  }
  runtime.inFlight.clear();
  runtime.resolved.clear();
}
