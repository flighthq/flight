import * as imageModule from '@flighthq/image/contract';
import { createUnlitMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { createMesh, createScene3D } from '@flighthq/scene3d/contract';
import { connectSignal } from '@flighthq/signals/contract';
import { createTexture, getTextureSource } from '@flighthq/texture/contract';
import type {
  ImageResource,
  ImageResourceReference,
  Scene3DResourceResolverWithRuntime,
  Texture,
} from '@flighthq/types/contract';
import {
  EntityRuntimeKey,
  ImageResourceFailureKind,
  ImageTextureSourceKind,
  ResourceResolutionState,
  ImageResourceReferenceKind,
} from '@flighthq/types/contract';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { waitForScene3DResourceResolver } from './loadScene3DResources';
import {
  resolveOneScene3DResourceTexture,
  resolveScene3DResources,
  updateScene3DResourceStreaming,
} from './resolveScene3DResources';
import { createBuiltInScene3DResourceResolver, disposeScene3DResourceResolver } from './sceneResourceResolver';
import { enableScene3DResourceSignals } from './sceneResourceSignals';

const fakeImage = { height: 2, kind: ImageTextureSourceKind, width: 2 } as unknown as ImageResource;
const testResources: ImageResourceReference[] = [];
let sceneResources: ImageResourceReference[] = [];

function embeddedRef(mimeType: string | null = 'image/png'): ImageResourceReference {
  const ref: ImageResourceReference = {
    [EntityRuntimeKey]: undefined,
    bytes: new Uint8Array([9, 9]),
    alphaType: 'straight',
    failure: null,
    kind: ImageResourceReferenceKind.Embedded,
    mimeType,
    state: ResourceResolutionState.Unresolved,
  };
  testResources.push(ref);
  return ref;
}

function externalRef(uri = 'leaf.png'): ImageResourceReference {
  const ref: ImageResourceReference = {
    [EntityRuntimeKey]: undefined,
    basePath: null,
    failure: null,
    kind: ImageResourceReferenceKind.External,
    mimeType: null,
    state: ResourceResolutionState.Unresolved,
    uri,
  };
  testResources.push(ref);
  return ref;
}

function resourceOf(texture: Texture): ImageResourceReference | undefined {
  return sceneResources.find((ref) => ref.textures?.includes(texture) === true);
}

function pendingTexture(): Texture {
  return createTexture({ resource: embeddedRef() });
}

function meshScene3D(...textures: Texture[]) {
  const scene = createScene3D();
  // Only this test's references. Copying the whole accumulator used to hand each scene the previous
  // tests' references too, which discovery quietly dropped while it narrowed by mesh attachment.
  sceneResources = testResources.slice();
  testResources.length = 0;
  scene.resources = sceneResources;
  for (const texture of textures) {
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: texture })]));
  }
  return scene;
}

async function settle(resolver: Scene3DResourceResolverWithRuntime): Promise<void> {
  await waitForScene3DResourceResolver(resolver);
}

beforeEach(() => {
  vi.spyOn(imageModule, 'resolveImageResourceReference').mockImplementation((() => {}) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveOneScene3DResourceTexture', () => {
  it('decodes embedded bytes through @flighthq/image', async () => {
    vi.mocked(imageModule.resolveImageResourceReference).mockResolvedValue(fakeImage);
    const resolver = createBuiltInScene3DResourceResolver();
    const ref = embeddedRef('image/jpeg');
    const signal = new AbortController().signal;
    const result = await resolveOneScene3DResourceTexture(resolver, ref, signal);
    expect(imageModule.resolveImageResourceReference).toHaveBeenCalledWith(ref, resolver.fetch, signal);
    expect(result).toBe(fakeImage);
    disposeScene3DResourceResolver(resolver);
  });

  it('passes the complete plain embedded reference to the shared resource atom', async () => {
    vi.mocked(imageModule.resolveImageResourceReference).mockResolvedValue(fakeImage);
    const resolver = createBuiltInScene3DResourceResolver();
    const ref = embeddedRef(null);
    const signal = new AbortController().signal;
    await resolveOneScene3DResourceTexture(resolver, ref, signal);
    expect(imageModule.resolveImageResourceReference).toHaveBeenCalledWith(ref, resolver.fetch, signal);
    disposeScene3DResourceResolver(resolver);
  });

  it('routes external refs through the resolver fetch seam', async () => {
    const fetch = vi.fn(async () => fakeImage);
    vi.mocked(imageModule.resolveImageResourceReference).mockImplementation((ref, resolveFetch, signal) =>
      ref.kind === ImageResourceReferenceKind.External ? resolveFetch(ref, signal) : Promise.resolve(null),
    );
    const resolver = createBuiltInScene3DResourceResolver({ fetch });
    const ref = externalRef();
    const signal = new AbortController().signal;
    const result = await resolveOneScene3DResourceTexture(resolver, ref, signal);
    expect(fetch).toHaveBeenCalledWith(ref, signal);
    expect(result).toBe(fakeImage);
    disposeScene3DResourceResolver(resolver);
  });
});

describe('resolveScene3DResources', () => {
  it('does not cancel acquisition owned by a streaming update', async () => {
    let loadSignal: AbortSignal | undefined;
    vi.mocked(imageModule.resolveImageResourceReference).mockImplementation(
      (_ref, _fetch, signal) =>
        new Promise<ImageResource>((_resolve, reject) => {
          loadSignal = signal;
          signal?.addEventListener('abort', () => reject(signal.reason));
        }),
    );
    const ref = embeddedRef();
    const scene = meshScene3D(createTexture({ resource: ref }));
    const resolver = createBuiltInScene3DResourceResolver();
    updateScene3DResourceStreaming(scene, resolver);
    await vi.waitFor(() => expect(loadSignal).toBeDefined());

    const resources = resolveScene3DResources(scene, resolver, { select: () => false });

    expect(resources.resolved).toEqual([]);
    expect(resources.unresolved).toEqual([]);
    expect(loadSignal?.aborted).toBe(false);
    expect(ref.state).toBe(ResourceResolutionState.Loading);
    disposeScene3DResourceResolver(resolver);
  });

  it('returns the selected unresolved working set without starting acquisition', () => {
    vi.mocked(imageModule.resolveImageResourceReference).mockResolvedValue(fakeImage);
    const ref = embeddedRef();
    const a = createTexture({ resource: ref });
    const b = createTexture({ resource: ref });
    const scene = meshScene3D(a, b);
    const resolver = createBuiltInScene3DResourceResolver();

    const resources = resolveScene3DResources(scene, resolver);

    expect(resources.scene).toBe(scene);
    expect(resources.resolved).toEqual([]);
    expect(resources.unresolved).toEqual([{ ref, textures: [a, b] }]);
    expect(ref.state).toBe(ResourceResolutionState.Unresolved);
    expect(imageModule.resolveImageResourceReference).not.toHaveBeenCalled();
    disposeScene3DResourceResolver(resolver);
  });

  it('binds ready content across subscribers and returns its resolved group', () => {
    const ref = embeddedRef();
    const a = createTexture({ resource: ref });
    const b = createTexture({ resource: ref });
    if (a.dimension !== '2d') throw new Error('test texture must be 2d');
    a.source = fakeImage;
    const scene = meshScene3D(a, b);
    const resolver = createBuiltInScene3DResourceResolver();

    const resources = resolveScene3DResources(scene, resolver);

    expect(resources.unresolved).toEqual([]);
    expect(resources.resolved).toEqual([{ ref, source: fakeImage, textures: [a, b] }]);
    expect(getTextureSource(b)).toBe(fakeImage);
    expect(ref.state).toBe(ResourceResolutionState.Resolved);
    disposeScene3DResourceResolver(resolver);
  });
});

describe('updateScene3DResourceStreaming', () => {
  it('resolves every pending texture, binding the image and advancing state', async () => {
    vi.mocked(imageModule.resolveImageResourceReference).mockResolvedValue(fakeImage);
    const a = pendingTexture();
    const b = pendingTexture();
    const scene = meshScene3D(a, b);
    const resolver = createBuiltInScene3DResourceResolver();

    updateScene3DResourceStreaming(scene, resolver);
    await settle(resolver);

    expect(getTextureSource(a)).toBe(fakeImage);
    expect(getTextureSource(b)).toBe(fakeImage);
    expect(resourceOf(a)?.state).toBe(ResourceResolutionState.Resolved);
    expect(resourceOf(a)?.failure).toBeNull();
    expect(resourceOf(b)?.state).toBe(ResourceResolutionState.Resolved);
    disposeScene3DResourceResolver(resolver);
  });

  it('fetches and decodes one shared resource once, then binds every subscribed texture', async () => {
    vi.mocked(imageModule.resolveImageResourceReference).mockResolvedValue(fakeImage);
    const ref = embeddedRef();
    const a = createTexture({ resource: ref });
    const b = createTexture({ resource: ref });
    const scene = meshScene3D(a, b);
    const resolver = createBuiltInScene3DResourceResolver();

    updateScene3DResourceStreaming(scene, resolver);
    await settle(resolver);

    expect(imageModule.resolveImageResourceReference).toHaveBeenCalledTimes(1);
    expect(getTextureSource(a)).toBe(fakeImage);
    expect(getTextureSource(b)).toBe(fakeImage);
    expect(ref.state).toBe(ResourceResolutionState.Resolved);
    disposeScene3DResourceResolver(resolver);
  });

  it('keeps a shared load alive until its final subscriber leaves the working set', async () => {
    let loadSignal: AbortSignal | undefined;
    vi.mocked(imageModule.resolveImageResourceReference).mockImplementation(
      (_ref, _fetch, signal) =>
        new Promise<ImageResource>((_resolve, reject) => {
          loadSignal = signal;
          signal?.addEventListener('abort', () => reject(signal.reason));
        }),
    );
    const ref = embeddedRef();
    const a = createTexture({ resource: ref });
    const b = createTexture({ resource: ref });
    const scene = meshScene3D(a, b);
    const resolver = createBuiltInScene3DResourceResolver();

    updateScene3DResourceStreaming(scene, resolver);
    await vi.waitFor(() => expect(loadSignal).toBeDefined());
    updateScene3DResourceStreaming(scene, resolver, { select: (texture) => texture === b });
    expect(loadSignal?.aborted).toBe(false);
    expect(ref.state).toBe(ResourceResolutionState.Loading);

    updateScene3DResourceStreaming(scene, resolver, { select: () => false });
    expect(loadSignal?.aborted).toBe(true);
    expect(ref.state).toBe(ResourceResolutionState.Unresolved);
    disposeScene3DResourceResolver(resolver);
  });

  it('binds a later subscriber from the resolved resource cache without decoding again', async () => {
    vi.mocked(imageModule.resolveImageResourceReference).mockResolvedValue(fakeImage);
    const ref = embeddedRef();
    const a = createTexture({ resource: ref });
    const b = createTexture({ resource: ref });
    const scene = meshScene3D(a, b);
    const resolver = createBuiltInScene3DResourceResolver();

    updateScene3DResourceStreaming(scene, resolver, { select: (texture) => texture === a });
    await settle(resolver);
    expect(getTextureSource(a)).toBe(fakeImage);
    expect(getTextureSource(b)).toBeNull();

    updateScene3DResourceStreaming(scene, resolver, { select: (texture) => texture === b });
    expect(getTextureSource(b)).toBe(fakeImage);
    expect(imageModule.resolveImageResourceReference).toHaveBeenCalledTimes(1);
    disposeScene3DResourceResolver(resolver);
  });

  it('limits the working set to textures the select predicate accepts', async () => {
    vi.mocked(imageModule.resolveImageResourceReference).mockResolvedValue(fakeImage);
    const wanted = pendingTexture();
    const skipped = pendingTexture();
    const scene = meshScene3D(wanted, skipped);
    const resolver = createBuiltInScene3DResourceResolver();

    updateScene3DResourceStreaming(scene, resolver, { select: (texture) => texture === wanted });
    await settle(resolver);

    expect(resourceOf(wanted)?.state).toBe(ResourceResolutionState.Resolved);
    expect(resourceOf(skipped)?.state).toBe(ResourceResolutionState.Unresolved);
    expect(getTextureSource(skipped)).toBeNull();
    disposeScene3DResourceResolver(resolver);
  });

  it('fails a texture whose external fetch returns null', async () => {
    vi.mocked(imageModule.resolveImageResourceReference).mockImplementation(async (ref, fetch, signal) => {
      if (ref.kind !== ImageResourceReferenceKind.External) return null;
      const source = await fetch(ref, signal);
      if (source === null) {
        ref.failure = {
          [EntityRuntimeKey]: undefined,
          kind: ImageResourceFailureKind.Unavailable,
          message: 'ImageResource resource unavailable',
          name: null,
        };
        ref.state = ResourceResolutionState.Failed;
      }
      return source;
    });
    const texture = createTexture({ resource: externalRef() });
    const scene = meshScene3D(texture);
    const resolver = createBuiltInScene3DResourceResolver({ fetch: async () => null });

    updateScene3DResourceStreaming(scene, resolver);
    await settle(resolver);

    expect(getTextureSource(texture)).toBeNull();
    expect(resourceOf(texture)?.state).toBe(ResourceResolutionState.Failed);
    expect(resourceOf(texture)?.failure).toEqual({
      kind: ImageResourceFailureKind.Unavailable,
      message: 'ImageResource resource unavailable',
      name: null,
    });
    disposeScene3DResourceResolver(resolver);
  });

  it('fails a texture whose decode throws', async () => {
    vi.mocked(imageModule.resolveImageResourceReference).mockRejectedValue(new Error('bad image'));
    const texture = pendingTexture();
    const scene = meshScene3D(texture);
    const resolver = createBuiltInScene3DResourceResolver();

    updateScene3DResourceStreaming(scene, resolver);
    await settle(resolver);

    expect(resourceOf(texture)?.state).toBe(ResourceResolutionState.Failed);
    expect(resourceOf(texture)?.failure).toEqual({
      kind: ImageResourceFailureKind.Error,
      message: 'bad image',
      name: 'Error',
    });
    disposeScene3DResourceResolver(resolver);
  });

  it('cancels and reverts a load dropped from the working set, then re-requests on re-entry', async () => {
    const loadSignals: AbortSignal[] = [];
    // A load that hangs until its signal aborts, so we can drop it mid-flight.
    vi.mocked(imageModule.resolveImageResourceReference).mockImplementation(
      (_ref, _fetch, signal) =>
        new Promise<ImageResource>((_resolve, reject) => {
          if (signal !== undefined) loadSignals.push(signal);
          signal?.addEventListener('abort', () => reject(signal.reason));
        }),
    );
    const texture = pendingTexture();
    const scene = meshScene3D(texture);
    const resolver = createBuiltInScene3DResourceResolver();

    updateScene3DResourceStreaming(scene, resolver, { select: () => true });
    expect(resourceOf(texture)?.state).toBe(ResourceResolutionState.Loading);
    await vi.waitFor(() => expect(loadSignals).toHaveLength(1));

    // Drop it: not in the working set this pass → abort + revert.
    updateScene3DResourceStreaming(scene, resolver, { select: () => false });
    expect(resourceOf(texture)?.state).toBe(ResourceResolutionState.Unresolved);
    expect(getTextureSource(texture)).toBeNull();
    expect(loadSignals[0].aborted).toBe(true);

    // Re-entry re-requests from scratch.
    updateScene3DResourceStreaming(scene, resolver, { select: () => true });
    expect(resourceOf(texture)?.state).toBe(ResourceResolutionState.Loading);
    await vi.waitFor(() => expect(loadSignals).toHaveLength(2));

    disposeScene3DResourceResolver(resolver);
  });

  it('does not re-request a texture already in flight', async () => {
    vi.mocked(imageModule.resolveImageResourceReference).mockImplementation(() => new Promise<ImageResource>(() => {}));
    const texture = pendingTexture();
    const scene = meshScene3D(texture);
    const resolver = createBuiltInScene3DResourceResolver();

    updateScene3DResourceStreaming(scene, resolver);
    await vi.waitFor(() => expect(imageModule.resolveImageResourceReference).toHaveBeenCalledTimes(1));
    updateScene3DResourceStreaming(scene, resolver);
    expect(imageModule.resolveImageResourceReference).toHaveBeenCalledTimes(1);

    disposeScene3DResourceResolver(resolver);
  });

  it('emits onResourceResolved when signals are enabled', async () => {
    vi.mocked(imageModule.resolveImageResourceReference).mockResolvedValue(fakeImage);
    const texture = pendingTexture();
    const scene = meshScene3D(texture);
    const resolver = createBuiltInScene3DResourceResolver();
    const signals = enableScene3DResourceSignals(resolver);
    const resolved: Texture[] = [];
    const failed: Texture[] = [];
    connectSignal(signals.onResourceResolved, (event) => resolved.push(event.texture));
    connectSignal(signals.onResourceFailed, (event) => failed.push(event.texture));

    updateScene3DResourceStreaming(scene, resolver);
    await settle(resolver);

    expect(resolved).toEqual([texture]);
    expect(failed).toEqual([]);
    disposeScene3DResourceResolver(resolver);
  });

  it('emits onResourceFailed when a decode throws', async () => {
    vi.mocked(imageModule.resolveImageResourceReference).mockRejectedValue(new Error('bad image'));
    const texture = pendingTexture();
    const scene = meshScene3D(texture);
    const resolver = createBuiltInScene3DResourceResolver();
    const signals = enableScene3DResourceSignals(resolver);
    const failed: Texture[] = [];
    connectSignal(signals.onResourceFailed, (event) => failed.push(event.texture));

    updateScene3DResourceStreaming(scene, resolver);
    await settle(resolver);

    expect(failed).toEqual([texture]);
    disposeScene3DResourceResolver(resolver);
  });
});
