import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import {
  cancelResourceLoad,
  createResourceLoader,
  disposeResourceLoader,
  startResourceLoad,
} from '@flighthq/loader/contract';
import type { HasGraphicsImage, Scene3DResourceResolverOptions, EntityConstruction } from '@flighthq/types/contract';
import { Scene3DResourceResolverRuntimeKey } from '@flighthq/types/contract';
import type { Scene3DResourceResolverWithRuntime } from '@flighthq/types/contract';

import { createWebImageResourceFetch } from './imageResourceFetch';
import {
  createScene3DMaterialTextureRegistry,
  registerExtendedPbrScene3DMaterialTextures,
  registerStandardPbrScene3DMaterialTextures,
  registerUnlitScene3DMaterialTextures,
} from './sceneMaterialTextureRegistry';

// Explicit preconfigured assembly for the common Standard PBR + Unlit path. The primitive constructor
// above stays empty so importing/creating it cannot silently pull material families into a custom lane.
export function createBuiltInScene3DResourceResolver(
  host: Readonly<HasGraphicsImage>,
  options?: Readonly<Scene3DResourceResolverOptions>,
): Scene3DResourceResolverWithRuntime {
  const resolver = createScene3DResourceResolver(host, options);
  registerStandardPbrScene3DMaterialTextures(resolver.registry);
  registerUnlitScene3DMaterialTextures(resolver.registry);
  registerExtendedPbrScene3DMaterialTextures(resolver.registry);
  return resolver;
}

export function createScene3DResourceResolver(
  host: Readonly<HasGraphicsImage>,
  options?: Readonly<Scene3DResourceResolverOptions>,
): Scene3DResourceResolverWithRuntime {
  const out = allocateEntity<Scene3DResourceResolverWithRuntime>();
  initializeScene3DResourceResolver(out, host, options);
  return finishEntity(out);
}

// Releases the resolver: cancels and disposes the loader, aborts every in-flight controller, and
// clears the in-flight map. GC-managed teardown (no GPU/native resource), so dispose, not destroy.
export function disposeScene3DResourceResolver(resolver: Scene3DResourceResolverWithRuntime): void {
  const runtime = resolver[Scene3DResourceResolverRuntimeKey];
  cancelResourceLoad(runtime.loader);
  disposeResourceLoader(runtime.loader);
  for (const entry of runtime.inFlight.values()) {
    entry.controller.abort();
  }
  runtime.inFlight.clear();
  runtime.resolved.clear();
}

export function initializeScene3DResourceResolver(
  out: EntityConstruction<Scene3DResourceResolverWithRuntime>,
  host: Readonly<HasGraphicsImage>,
  options?: Readonly<Scene3DResourceResolverOptions>,
): void {
  const loader = createResourceLoader({ dedupe: false, maxConcurrent: options?.maxConcurrent, streaming: true });
  startResourceLoad(loader);
  out.fetch = options?.fetch ?? createWebImageResourceFetch(host);
  out.registry = options?.registry ?? createScene3DMaterialTextureRegistry();
  out[Scene3DResourceResolverRuntimeKey] = {
    inFlight: new Map(),
    loader,
    resolved: new Map(),
    signals: null,
  };
}
