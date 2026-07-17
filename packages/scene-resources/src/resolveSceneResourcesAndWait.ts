import type { SceneNode } from '@flighthq/types';

import type { ResolveSceneResourcesOptions } from './resolveSceneResources';
import { resolveSceneResources } from './resolveSceneResources';
import type { SceneResourceResolver } from './sceneResourceResolver';

// Eager/deterministic resolution: runs one resolveSceneResources pass, then awaits every in-flight
// load it started so the scene is fully resolved (or each ref settled to Failed) on return. The
// deterministic sibling of the fire-and-forget resolveSceneResources — for loads, tests, and capture
// that need the finished scene rather than progressive availability.
export async function resolveSceneResourcesAndWait(
  scene: Readonly<SceneNode>,
  resolver: SceneResourceResolver,
  options?: Readonly<ResolveSceneResourcesOptions>,
): Promise<void> {
  resolveSceneResources(scene, resolver, options);
  const promises: Promise<void>[] = [];
  for (const entry of resolver.inFlight.values()) promises.push(entry.promise);
  await Promise.allSettled(promises);
}
