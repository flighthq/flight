import { emitSignal } from '@flighthq/signals/contract';
import type {
  ImageResourceReference,
  LoadScene3DResourcesOptions,
  Node3D,
  Scene3DResourceResolver,
  Texture,
} from '@flighthq/types/contract';
import { ResourceResolutionState } from '@flighthq/types/contract';
import { Scene3DResourceResolverRuntimeKey } from '@flighthq/types/contract';
import type { Scene3DResourceResolverWithRuntime } from '@flighthq/types/contract';

import { getScene3DResourceTextures } from './getScene3DResourceTextures';
import { resolveScene3DResources } from './resolveScene3DResources';

// Eager/deterministic asynchronous load: runs one resolveScene3DResources pass, then awaits every in-flight
// load it started so the scene is fully resolved (or each ref settled to Failed) on return. The
// deterministic sibling of the fire-and-forget resolveScene3DResources — for loads, tests, and capture
// that need the finished scene rather than progressive availability.
export async function loadScene3DResources(
  scene: Readonly<Node3D>,
  resolver: Scene3DResourceResolver,
  options?: Readonly<LoadScene3DResourcesOptions>,
): Promise<void> {
  const refs = getSelectedScene3DResourceReferences(scene, resolver, options);
  resolveScene3DResources(scene, resolver, options);
  const runtime = (resolver as Scene3DResourceResolverWithRuntime)[Scene3DResourceResolverRuntimeKey];
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
export async function waitForScene3DResourceResolver(resolver: Readonly<Scene3DResourceResolver>): Promise<void> {
  const runtime = (resolver as Scene3DResourceResolverWithRuntime)[Scene3DResourceResolverRuntimeKey];
  const promises: Promise<void>[] = [];
  for (const entry of runtime.inFlight.values()) promises.push(entry.promise);
  await Promise.allSettled(promises);
}

function getSelectedScene3DResourceReferences(
  scene: Readonly<Node3D>,
  resolver: Readonly<Scene3DResourceResolver>,
  options?: Readonly<LoadScene3DResourcesOptions>,
): Set<ImageResourceReference> {
  const textures: Texture[] = [];
  const refs = new Set<ImageResourceReference>();
  getScene3DResourceTextures(scene, resolver.registry, textures);
  for (const texture of textures) {
    const ref = texture.resource;
    if (ref !== null && ref !== undefined && (options?.select === undefined || options.select(texture, ref))) {
      refs.add(ref);
    }
  }
  return refs;
}
