import { emitSignal } from '@flighthq/signals/contract';
import type {
  ImageResourceReference,
  LoadScene3DResourcesOptions,
  Scene3D,
  Scene3DResourceResolverWithRuntime,
} from '@flighthq/types/contract';
import { ResourceResolutionState } from '@flighthq/types/contract';
import { Scene3DResourceResolverRuntimeKey } from '@flighthq/types/contract';

import { updateScene3DResourceStreaming } from './resolveScene3DResources';

// Eager/deterministic asynchronous load: reconciles the selected working set, starts its acquisitions,
// then awaits every in-flight load it started so each reference has settled to Resolved or Failed on
// return. Progressive callers use updateScene3DResourceStreaming instead.
export async function loadScene3DResources(
  scene: Readonly<Scene3D>,
  resolver: Scene3DResourceResolverWithRuntime,
  options?: Readonly<LoadScene3DResourcesOptions>,
): Promise<void> {
  const resources = updateScene3DResourceStreaming(scene, resolver, options);
  const refs = new Set<ImageResourceReference>();
  for (let i = 0; i < resources.resolved.length; i++) refs.add(resources.resolved[i].ref);
  for (let i = 0; i < resources.unresolved.length; i++) refs.add(resources.unresolved[i].ref);
  const runtime = resolver[Scene3DResourceResolverRuntimeKey];
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
export async function waitForScene3DResourceResolver(
  resolver: Readonly<Scene3DResourceResolverWithRuntime>,
): Promise<void> {
  const runtime = resolver[Scene3DResourceResolverRuntimeKey];
  const promises: Promise<void>[] = [];
  for (const entry of runtime.inFlight.values()) promises.push(entry.promise);
  await Promise.allSettled(promises);
}
