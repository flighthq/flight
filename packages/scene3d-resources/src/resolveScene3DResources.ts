import { loadImageResourceFromBytes } from '@flighthq/image/contract';
import { queueResourceLoad } from '@flighthq/loader/contract';
import { emitSignal } from '@flighthq/signals/contract';
import type {
  ImageResource,
  ImageResourceFailure,
  Scene3D,
  ImageResourceReference,
  ResolveScene3DResourcesOptions,
  Scene3DResourceResolver,
  Texture,
} from '@flighthq/types/contract';
import {
  ImageResourceFailureKind,
  ImageTextureBackingKind,
  ResourceResolutionState,
  ImageResourceReferenceKind,
} from '@flighthq/types/contract';
import { Scene3DResourceResolverRuntimeKey } from '@flighthq/types/contract';
import type { Scene3DResourceInFlight, Scene3DResourceResolverWithRuntime } from '@flighthq/types/contract';

import { getScene3DResourceTextures, getScene3DTextureResourceReference } from './getScene3DResourceTextures';

// Resolves one texture's ref to an ImageResource (or null for an expected failure): Embedded bytes
// decode through @flighthq/image; External URIs go through the resolver's fetch seam. Cancellation is
// carried by `signal` (both paths reject on abort). Exported for direct testing of the two ref kinds.
export function resolveOneScene3DResourceTexture(
  resolver: Readonly<Scene3DResourceResolver>,
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
// Mutates `ref.state` and, on success, binds `texture.storage.image`. Emits the availability signals when
// enabled.
export function resolveScene3DResources(
  scene: Readonly<Scene3D>,
  resolver: Scene3DResourceResolver,
  options?: Readonly<ResolveScene3DResourcesOptions>,
): void {
  const runtime = (resolver as Scene3DResourceResolverWithRuntime)[Scene3DResourceResolverRuntimeKey];
  const textures: Texture[] = [];
  getScene3DResourceTextures(scene, resolver.registry, textures);

  const working = new Map<ImageResourceReference, Texture[]>();
  for (let i = 0; i < textures.length; i++) {
    const texture = textures[i];
    const ref = getScene3DTextureResourceReference(scene, texture);
    if (ref == null) continue;
    const image = texture.storage.image;
    if (image?.kind === ImageTextureBackingKind) {
      runtime.resolved.set(ref, image as ImageResource);
      ref.failure = null;
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
  resolver: Scene3DResourceResolver,
  working: ReadonlyMap<ImageResourceReference, readonly Texture[]>,
): void {
  const runtime = (resolver as Scene3DResourceResolverWithRuntime)[Scene3DResourceResolverRuntimeKey];
  for (const [ref, entry] of runtime.inFlight) {
    const subscribers = working.get(ref);
    if (subscribers !== undefined && subscribers.length > 0) {
      entry.subscribers.clear();
      for (let i = 0; i < subscribers.length; i++) entry.subscribers.add(subscribers[i]);
      continue;
    }
    entry.controller.abort();
    runtime.inFlight.delete(ref);
    // A resource with no remaining subscribers reverts to Unresolved so a later pass re-requests it.
    if (ref.state === ResourceResolutionState.Loading) {
      ref.state = ResourceResolutionState.Unresolved;
    }
  }
}

function finishScene3DResourceResolution(
  resolver: Scene3DResourceResolver,
  ref: ImageResourceReference,
  entry: Scene3DResourceInFlight,
  image: ImageResource | null,
): void {
  const runtime = (resolver as Scene3DResourceResolverWithRuntime)[Scene3DResourceResolverRuntimeKey];
  // Ignore a late settle whose entry was already cancelled or replaced by a newer request.
  if (runtime.inFlight.get(ref) !== entry) return;
  runtime.inFlight.delete(ref);
  if (image === null) {
    ref.failure = {
      kind: ImageResourceFailureKind.Unavailable,
      message: 'Image resource resolution returned no image',
      name: null,
    };
    ref.state = ResourceResolutionState.Failed;
    for (const texture of entry.subscribers) emitScene3DResourceEvent(resolver, texture, ref, false);
    return;
  }
  runtime.resolved.set(ref, image);
  ref.failure = null;
  ref.state = ResourceResolutionState.Resolved;
  for (const texture of entry.subscribers) bindResolvedScene3DResource(resolver, texture, ref, image);
}

function failScene3DResourceResolution(
  resolver: Scene3DResourceResolver,
  ref: ImageResourceReference,
  entry: Scene3DResourceInFlight,
  cause: unknown,
): void {
  const runtime = (resolver as Scene3DResourceResolverWithRuntime)[Scene3DResourceResolverRuntimeKey];
  if (runtime.inFlight.get(ref) !== entry) return;
  runtime.inFlight.delete(ref);
  // An abort is a cancel, not a failure: the ref was already reverted to Unresolved when dropped.
  if (entry.controller.signal.aborted) return;
  ref.failure = createImageResourceFailure(cause);
  ref.state = ResourceResolutionState.Failed;
  for (const texture of entry.subscribers) emitScene3DResourceEvent(resolver, texture, ref, false);
}

function bindResolvedScene3DResource(
  resolver: Readonly<Scene3DResourceResolver>,
  texture: Texture,
  ref: ImageResourceReference,
  image: ImageResource,
): void {
  if (texture.storage.image === image) return;
  texture.storage.image = image;
  texture.version = (texture.version + 1) >>> 0;
  emitScene3DResourceEvent(resolver, texture, ref, true);
}

function emitScene3DResourceEvent(
  resolver: Readonly<Scene3DResourceResolver>,
  texture: Texture,
  ref: ImageResourceReference,
  resolved: boolean,
): void {
  const signals = (resolver as Scene3DResourceResolverWithRuntime)[Scene3DResourceResolverRuntimeKey].signals;
  if (signals === null) return;
  const event = { ref, texture };
  emitSignal(resolved ? signals.onResourceResolved : signals.onResourceFailed, event);
}

function requestWorkingResolutions(
  resolver: Scene3DResourceResolver,
  working: ReadonlyMap<ImageResourceReference, readonly Texture[]>,
  options?: Readonly<ResolveScene3DResourcesOptions>,
): void {
  const runtime = (resolver as Scene3DResourceResolverWithRuntime)[Scene3DResourceResolverRuntimeKey];
  for (const [ref, subscribers] of working) {
    const resolved = runtime.resolved.get(ref);
    if (resolved !== undefined) {
      ref.failure = null;
      ref.state = ResourceResolutionState.Resolved;
      for (let i = 0; i < subscribers.length; i++) {
        bindResolvedScene3DResource(resolver, subscribers[i], ref, resolved);
      }
      continue;
    }
    if (runtime.inFlight.has(ref)) continue;
    if (ref.state === ResourceResolutionState.Resolved) ref.state = ResourceResolutionState.Unresolved;
    if (ref.state !== ResourceResolutionState.Unresolved) continue;
    ref.failure = null;
    ref.state = ResourceResolutionState.Loading;
    const controller = new AbortController();
    let priority = 0;
    if (options?.priority !== undefined) {
      priority = Number.NEGATIVE_INFINITY;
      for (let i = 0; i < subscribers.length; i++) {
        priority = Math.max(priority, options.priority(subscribers[i], ref));
      }
    }
    const handle = queueResourceLoad<ImageResource | null>(runtime.loader, {
      load: (loaderSignal) => {
        // Wire the loader's own cancellation (dispose/cancel) into our per-texture controller.
        if (loaderSignal.aborted) controller.abort(loaderSignal.reason);
        else loaderSignal.addEventListener('abort', () => controller.abort(loaderSignal.reason), { once: true });
        return resolveOneScene3DResourceTexture(resolver, ref, controller.signal);
      },
      priority,
    });
    const entry: Scene3DResourceInFlight = {
      controller,
      promise: _resolvedVoid,
      subscribers: new Set(subscribers),
    };
    entry.promise = handle.promise.then(
      (image) => finishScene3DResourceResolution(resolver, ref, entry, image),
      (cause) => failScene3DResourceResolution(resolver, ref, entry, cause),
    );
    runtime.inFlight.set(ref, entry);
  }
}

const _resolvedVoid: Promise<void> = Promise.resolve();

function createImageResourceFailure(cause: unknown): ImageResourceFailure {
  if (cause instanceof Error) {
    return { kind: ImageResourceFailureKind.Error, message: cause.message, name: cause.name };
  }
  return { kind: ImageResourceFailureKind.Error, message: String(cause), name: null };
}
