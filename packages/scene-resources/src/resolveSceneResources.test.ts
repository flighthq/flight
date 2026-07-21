import type * as ImageModule from '@flighthq/image';
import { createUnlitMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import { createMesh, createScene } from '@flighthq/scene';
import { connectSignal } from '@flighthq/signals';
import { createTexture } from '@flighthq/texture';
import type { ImageResource, ImageResourceReference, Texture } from '@flighthq/types';
import { ResourceResolutionState, ImageResourceReferenceKind } from '@flighthq/types';
import type { Mock } from 'vitest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type * as ResolveSceneResourcesModule from './resolveSceneResources';
import type { SceneResourceResolver } from './sceneResourceResolver';
import type * as SceneResourceResolverModule from './sceneResourceResolver';
import type * as SceneResourceSignalsModule from './sceneResourceSignals';

const fakeImage = { height: 2, width: 2 } as unknown as ImageResource;
type LoadImageResourceFromBytes = typeof ImageModule.loadImageResourceFromBytes;

let createSceneResourceResolver: typeof SceneResourceResolverModule.createSceneResourceResolver;
let disposeSceneResourceResolver: typeof SceneResourceResolverModule.disposeSceneResourceResolver;
let enableSceneResourceSignals: typeof SceneResourceSignalsModule.enableSceneResourceSignals;
let loadFromBytes: Mock<LoadImageResourceFromBytes>;
let resolveOneSceneResourceTexture: typeof ResolveSceneResourcesModule.resolveOneSceneResourceTexture;
let resolveSceneResources: typeof ResolveSceneResourcesModule.resolveSceneResources;

function embeddedRef(mimeType: string | null = 'image/png'): ImageResourceReference {
  return {
    bytes: new Uint8Array([9, 9]),
    kind: ImageResourceReferenceKind.Embedded,
    mimeType,
    state: ResourceResolutionState.Unresolved,
  };
}

function externalRef(uri = 'leaf.png'): ImageResourceReference {
  return {
    basePath: null,
    kind: ImageResourceReferenceKind.External,
    mimeType: null,
    state: ResourceResolutionState.Unresolved,
    uri,
  };
}

function pendingTexture(): Texture {
  return createTexture({ resource: embeddedRef() });
}

function meshScene(...textures: Texture[]) {
  const scene = createScene();
  for (const texture of textures) {
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: texture })]));
  }
  return scene;
}

async function settle(resolver: SceneResourceResolver): Promise<void> {
  const promises = [...resolver.inFlight.values()].map((entry) => entry.promise);
  await Promise.allSettled(promises);
}

beforeAll(async () => {
  vi.resetModules();
  loadFromBytes = vi.fn<LoadImageResourceFromBytes>();
  vi.doMock('@flighthq/image', () => ({
    loadImageResourceFromBytes: loadFromBytes,
    loadImageResourceFromUrl: vi.fn(),
  }));
  ({ resolveOneSceneResourceTexture, resolveSceneResources } = await import('./resolveSceneResources'));
  ({ createSceneResourceResolver, disposeSceneResourceResolver } = await import('./sceneResourceResolver'));
  ({ enableSceneResourceSignals } = await import('./sceneResourceSignals'));
});

afterAll(() => {
  vi.doUnmock('@flighthq/image');
  vi.resetModules();
});

afterEach(() => {
  loadFromBytes.mockReset();
});

describe('resolveOneSceneResourceTexture', () => {
  it('decodes embedded bytes through @flighthq/image', async () => {
    loadFromBytes.mockResolvedValue(fakeImage);
    const resolver = createSceneResourceResolver();
    const ref = embeddedRef('image/jpeg');
    const signal = new AbortController().signal;
    const result = await resolveOneSceneResourceTexture(resolver, ref, signal);
    expect(loadFromBytes).toHaveBeenCalledWith((ref as { bytes: Uint8Array }).bytes, 'image/jpeg', signal);
    expect(result).toBe(fakeImage);
    disposeSceneResourceResolver(resolver);
  });

  it('passes undefined for a null embedded mimeType', async () => {
    loadFromBytes.mockResolvedValue(fakeImage);
    const resolver = createSceneResourceResolver();
    await resolveOneSceneResourceTexture(resolver, embeddedRef(null), new AbortController().signal);
    expect(loadFromBytes).toHaveBeenCalledWith(expect.anything(), undefined, expect.anything());
    disposeSceneResourceResolver(resolver);
  });

  it('routes external refs through the resolver fetch seam', async () => {
    const fetch = vi.fn(async () => fakeImage);
    const resolver = createSceneResourceResolver({ fetch });
    const ref = externalRef();
    const signal = new AbortController().signal;
    const result = await resolveOneSceneResourceTexture(resolver, ref, signal);
    expect(fetch).toHaveBeenCalledWith(ref, signal);
    expect(result).toBe(fakeImage);
    disposeSceneResourceResolver(resolver);
  });
});

describe('resolveSceneResources', () => {
  it('resolves every pending texture, binding the image and advancing state', async () => {
    loadFromBytes.mockResolvedValue(fakeImage);
    const a = pendingTexture();
    const b = pendingTexture();
    const scene = meshScene(a, b);
    const resolver = createSceneResourceResolver();

    resolveSceneResources(scene.root, resolver);
    await settle(resolver);

    expect(a.image).toBe(fakeImage);
    expect(b.image).toBe(fakeImage);
    expect(a.resource?.state).toBe(ResourceResolutionState.Resolved);
    expect(b.resource?.state).toBe(ResourceResolutionState.Resolved);
    expect(resolver.inFlight.size).toBe(0);
    disposeSceneResourceResolver(resolver);
  });

  it('limits the working set to textures the select predicate accepts', async () => {
    loadFromBytes.mockResolvedValue(fakeImage);
    const wanted = pendingTexture();
    const skipped = pendingTexture();
    const scene = meshScene(wanted, skipped);
    const resolver = createSceneResourceResolver();

    resolveSceneResources(scene.root, resolver, { select: (texture) => texture === wanted });
    await settle(resolver);

    expect(wanted.resource?.state).toBe(ResourceResolutionState.Resolved);
    expect(skipped.resource?.state).toBe(ResourceResolutionState.Unresolved);
    expect(skipped.image).toBeNull();
    disposeSceneResourceResolver(resolver);
  });

  it('fails a texture whose external fetch returns null', async () => {
    const texture = createTexture({ resource: externalRef() });
    const scene = meshScene(texture);
    const resolver = createSceneResourceResolver({ fetch: async () => null });

    resolveSceneResources(scene.root, resolver);
    await settle(resolver);

    expect(texture.image).toBeNull();
    expect(texture.resource?.state).toBe(ResourceResolutionState.Failed);
    disposeSceneResourceResolver(resolver);
  });

  it('fails a texture whose decode throws', async () => {
    loadFromBytes.mockRejectedValue(new Error('bad image'));
    const texture = pendingTexture();
    const scene = meshScene(texture);
    const resolver = createSceneResourceResolver();

    resolveSceneResources(scene.root, resolver);
    await settle(resolver);

    expect(texture.resource?.state).toBe(ResourceResolutionState.Failed);
    disposeSceneResourceResolver(resolver);
  });

  it('cancels and reverts a load dropped from the working set, then re-requests on re-entry', () => {
    // A load that hangs until its signal aborts, so we can drop it mid-flight.
    loadFromBytes.mockImplementation(
      (_bytes, _mime, signal) =>
        new Promise<ImageResource>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason));
        }),
    );
    const texture = pendingTexture();
    const scene = meshScene(texture);
    const resolver = createSceneResourceResolver();

    resolveSceneResources(scene.root, resolver, { select: () => true });
    expect(texture.resource?.state).toBe(ResourceResolutionState.Loading);
    expect(resolver.inFlight.has(texture)).toBe(true);

    // Drop it: not in the working set this pass → abort + revert.
    resolveSceneResources(scene.root, resolver, { select: () => false });
    expect(texture.resource?.state).toBe(ResourceResolutionState.Unresolved);
    expect(texture.image).toBeNull();
    expect(resolver.inFlight.has(texture)).toBe(false);

    // Re-entry re-requests from scratch.
    resolveSceneResources(scene.root, resolver, { select: () => true });
    expect(texture.resource?.state).toBe(ResourceResolutionState.Loading);
    expect(resolver.inFlight.has(texture)).toBe(true);

    disposeSceneResourceResolver(resolver);
  });

  it('does not re-request a texture already in flight', () => {
    loadFromBytes.mockImplementation(() => new Promise<ImageResource>(() => {}));
    const texture = pendingTexture();
    const scene = meshScene(texture);
    const resolver = createSceneResourceResolver();

    resolveSceneResources(scene.root, resolver);
    const first = resolver.inFlight.get(texture);
    resolveSceneResources(scene.root, resolver);
    expect(resolver.inFlight.get(texture)).toBe(first);

    disposeSceneResourceResolver(resolver);
  });

  it('emits onResourceResolved when signals are enabled', async () => {
    loadFromBytes.mockResolvedValue(fakeImage);
    const texture = pendingTexture();
    const scene = meshScene(texture);
    const resolver = createSceneResourceResolver();
    const signals = enableSceneResourceSignals(resolver);
    const resolved: Texture[] = [];
    const failed: Texture[] = [];
    connectSignal(signals.onResourceResolved, (event) => resolved.push(event.texture));
    connectSignal(signals.onResourceFailed, (event) => failed.push(event.texture));

    resolveSceneResources(scene.root, resolver);
    await settle(resolver);

    expect(resolved).toEqual([texture]);
    expect(failed).toEqual([]);
    disposeSceneResourceResolver(resolver);
  });

  it('emits onResourceFailed when a decode throws', async () => {
    loadFromBytes.mockRejectedValue(new Error('bad image'));
    const texture = pendingTexture();
    const scene = meshScene(texture);
    const resolver = createSceneResourceResolver();
    const signals = enableSceneResourceSignals(resolver);
    const failed: Texture[] = [];
    connectSignal(signals.onResourceFailed, (event) => failed.push(event.texture));

    resolveSceneResources(scene.root, resolver);
    await settle(resolver);

    expect(failed).toEqual([texture]);
    disposeSceneResourceResolver(resolver);
  });
});
