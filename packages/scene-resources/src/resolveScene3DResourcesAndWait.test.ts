import { createUnlitMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import { createMesh, createScene3D } from '@flighthq/scene';
import { connectSignal, createSignal } from '@flighthq/signals';
import { createTexture } from '@flighthq/texture';
import type { ImageResource, ImageResourceReference, Scene3DResourceLoadProgress } from '@flighthq/types';
import { ResourceResolutionState, ImageResourceReferenceKind } from '@flighthq/types';
import { describe, expect, it, vi } from 'vitest';

import { loadScene3DResources, waitForScene3DResourceResolver } from './resolveScene3DResourcesAndWait';
import { createBuiltInScene3DResourceResolver, disposeScene3DResourceResolver } from './sceneResourceResolver';

const fakeImage = { height: 1, width: 1 } as unknown as ImageResource;

function externalRef(): ImageResourceReference {
  return {
    basePath: null,
    failure: null,
    kind: ImageResourceReferenceKind.External,
    mimeType: null,
    state: ResourceResolutionState.Unresolved,
    uri: 'leaf.png',
  };
}

describe('loadScene3DResources', () => {
  it('awaits every started load so the scene is fully resolved on return', async () => {
    const fetch = vi.fn(async () => fakeImage);
    const a = createTexture({ resource: externalRef() });
    const b = createTexture({ resource: externalRef() });
    const scene = createScene3D();
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: a })]));
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: b })]));
    const resolver = createBuiltInScene3DResourceResolver({ fetch });

    await loadScene3DResources(scene.root, resolver);

    expect(a.image).toBe(fakeImage);
    expect(b.image).toBe(fakeImage);
    expect(a.resource?.state).toBe(ResourceResolutionState.Resolved);
    disposeScene3DResourceResolver(resolver);
  });

  it('resolves immediately when there is nothing pending', async () => {
    const scene = createScene3D();
    const resolver = createBuiltInScene3DResourceResolver({ fetch: async () => fakeImage });
    await expect(loadScene3DResources(scene.root, resolver)).resolves.toBeUndefined();
    disposeScene3DResourceResolver(resolver);
  });

  it('reports operation-scoped progress as unique references settle', async () => {
    const a = createTexture({ resource: externalRef() });
    const b = createTexture({ resource: externalRef() });
    const scene = createScene3D();
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: a })]));
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: b })]));
    const resolver = createBuiltInScene3DResourceResolver({ fetch: async () => fakeImage });
    const events: Scene3DResourceLoadProgress[] = [];
    const progress = createSignal<(event: Readonly<Scene3DResourceLoadProgress>) => void>();
    connectSignal(progress, (event) => events.push({ ...event }));

    await loadScene3DResources(scene.root, resolver, { progress });

    expect(events[0]).toEqual({ loaded: 0, total: 2 });
    expect(events.at(-1)).toEqual({ loaded: 2, total: 2 });
    disposeScene3DResourceResolver(resolver);
  });

  it('counts failed references as terminal without hiding their failure state', async () => {
    const texture = createTexture({ resource: externalRef() });
    const scene = createScene3D();
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: texture })]));
    const resolver = createBuiltInScene3DResourceResolver({ fetch: async () => null });
    const events: Scene3DResourceLoadProgress[] = [];
    const progress = createSignal<(event: Readonly<Scene3DResourceLoadProgress>) => void>();
    connectSignal(progress, (event) => events.push({ ...event }));

    await loadScene3DResources(scene.root, resolver, { progress });

    expect(texture.image).toBeNull();
    expect(texture.resource?.state).toBe(ResourceResolutionState.Failed);
    expect(events).toEqual([
      { loaded: 0, total: 1 },
      { loaded: 1, total: 1 },
    ]);
    disposeScene3DResourceResolver(resolver);
  });

  it('waits and reports only the references selected for this operation', async () => {
    const selected = createTexture({ resource: externalRef() });
    const deferred = createTexture({ resource: externalRef() });
    const scene = createScene3D();
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: selected })]));
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: deferred })]));
    const fetch = vi.fn(async () => fakeImage);
    const resolver = createBuiltInScene3DResourceResolver({ fetch });
    const events: Scene3DResourceLoadProgress[] = [];
    const progress = createSignal<(event: Readonly<Scene3DResourceLoadProgress>) => void>();
    connectSignal(progress, (event) => events.push({ ...event }));

    await loadScene3DResources(scene.root, resolver, { progress, select: (texture) => texture === selected });

    expect(selected.image).toBe(fakeImage);
    expect(deferred.image).toBeNull();
    expect(deferred.resource?.state).toBe(ResourceResolutionState.Unresolved);
    expect(fetch).toHaveBeenCalledOnce();
    expect(events.at(-1)).toEqual({ loaded: 1, total: 1 });
    disposeScene3DResourceResolver(resolver);
  });
});

describe('waitForScene3DResourceResolver', () => {
  it('resolves immediately when the resolver has no pending requests', async () => {
    const resolver = createBuiltInScene3DResourceResolver();
    await expect(waitForScene3DResourceResolver(resolver)).resolves.toBeUndefined();
    disposeScene3DResourceResolver(resolver);
  });
});
