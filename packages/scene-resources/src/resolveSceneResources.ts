import { loadImageResourceFromBytes } from '@flighthq/image';
import { queueResourceLoad } from '@flighthq/loader';
import { emitSignal } from '@flighthq/signals';
import type { ImageResource, SceneNode, ImageResourceReference, Texture } from '@flighthq/types';
import { ResourceResolutionState, ImageResourceReferenceKind } from '@flighthq/types';

import { getSceneResourceTextures } from './getSceneResourceTextures';
import type { SceneResourceInFlight, SceneResourceResolver } from './sceneResourceResolver';

// Policy inputs for one resolution pass. `select` chooses the working set (omit it to resolve every
// pending texture — the "all" policy; supply a predicate for visible-only/prioritized streaming).
// `priority` orders the loader queue (higher first) so nearer/visible textures resolve before others.
export interface ResolveSceneResourcesOptions {
  priority?: (texture: Readonly<Texture>, ref: Readonly<ImageResourceReference>) => number;
  select?: (texture: Readonly<Texture>, ref: Readonly<ImageResourceReference>) => boolean;
}

// Resolves one texture's ref to an ImageResource (or null for an expected failure): Embedded bytes
// decode through @flighthq/image; External URIs go through the resolver's fetch seam. Cancellation is
// carried by `signal` (both paths reject on abort). Exported for direct testing of the two ref kinds.
export function resolveOneSceneResourceTexture(
  resolver: Readonly<SceneResourceResolver>,
  ref: Readonly<ImageResourceReference>,
  signal: AbortSignal,
): Promise<ImageResource | null> {
  if (ref.kind === ImageResourceReferenceKind.Embedded) {
    return loadImageResourceFromBytes(ref.bytes, ref.mimeType ?? undefined, signal);
  }
  return resolver.fetch(ref, signal);
}

// Advances resolution of `scene`'s pending texture resources under the given policy. Synchronous and
// fire-and-forget: it starts/cancels loads to match the current working set and returns immediately,
// so the caller re-invokes it as that set changes — that re-invocation IS the streaming/visibility
// driver. Each pass:
//   1. discovers the pending textures,
//   2. narrows them to the working set (all pending, or those `select` accepts),
//   3. cancels any in-flight load no longer in the working set (reverting its ref to Unresolved), and
//   4. requests each working-set texture not already in flight.
// Mutates `ref.state` and, on success, binds `texture.image`. Emits the availability signals when
// enabled.
export function resolveSceneResources(
  scene: Readonly<SceneNode>,
  resolver: SceneResourceResolver,
  options?: Readonly<ResolveSceneResourcesOptions>,
): void {
  const pending: Texture[] = [];
  getSceneResourceTextures(scene, resolver.registry, pending);

  const working = new Set<Texture>();
  for (let i = 0; i < pending.length; i++) {
    const texture = pending[i];
    const ref = texture.resource;
    if (ref == null) continue;
    if (options?.select === undefined || options.select(texture, ref)) working.add(texture);
  }

  cancelDroppedResolutions(resolver, working);
  requestWorkingResolutions(resolver, working, options);
}

function cancelDroppedResolutions(resolver: SceneResourceResolver, working: ReadonlySet<Texture>): void {
  for (const [texture, entry] of resolver.inFlight) {
    if (working.has(texture)) continue;
    entry.controller.abort();
    resolver.inFlight.delete(texture);
    const ref = texture.resource;
    // A dropped-mid-load ref reverts to Unresolved so a later pass re-requests it from scratch.
    if (ref != null && ref.state === ResourceResolutionState.Loading) {
      ref.state = ResourceResolutionState.Unresolved;
    }
  }
}

function finishSceneResourceResolution(
  resolver: SceneResourceResolver,
  texture: Texture,
  ref: ImageResourceReference,
  entry: SceneResourceInFlight,
  image: ImageResource | null,
): void {
  // Ignore a late settle whose entry was already cancelled or replaced by a newer request.
  if (resolver.inFlight.get(texture) !== entry) return;
  resolver.inFlight.delete(texture);
  if (image === null) {
    ref.state = ResourceResolutionState.Failed;
    emitSceneResourceEvent(resolver, texture, ref, false);
    return;
  }
  texture.image = image;
  ref.state = ResourceResolutionState.Resolved;
  emitSceneResourceEvent(resolver, texture, ref, true);
}

function failSceneResourceResolution(
  resolver: SceneResourceResolver,
  texture: Texture,
  ref: ImageResourceReference,
  entry: SceneResourceInFlight,
): void {
  if (resolver.inFlight.get(texture) !== entry) return;
  resolver.inFlight.delete(texture);
  // An abort is a cancel, not a failure: the ref was already reverted to Unresolved when dropped.
  if (entry.controller.signal.aborted) return;
  ref.state = ResourceResolutionState.Failed;
  emitSceneResourceEvent(resolver, texture, ref, false);
}

function emitSceneResourceEvent(
  resolver: Readonly<SceneResourceResolver>,
  texture: Texture,
  ref: ImageResourceReference,
  resolved: boolean,
): void {
  const signals = resolver.signals;
  if (signals === null) return;
  const event = { ref, texture };
  emitSignal(resolved ? signals.onResourceResolved : signals.onResourceFailed, event);
}

function requestWorkingResolutions(
  resolver: SceneResourceResolver,
  working: ReadonlySet<Texture>,
  options?: Readonly<ResolveSceneResourcesOptions>,
): void {
  for (const texture of working) {
    const ref = texture.resource;
    if (ref == null || resolver.inFlight.has(texture) || ref.state !== ResourceResolutionState.Unresolved) {
      continue;
    }
    ref.state = ResourceResolutionState.Loading;
    const controller = new AbortController();
    const priority = options?.priority?.(texture, ref) ?? 0;
    const handle = queueResourceLoad<ImageResource | null>(resolver.loader, {
      load: (loaderSignal) => {
        // Wire the loader's own cancellation (dispose/cancel) into our per-texture controller.
        if (loaderSignal.aborted) controller.abort(loaderSignal.reason);
        else loaderSignal.addEventListener('abort', () => controller.abort(loaderSignal.reason), { once: true });
        return resolveOneSceneResourceTexture(resolver, ref, controller.signal);
      },
      priority,
    });
    const entry: SceneResourceInFlight = { controller, key: handle.key, promise: _resolvedVoid };
    entry.promise = handle.promise.then(
      (image) => finishSceneResourceResolution(resolver, texture, ref, entry, image),
      () => failSceneResourceResolution(resolver, texture, ref, entry),
    );
    resolver.inFlight.set(texture, entry);
  }
}

const _resolvedVoid: Promise<void> = Promise.resolve();
