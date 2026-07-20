import type { Scene } from '@flighthq/scene';

import { resolveSceneResourcesAndWait } from './resolveSceneResourcesAndWait';
import type { SceneResourceResolver } from './sceneResourceResolver';
import { createSceneResourceResolver, disposeSceneResourceResolver } from './sceneResourceResolver';

export interface LoadSceneOptions {
  // Reuse a caller-owned resolver (shared registry/fetch/loader); omit it and a private resolver is
  // created for this load and disposed when the scene is fully resolved.
  resolver?: SceneResourceResolver;
}

// Shared resolve-lifecycle for every `loadSceneFrom*` / `load*` in this package: eagerly resolves each
// scene's pending texture resources through a private-or-supplied resolver, awaiting completion. A
// private resolver (no `options.resolver`) is disposed after the load; a supplied one is left open for
// the caller to keep driving. Multiple scenes share one resolver so refs common to more than one scene
// (e.g. a glTF node pool viewed by several scenes) resolve once via the resolver's in-flight dedup.
export async function resolveScenesWithOptions(
  scenes: readonly Readonly<Scene>[],
  options?: Readonly<LoadSceneOptions>,
): Promise<void> {
  const resolver = options?.resolver ?? createSceneResourceResolver();
  try {
    for (const scene of scenes) await resolveSceneResourcesAndWait(scene.root, resolver);
  } finally {
    if (options?.resolver === undefined) disposeSceneResourceResolver(resolver);
  }
}
