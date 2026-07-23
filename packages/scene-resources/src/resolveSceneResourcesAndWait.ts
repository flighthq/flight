import { emitSignal } from '@flighthq/signals';
import type {
  ImageResourceReference,
  LoadSceneResourcesOptions,
  SceneNode,
  SceneResourceResolver,
  Texture,
} from '@flighthq/types';
import { ResourceResolutionState } from '@flighthq/types';

import { getSceneResourceTextures } from './getSceneResourceTextures';
import { resolveSceneResources } from './resolveSceneResources';
import { SceneResourceResolverRuntimeKey } from './sceneResourceResolverRuntime';
import type { SceneResourceResolverWithRuntime } from './sceneResourceResolverRuntime';

// Eager/deterministic asynchronous load: runs one resolveSceneResources pass, then awaits every in-flight
// load it started so the scene is fully resolved (or each ref settled to Failed) on return. The
// deterministic sibling of the fire-and-forget resolveSceneResources — for loads, tests, and capture
// that need the finished scene rather than progressive availability.
export async function loadSceneResources(
  scene: Readonly<SceneNode>,
  resolver: SceneResourceResolver,
  options?: Readonly<LoadSceneResourcesOptions>,
): Promise<void> {
  const refs = getSelectedSceneResourceReferences(scene, resolver, options);
  resolveSceneResources(scene, resolver, options);
  const runtime = (resolver as SceneResourceResolverWithRuntime)[SceneResourceResolverRuntimeKey];
  const total = refs.size;
  let loaded = 0;
  const pending: Promise<void>[] = [];
  const progress = options?.progress;
  for (const ref of refs) {
    if (ref.state === ResourceResolutionState.Resolved || ref.state === ResourceResolutionState.Failed) {
      loaded++;
      continue;
    }
    const entry = runtime.inFlight.get(ref);
    if (entry === undefined) continue;
    pending.push(
      entry.promise.then(() => {
        loaded++;
        if (progress !== undefined) emitSignal(progress, { loaded, total });
      }),
    );
  }
  if (progress !== undefined) emitSignal(progress, { loaded, total });
  await Promise.allSettled(pending);
}

// Waits for the loads that are pending at call time without revealing or exposing the resolver's
// private request records. New work queued after the snapshot belongs to the caller's next bracket.
export async function waitForSceneResourceResolver(resolver: Readonly<SceneResourceResolver>): Promise<void> {
  const runtime = (resolver as SceneResourceResolverWithRuntime)[SceneResourceResolverRuntimeKey];
  const promises: Promise<void>[] = [];
  for (const entry of runtime.inFlight.values()) promises.push(entry.promise);
  await Promise.allSettled(promises);
}

function getSelectedSceneResourceReferences(
  scene: Readonly<SceneNode>,
  resolver: Readonly<SceneResourceResolver>,
  options?: Readonly<LoadSceneResourcesOptions>,
): Set<ImageResourceReference> {
  const textures: Texture[] = [];
  const refs = new Set<ImageResourceReference>();
  getSceneResourceTextures(scene, resolver.registry, textures);
  for (const texture of textures) {
    const ref = texture.resource;
    if (ref !== null && ref !== undefined && (options?.select === undefined || options.select(texture, ref))) {
      refs.add(ref);
    }
  }
  return refs;
}
