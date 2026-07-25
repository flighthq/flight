import type * as ImageModule from '@flighthq/image';
import { createUnlitMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import { createMesh, createScene3D } from '@flighthq/scene';
import { connectSignal } from '@flighthq/signals';
import { createTexture } from '@flighthq/texture';
import type { ImageResource, ImageResourceReference, Scene3DResourceResolver, Texture } from '@flighthq/types';
import { ImageResourceFailureKind, ResourceResolutionState, ImageResourceReferenceKind } from '@flighthq/types';
import type { Mock } from 'vitest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type * as ResolveScene3DResourcesModule from './resolveScene3DResources';
import type * as ResolveScene3DResourcesAndWaitModule from './resolveScene3DResourcesAndWait';
import type * as Scene3DResourceResolverModule from './sceneResourceResolver';
import type * as Scene3DResourceSignalsModule from './sceneResourceSignals';

const fakeImage = { height: 2, width: 2 } as unknown as ImageResource;
type LoadImageResourceFromBytes = typeof ImageModule.loadImageResourceFromBytes;

let createBuiltInScene3DResourceResolver: typeof Scene3DResourceResolverModule.createBuiltInScene3DResourceResolver;
let disposeScene3DResourceResolver: typeof Scene3DResourceResolverModule.disposeScene3DResourceResolver;
let enableScene3DResourceSignals: typeof Scene3DResourceSignalsModule.enableScene3DResourceSignals;
let loadFromBytes: Mock<LoadImageResourceFromBytes>;
let resolveOneScene3DResourceTexture: typeof ResolveScene3DResourcesModule.resolveOneScene3DResourceTexture;
let resolveScene3DResources: typeof ResolveScene3DResourcesModule.resolveScene3DResources;
let waitForScene3DResourceResolver: typeof ResolveScene3DResourcesAndWaitModule.waitForScene3DResourceResolver;

function embeddedRef(mimeType: string | null = 'image/png'): ImageResourceReference {
  return {
    bytes: new Uint8Array([9, 9]),
    failure: null,
    kind: ImageResourceReferenceKind.Embedded,
    mimeType,
    state: ResourceResolutionState.Unresolved,
  };
}

function externalRef(uri = 'leaf.png'): ImageResourceReference {
  return {
    basePath: null,
    failure: null,
    kind: ImageResourceReferenceKind.External,
    mimeType: null,
    state: ResourceResolutionState.Unresolved,
    uri,
  };
}

function pendingTexture(): Texture {
  return createTexture({ resource: embeddedRef() });
}

function meshScene3D(...textures: Texture[]) {
  const scene = createScene3D();
  for (const texture of textures) {
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: texture })]));
  }
  return scene;
}

async function settle(resolver: Scene3DResourceResolver): Promise<void> {
  await waitForScene3DResourceResolver(resolver);
}

beforeAll(async () => {
  vi.resetModules();
  loadFromBytes = vi.fn<LoadImageResourceFromBytes>();
  vi.doMock('@flighthq/image', () => ({
    loadImageResourceFromBytes: loadFromBytes,
    loadImageResourceFromUrl: vi.fn(),
  }));
  ({ resolveOneScene3DResourceTexture, resolveScene3DResources } = await import('./resolveScene3DResources'));
  ({ waitForScene3DResourceResolver } = await import('./resolveScene3DResourcesAndWait'));
  ({ createBuiltInScene3DResourceResolver, disposeScene3DResourceResolver } = await import('./sceneResourceResolver'));
  ({ enableScene3DResourceSignals } = await import('./sceneResourceSignals'));
});

afterAll(() => {
  vi.doUnmock('@flighthq/image');
  vi.resetModules();
});

afterEach(() => {
  loadFromBytes.mockReset();
});

describe('resolveOneScene3DResourceTexture', () => {
  it('decodes embedded bytes through @flighthq/image', async () => {
    loadFromBytes.mockResolvedValue(fakeImage);
    const resolver = createBuiltInScene3DResourceResolver();
    const ref = embeddedRef('image/jpeg');
    const signal = new AbortController().signal;
    const result = await resolveOneScene3DResourceTexture(resolver, ref, signal);
    expect(loadFromBytes).toHaveBeenCalledWith((ref as { bytes: Uint8Array }).bytes, 'image/jpeg', signal);
    expect(result).toBe(fakeImage);
    disposeScene3DResourceResolver(resolver);
  });

  it('passes undefined for a null embedded mimeType', async () => {
    loadFromBytes.mockResolvedValue(fakeImage);
    const resolver = createBuiltInScene3DResourceResolver();
    await resolveOneScene3DResourceTexture(resolver, embeddedRef(null), new AbortController().signal);
    expect(loadFromBytes).toHaveBeenCalledWith(expect.anything(), undefined, expect.anything());
    disposeScene3DResourceResolver(resolver);
  });

  it('routes external refs through the resolver fetch seam', async () => {
    const fetch = vi.fn(async () => fakeImage);
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
  it('resolves every pending texture, binding the image and advancing state', async () => {
    loadFromBytes.mockResolvedValue(fakeImage);
    const a = pendingTexture();
    const b = pendingTexture();
    const scene = meshScene3D(a, b);
    const resolver = createBuiltInScene3DResourceResolver();

    resolveScene3DResources(scene.root, resolver);
    await settle(resolver);

    expect(a.image).toBe(fakeImage);
    expect(b.image).toBe(fakeImage);
    expect(a.resource?.state).toBe(ResourceResolutionState.Resolved);
    expect(a.resource?.failure).toBeNull();
    expect(b.resource?.state).toBe(ResourceResolutionState.Resolved);
    disposeScene3DResourceResolver(resolver);
  });

  it('fetches and decodes one shared resource once, then binds every subscribed texture', async () => {
    loadFromBytes.mockResolvedValue(fakeImage);
    const ref = embeddedRef();
    const a = createTexture({ resource: ref });
    const b = createTexture({ resource: ref });
    const scene = meshScene3D(a, b);
    const resolver = createBuiltInScene3DResourceResolver();

    resolveScene3DResources(scene.root, resolver);
    await settle(resolver);

    expect(loadFromBytes).toHaveBeenCalledTimes(1);
    expect(a.image).toBe(fakeImage);
    expect(b.image).toBe(fakeImage);
    expect(ref.state).toBe(ResourceResolutionState.Resolved);
    disposeScene3DResourceResolver(resolver);
  });

  it('keeps a shared load alive until its final subscriber leaves the working set', async () => {
    let loadSignal: AbortSignal | undefined;
    loadFromBytes.mockImplementation(
      (_bytes, _mime, signal) =>
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

    resolveScene3DResources(scene.root, resolver);
    await vi.waitFor(() => expect(loadSignal).toBeDefined());
    resolveScene3DResources(scene.root, resolver, { select: (texture) => texture === b });
    expect(loadSignal?.aborted).toBe(false);
    expect(ref.state).toBe(ResourceResolutionState.Loading);

    resolveScene3DResources(scene.root, resolver, { select: () => false });
    expect(loadSignal?.aborted).toBe(true);
    expect(ref.state).toBe(ResourceResolutionState.Unresolved);
    disposeScene3DResourceResolver(resolver);
  });

  it('binds a later subscriber from the resolved resource cache without decoding again', async () => {
    loadFromBytes.mockResolvedValue(fakeImage);
    const ref = embeddedRef();
    const a = createTexture({ resource: ref });
    const b = createTexture({ resource: ref });
    const scene = meshScene3D(a, b);
    const resolver = createBuiltInScene3DResourceResolver();

    resolveScene3DResources(scene.root, resolver, { select: (texture) => texture === a });
    await settle(resolver);
    expect(a.image).toBe(fakeImage);
    expect(b.image).toBeNull();

    resolveScene3DResources(scene.root, resolver, { select: (texture) => texture === b });
    expect(b.image).toBe(fakeImage);
    expect(loadFromBytes).toHaveBeenCalledTimes(1);
    disposeScene3DResourceResolver(resolver);
  });

  it('limits the working set to textures the select predicate accepts', async () => {
    loadFromBytes.mockResolvedValue(fakeImage);
    const wanted = pendingTexture();
    const skipped = pendingTexture();
    const scene = meshScene3D(wanted, skipped);
    const resolver = createBuiltInScene3DResourceResolver();

    resolveScene3DResources(scene.root, resolver, { select: (texture) => texture === wanted });
    await settle(resolver);

    expect(wanted.resource?.state).toBe(ResourceResolutionState.Resolved);
    expect(skipped.resource?.state).toBe(ResourceResolutionState.Unresolved);
    expect(skipped.image).toBeNull();
    disposeScene3DResourceResolver(resolver);
  });

  it('fails a texture whose external fetch returns null', async () => {
    const texture = createTexture({ resource: externalRef() });
    const scene = meshScene3D(texture);
    const resolver = createBuiltInScene3DResourceResolver({ fetch: async () => null });

    resolveScene3DResources(scene.root, resolver);
    await settle(resolver);

    expect(texture.image).toBeNull();
    expect(texture.resource?.state).toBe(ResourceResolutionState.Failed);
    expect(texture.resource?.failure).toEqual({
      kind: ImageResourceFailureKind.Unavailable,
      message: 'Image resource resolution returned no image',
      name: null,
    });
    disposeScene3DResourceResolver(resolver);
  });

  it('fails a texture whose decode throws', async () => {
    loadFromBytes.mockRejectedValue(new Error('bad image'));
    const texture = pendingTexture();
    const scene = meshScene3D(texture);
    const resolver = createBuiltInScene3DResourceResolver();

    resolveScene3DResources(scene.root, resolver);
    await settle(resolver);

    expect(texture.resource?.state).toBe(ResourceResolutionState.Failed);
    expect(texture.resource?.failure).toEqual({
      kind: ImageResourceFailureKind.Error,
      message: 'bad image',
      name: 'Error',
    });
    disposeScene3DResourceResolver(resolver);
  });

  it('cancels and reverts a load dropped from the working set, then re-requests on re-entry', async () => {
    const loadSignals: AbortSignal[] = [];
    // A load that hangs until its signal aborts, so we can drop it mid-flight.
    loadFromBytes.mockImplementation(
      (_bytes, _mime, signal) =>
        new Promise<ImageResource>((_resolve, reject) => {
          if (signal !== undefined) loadSignals.push(signal);
          signal?.addEventListener('abort', () => reject(signal.reason));
        }),
    );
    const texture = pendingTexture();
    const scene = meshScene3D(texture);
    const resolver = createBuiltInScene3DResourceResolver();

    resolveScene3DResources(scene.root, resolver, { select: () => true });
    expect(texture.resource?.state).toBe(ResourceResolutionState.Loading);
    await vi.waitFor(() => expect(loadSignals).toHaveLength(1));

    // Drop it: not in the working set this pass → abort + revert.
    resolveScene3DResources(scene.root, resolver, { select: () => false });
    expect(texture.resource?.state).toBe(ResourceResolutionState.Unresolved);
    expect(texture.image).toBeNull();
    expect(loadSignals[0].aborted).toBe(true);

    // Re-entry re-requests from scratch.
    resolveScene3DResources(scene.root, resolver, { select: () => true });
    expect(texture.resource?.state).toBe(ResourceResolutionState.Loading);
    await vi.waitFor(() => expect(loadSignals).toHaveLength(2));

    disposeScene3DResourceResolver(resolver);
  });

  it('does not re-request a texture already in flight', async () => {
    loadFromBytes.mockImplementation(() => new Promise<ImageResource>(() => {}));
    const texture = pendingTexture();
    const scene = meshScene3D(texture);
    const resolver = createBuiltInScene3DResourceResolver();

    resolveScene3DResources(scene.root, resolver);
    await vi.waitFor(() => expect(loadFromBytes).toHaveBeenCalledTimes(1));
    resolveScene3DResources(scene.root, resolver);
    expect(loadFromBytes).toHaveBeenCalledTimes(1);

    disposeScene3DResourceResolver(resolver);
  });

  it('emits onResourceResolved when signals are enabled', async () => {
    loadFromBytes.mockResolvedValue(fakeImage);
    const texture = pendingTexture();
    const scene = meshScene3D(texture);
    const resolver = createBuiltInScene3DResourceResolver();
    const signals = enableScene3DResourceSignals(resolver);
    const resolved: Texture[] = [];
    const failed: Texture[] = [];
    connectSignal(signals.onResourceResolved, (event) => resolved.push(event.texture));
    connectSignal(signals.onResourceFailed, (event) => failed.push(event.texture));

    resolveScene3DResources(scene.root, resolver);
    await settle(resolver);

    expect(resolved).toEqual([texture]);
    expect(failed).toEqual([]);
    disposeScene3DResourceResolver(resolver);
  });

  it('emits onResourceFailed when a decode throws', async () => {
    loadFromBytes.mockRejectedValue(new Error('bad image'));
    const texture = pendingTexture();
    const scene = meshScene3D(texture);
    const resolver = createBuiltInScene3DResourceResolver();
    const signals = enableScene3DResourceSignals(resolver);
    const failed: Texture[] = [];
    connectSignal(signals.onResourceFailed, (event) => failed.push(event.texture));

    resolveScene3DResources(scene.root, resolver);
    await settle(resolver);

    expect(failed).toEqual([texture]);
    disposeScene3DResourceResolver(resolver);
  });
});
