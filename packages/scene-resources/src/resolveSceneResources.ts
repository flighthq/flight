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

// Advances resolution of `scene`'s texture resources under the given policy. Synchronous and
// fire-and-forget: it starts/cancels loads to match the current working set and returns immediately,
// so the caller re-invokes it as that set changes — that re-invocation IS the streaming/visibility
// driver. Each pass:
//   1. discovers textures and groups them by shared ImageResourceReference identity,
//   2. narrows their subscribers to the working set (all, or those `select` accepts),
//   3. cancels an in-flight load only when its final subscriber leaves, and
//   4. requests each unresolved identity once, fanning the result out to its Texture subscribers.
// Mutates `ref.state` and, on success, binds `texture.image`. Emits the availability signals when
// enabled.
export function resolveSceneResources(
  scene: Readonly<SceneNode>,
  resolver: SceneResourceResolver,
  options?: Readonly<ResolveSceneResourcesOptions>,
): void {
  const textures: Texture[] = [];
  getSceneResourceTextures(scene, resolver.registry, textures);

  const working = new Map<ImageResourceReference, Texture[]>();
  for (let i = 0; i < textures.length; i++) {
    const texture = textures[i];
    const ref = texture.resource;
    if (ref == null) continue;
    if (texture.image !== null) {
      resolver.resolved.set(ref, texture.image);
      ref.state = ResourceResolutionState.Resolved;
    }
    if (options?.select !== undefined && !options.select(texture, ref)) continue;
    let subscribers = working.get(ref);
    if (subscribers === undefined) {
      subscribers = [];
      working.set(ref, subscribers);
    }
    subscribers.push(texture);
  }

  cancelDroppedResolutions(resolver, working);
  requestWorkingResolutions(resolver, working, options);
}

function cancelDroppedResolutions(
  resolver: SceneResourceResolver,
  working: ReadonlyMap<ImageResourceReference, readonly Texture[]>,
): void {
  for (const [ref, entry] of resolver.inFlight) {
    const subscribers = working.get(ref);
    if (subscribers !== undefined && subscribers.length > 0) {
      entry.subscribers.clear();
      for (let i = 0; i < subscribers.length; i++) entry.subscribers.add(subscribers[i]);
      continue;
    }
    entry.controller.abort();
    resolver.inFlight.delete(ref);
    // A resource with no remaining subscribers reverts to Unresolved so a later pass re-requests it.
    if (ref.state === ResourceResolutionState.Loading) {
      ref.state = ResourceResolutionState.Unresolved;
    }
  }
}

function finishSceneResourceResolution(
  resolver: SceneResourceResolver,
  ref: ImageResourceReference,
  entry: SceneResourceInFlight,
  image: ImageResource | null,
): void {
  // Ignore a late settle whose entry was already cancelled or replaced by a newer request.
  if (resolver.inFlight.get(ref) !== entry) return;
  resolver.inFlight.delete(ref);
  if (image === null) {
    ref.state = ResourceResolutionState.Failed;
    for (const texture of entry.subscribers) emitSceneResourceEvent(resolver, texture, ref, false);
    return;
  }
  resolver.resolved.set(ref, image);
  ref.state = ResourceResolutionState.Resolved;
  for (const texture of entry.subscribers) bindResolvedSceneResource(resolver, texture, ref, image);
}

function failSceneResourceResolution(
  resolver: SceneResourceResolver,
  ref: ImageResourceReference,
  entry: SceneResourceInFlight,
): void {
  if (resolver.inFlight.get(ref) !== entry) return;
  resolver.inFlight.delete(ref);
  // An abort is a cancel, not a failure: the ref was already reverted to Unresolved when dropped.
  if (entry.controller.signal.aborted) return;
  ref.state = ResourceResolutionState.Failed;
  for (const texture of entry.subscribers) emitSceneResourceEvent(resolver, texture, ref, false);
}

function bindResolvedSceneResource(
  resolver: Readonly<SceneResourceResolver>,
  texture: Texture,
  ref: ImageResourceReference,
  image: ImageResource,
): void {
  if (texture.image === image) return;
  texture.image = image;
  emitSceneResourceEvent(resolver, texture, ref, true);
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
  working: ReadonlyMap<ImageResourceReference, readonly Texture[]>,
  options?: Readonly<ResolveSceneResourcesOptions>,
): void {
  for (const [ref, subscribers] of working) {
    const resolved = resolver.resolved.get(ref);
    if (resolved !== undefined) {
      ref.state = ResourceResolutionState.Resolved;
      for (let i = 0; i < subscribers.length; i++) {
        bindResolvedSceneResource(resolver, subscribers[i], ref, resolved);
      }
      continue;
    }
    if (resolver.inFlight.has(ref)) continue;
    if (ref.state === ResourceResolutionState.Resolved) ref.state = ResourceResolutionState.Unresolved;
    if (ref.state !== ResourceResolutionState.Unresolved) continue;
    ref.state = ResourceResolutionState.Loading;
    const controller = new AbortController();
    let priority = 0;
    if (options?.priority !== undefined) {
      priority = Number.NEGATIVE_INFINITY;
      for (let i = 0; i < subscribers.length; i++) {
        priority = Math.max(priority, options.priority(subscribers[i], ref));
      }
    }
    const handle = queueResourceLoad<ImageResource | null>(resolver.loader, {
      load: (loaderSignal) => {
        // Wire the loader's own cancellation (dispose/cancel) into our per-texture controller.
        if (loaderSignal.aborted) controller.abort(loaderSignal.reason);
        else loaderSignal.addEventListener('abort', () => controller.abort(loaderSignal.reason), { once: true });
        return resolveOneSceneResourceTexture(resolver, ref, controller.signal);
      },
      priority,
    });
    const entry: SceneResourceInFlight = {
      controller,
      key: handle.key,
      promise: _resolvedVoid,
      subscribers: new Set(subscribers),
    };
    entry.promise = handle.promise.then(
      (image) => finishSceneResourceResolution(resolver, ref, entry, image),
      () => failSceneResourceResolution(resolver, ref, entry),
    );
    resolver.inFlight.set(ref, entry);
  }
}

const _resolvedVoid: Promise<void> = Promise.resolve();
