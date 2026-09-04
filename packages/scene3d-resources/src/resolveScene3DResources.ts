import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createImageResourceFailure, resolveImageResourceReference } from '@flighthq/image/contract';
import { queueResourceLoad } from '@flighthq/loader/contract';
import { emitSignal } from '@flighthq/signals/contract';
import type {
  EntityConstruction,
  ImageResourceFailure,
  ImageResourceReference,
  ResolveScene3DResourcesOptions,
  Scene3D,
  Scene3DResourceResolver,
  Scene3DResourceWorkingSet,
  Scene3DResources,
  Texture,
  TextureSource,
  UpdateScene3DResourceStreamingOptions,
} from '@flighthq/types/contract';
import { ImageResourceFailureKind, ResourceResolutionState } from '@flighthq/types/contract';
import { Scene3DResourceResolverRuntimeKey } from '@flighthq/types/contract';
import type { Scene3DResourceInFlight, Scene3DResourceResolverWithRuntime } from '@flighthq/types/contract';

import { getScene3DResourceTextures, getScene3DTextureResourceReference } from './getScene3DResourceTextures';

// Resolves one texture's ref to a TextureSource (or null for an expected failure): Embedded bytes
// decode through @flighthq/image; External URIs go through the resolver's fetch seam. Cancellation is
// carried by `signal` (both paths reject on abort). Exported for direct testing of the two ref kinds.
export function resolveOneScene3DResourceTexture(
  resolver: Readonly<Scene3DResourceResolver>,
  ref: ImageResourceReference,
  signal: AbortSignal,
): Promise<TextureSource | null> {
  return resolveImageResourceReference(ref, resolver.fetch, signal);
}

// Reconciles the selected working set entirely synchronously. It groups shared references, recognizes
// content already present on a texture, and binds resolver-cached sources to every selected subscriber.
// Acquisition, cancellation, Promise scheduling, and priority policy belong to the explicit update/load
// operations.
export function resolveScene3DResources(
  scene: Readonly<Scene3D>,
  resolver: Scene3DResourceResolverWithRuntime,
  options?: Readonly<ResolveScene3DResourcesOptions>,
): Scene3DResources {
  const runtime = resolver[Scene3DResourceResolverRuntimeKey];
  const textures: Texture[] = [];
  getScene3DResourceTextures(textures, scene);

  const working = new Map<ImageResourceReference, Texture[]>();
  for (let i = 0; i < textures.length; i++) {
    const texture = textures[i];
    const ref = getScene3DTextureResourceReference(scene, texture);
    if (ref == null) continue;
    const source = texture.dimension === '2d' ? texture.source : null;
    if (source !== null) {
      runtime.resolved.set(ref, source);
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

  const resolved: Scene3DResources['resolved'] = [];
  const unresolved: Scene3DResourceWorkingSet[] = [];
  for (const [ref, subscribers] of working) {
    const source = runtime.resolved.get(ref);
    if (source === undefined) {
      if (ref.state === ResourceResolutionState.Resolved) ref.state = ResourceResolutionState.Unresolved;
      unresolved.push({ ref, textures: subscribers });
      continue;
    }
    ref.failure = null;
    ref.state = ResourceResolutionState.Resolved;
    for (let i = 0; i < subscribers.length; i++) {
      bindResolvedScene3DResource(resolver, subscribers[i], ref, source);
    }
    resolved.push({ ref, source, textures: subscribers });
  }
  return { resolved, scene, unresolved };
}

// Explicit progressive pass. Repeated calls reconcile resolver-scoped in-flight state with the current
// visibility/priority working set; disposal remains the cancellation boundary for the retained resolver.
export function updateScene3DResourceStreaming(
  scene: Readonly<Scene3D>,
  resolver: Scene3DResourceResolverWithRuntime,
  options?: Readonly<UpdateScene3DResourceStreamingOptions>,
): Scene3DResources {
  const resources = resolveScene3DResources(scene, resolver, options);
  const working = new Map<ImageResourceReference, Texture[]>();
  addScene3DResourceGroupsToWorkingSet(working, resources.resolved);
  addScene3DResourceGroupsToWorkingSet(working, resources.unresolved);
  cancelDroppedResolutions(resolver, working);
  requestWorkingResolutions(resolver, working, options);
  return resources;
}

function addScene3DResourceGroupsToWorkingSet(
  out: Map<ImageResourceReference, Texture[]>,
  groups: readonly Scene3DResourceWorkingSet[],
): void {
  for (let i = 0; i < groups.length; i++) {
    out.set(groups[i].ref, groups[i].textures);
  }
}

function cancelDroppedResolutions(
  resolver: Scene3DResourceResolverWithRuntime,
  working: ReadonlyMap<ImageResourceReference, readonly Texture[]>,
): void {
  const runtime = resolver[Scene3DResourceResolverRuntimeKey];
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
  resolver: Scene3DResourceResolverWithRuntime,
  ref: ImageResourceReference,
  entry: Scene3DResourceInFlight,
  source: TextureSource | null,
): void {
  const runtime = resolver[Scene3DResourceResolverRuntimeKey];
  // Ignore a late settle whose entry was already cancelled or replaced by a newer request.
  if (runtime.inFlight.get(ref) !== entry) return;
  runtime.inFlight.delete(ref);
  if (source === null) {
    ref.failure ??= (() => {
      const out = allocateEntity<ImageResourceFailure>();
      out.kind = ImageResourceFailureKind.Unavailable;
      out.message = 'Image resource resolution returned no source';
      out.name = null;
      return finishEntity(out);
    })();
    ref.state = ResourceResolutionState.Failed;
    for (const texture of entry.subscribers) emitScene3DResourceEvent(resolver, texture, ref, false);
    return;
  }
  runtime.resolved.set(ref, source);
  ref.failure = null;
  ref.state = ResourceResolutionState.Resolved;
  for (const texture of entry.subscribers) bindResolvedScene3DResource(resolver, texture, ref, source);
}

function failScene3DResourceResolution(
  resolver: Scene3DResourceResolverWithRuntime,
  ref: ImageResourceReference,
  entry: Scene3DResourceInFlight,
  cause: unknown,
): void {
  const runtime = resolver[Scene3DResourceResolverRuntimeKey];
  if (runtime.inFlight.get(ref) !== entry) return;
  runtime.inFlight.delete(ref);
  // An abort is a cancel, not a failure: the ref was already reverted to Unresolved when dropped.
  if (entry.controller.signal.aborted) return;
  ref.failure = createImageResourceFailure(cause);
  ref.state = ResourceResolutionState.Failed;
  for (const texture of entry.subscribers) emitScene3DResourceEvent(resolver, texture, ref, false);
}

function bindResolvedScene3DResource(
  resolver: Readonly<Scene3DResourceResolverWithRuntime>,
  texture: Texture,
  ref: ImageResourceReference,
  source: TextureSource,
): void {
  if (texture.dimension !== '2d') return;
  if (texture.source === source) return;
  texture.source = source;
  texture.version = (texture.version + 1) >>> 0;
  emitScene3DResourceEvent(resolver, texture, ref, true);
}

function emitScene3DResourceEvent(
  resolver: Readonly<Scene3DResourceResolverWithRuntime>,
  texture: Texture,
  ref: ImageResourceReference,
  resolved: boolean,
): void {
  const signals = resolver[Scene3DResourceResolverRuntimeKey].signals;
  if (signals === null) return;
  const event = { ref, texture };
  emitSignal(resolved ? signals.onResourceResolved : signals.onResourceFailed, event);
}

function requestWorkingResolutions(
  resolver: Scene3DResourceResolverWithRuntime,
  working: ReadonlyMap<ImageResourceReference, readonly Texture[]>,
  options?: Readonly<UpdateScene3DResourceStreamingOptions>,
): void {
  const runtime = resolver[Scene3DResourceResolverRuntimeKey];
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
    const handle = queueResourceLoad<TextureSource | null>(runtime.loader, {
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
      (source) => finishScene3DResourceResolution(resolver, ref, entry, source),
      (cause) => failScene3DResourceResolution(resolver, ref, entry, cause),
    );
    runtime.inFlight.set(ref, entry);
  }
}

const _resolvedVoid: Promise<void> = Promise.resolve();
