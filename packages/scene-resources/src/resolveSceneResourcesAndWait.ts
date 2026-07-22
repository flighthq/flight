import type { ResolveSceneResourcesOptions, SceneNode, SceneResourceResolver } from '@flighthq/types';

import { resolveSceneResources } from './resolveSceneResources';
import { SceneResourceResolverRuntimeKey } from './sceneResourceResolverRuntime';
import type { SceneResourceResolverWithRuntime } from './sceneResourceResolverRuntime';

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
  await waitForSceneResourceResolver(resolver);
}

// Waits for the loads that are pending at call time without revealing or exposing the resolver's
// private request records. New work queued after the snapshot belongs to the caller's next bracket.
export async function waitForSceneResourceResolver(resolver: Readonly<SceneResourceResolver>): Promise<void> {
  const runtime = (resolver as SceneResourceResolverWithRuntime)[SceneResourceResolverRuntimeKey];
  const promises: Promise<void>[] = [];
  for (const entry of runtime.inFlight.values()) promises.push(entry.promise);
  await Promise.allSettled(promises);
}
