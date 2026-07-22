import type { Scene } from '@flighthq/scene';
import type { LoadSceneOptions } from '@flighthq/types';

import { resolveSceneResourcesAndWait } from './resolveSceneResourcesAndWait';
import { createBuiltInSceneResourceResolver, disposeSceneResourceResolver } from './sceneResourceResolver';

// Shared resolve-lifecycle for every `loadSceneFrom*` / `load*` in this package: eagerly resolves each
// scene's pending texture resources through a private-or-supplied resolver, awaiting completion. A
// private resolver (no `options.resolver`) is disposed after the load; a supplied one is left open for
// the caller to keep driving. Multiple scenes share one resolver so refs common to more than one scene
// (e.g. a glTF node pool viewed by several scenes) resolve once via the resolver's in-flight dedup.
export async function resolveScenesWithOptions(
  scenes: readonly Readonly<Scene>[],
  options?: Readonly<LoadSceneOptions>,
): Promise<void> {
  const resolver = options?.resolver ?? createBuiltInSceneResourceResolver();
  try {
    for (const scene of scenes) await resolveSceneResourcesAndWait(scene.root, resolver);
  } finally {
    if (options?.resolver === undefined) disposeSceneResourceResolver(resolver);
  }
}
