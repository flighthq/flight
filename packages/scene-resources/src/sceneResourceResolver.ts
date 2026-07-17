import { cancelResourceLoad, createResourceLoader, disposeResourceLoader, startResourceLoad } from '@flighthq/loader';
import type { ResourceLoader, Texture } from '@flighthq/types';

import type { SceneMaterialTextureRegistry } from './sceneMaterialTextureRegistry';
import {
  createSceneMaterialTextureRegistry,
  registerBuiltInSceneMaterialTextures,
} from './sceneMaterialTextureRegistry';
import type { SceneResourceFetch } from './sceneResourceFetch';
import { createWebSceneResourceFetch } from './sceneResourceFetch';
import type { SceneResourceSignals } from './sceneResourceSignals';

// One texture's in-flight resolution: the AbortController that cancels it, the loader item `key`, and
// the settle `promise` (resolves once the finish handler has bound the image or recorded the outcome,
// so resolveSceneResourcesAndWait can await a fully-settled scene). Internal to the package.
export interface SceneResourceInFlight {
  controller: AbortController;
  key: string;
  promise: Promise<void>;
}

// The resolver object: the composed state a resolution pass reads and advances. `fetch` is the
// external-URI seam, `inFlight` tracks per-Texture pending loads, `loader` bounds concurrency,
// `registry` maps material kinds to their texture slots, and `signals` is the opt-in availability
// group (null until enableSceneResourceSignals). Holds no scene reference — a pass takes the scene.
export interface SceneResourceResolver {
  fetch: SceneResourceFetch;
  inFlight: Map<Texture, SceneResourceInFlight>;
  loader: ResourceLoader;
  registry: SceneMaterialTextureRegistry;
  signals: SceneResourceSignals | null;
}

export interface SceneResourceResolverOptions {
  fetch?: SceneResourceFetch;
  maxConcurrent?: number;
  // A caller-supplied registry replaces the built-in default wholesale; omit it to get a fresh
  // registry pre-populated with the built-in surface-material listers.
  registry?: SceneMaterialTextureRegistry;
}

export function createSceneResourceResolver(options?: Readonly<SceneResourceResolverOptions>): SceneResourceResolver {
  // Streaming so passes can queue after the loader has started; dedupe off since each pending texture
  // is queued once under a unique auto-assigned key, and disabling it avoids an unbounded dedupe map.
  const loader = createResourceLoader({ dedupe: false, maxConcurrent: options?.maxConcurrent, streaming: true });
  startResourceLoad(loader);

  let registry = options?.registry;
  if (registry === undefined) {
    registry = createSceneMaterialTextureRegistry();
    registerBuiltInSceneMaterialTextures(registry);
  }

  return {
    fetch: options?.fetch ?? createWebSceneResourceFetch(),
    inFlight: new Map(),
    loader,
    registry,
    signals: null,
  };
}

// Releases the resolver: cancels and disposes the loader, aborts every in-flight controller, and
// clears the in-flight map. GC-managed teardown (no GPU/native resource), so dispose, not destroy.
export function disposeSceneResourceResolver(resolver: SceneResourceResolver): void {
  cancelResourceLoad(resolver.loader);
  disposeResourceLoader(resolver.loader);
  for (const entry of resolver.inFlight.values()) {
    entry.controller.abort();
  }
  resolver.inFlight.clear();
}
