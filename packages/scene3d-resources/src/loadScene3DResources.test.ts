import { createUnlitMaterial } from '@flighthq/materials/contract';
import { createBoxMeshGeometry } from '@flighthq/mesh/contract';
import { addNodeChild } from '@flighthq/node/contract';
import { createMesh, createScene3D } from '@flighthq/scene3d/contract';
import { connectSignal, createSignal } from '@flighthq/signals/contract';
import { createTexture, getTextureSource } from '@flighthq/texture/contract';
import type {
  ImageResource,
  ImageResourceReference,
  Scene3DResourceLoadProgress,
  Texture,
} from '@flighthq/types/contract';
import { EntityRuntimeKey, ResourceResolutionState, ImageResourceReferenceKind } from '@flighthq/types/contract';
import { describe, expect, it, vi } from 'vitest';

import { loadScene3DResources, waitForScene3DResourceResolver } from './loadScene3DResources';
import { createBuiltInScene3DResourceResolver, disposeScene3DResourceResolver } from './sceneResourceResolver';

const fakeImage = { height: 1, width: 1 } as unknown as ImageResource;
const testResources: ImageResourceReference[] = [];
let sceneResources: ImageResourceReference[] = [];

function externalRef(): ImageResourceReference {
  const ref: ImageResourceReference = {
    [EntityRuntimeKey]: undefined,
    basePath: null,
    failure: null,
    kind: ImageResourceReferenceKind.External,
    mimeType: null,
    state: ResourceResolutionState.Unresolved,
    uri: 'leaf.png',
  };
  testResources.push(ref);
  return ref;
}

// Hands the scene only the references its own test created, then drains the accumulator. Copying the
// whole accumulator used to give every scene the previous tests' references as well — harmless only
// while discovery narrowed by mesh attachment and quietly dropped whatever no mesh referenced.
function configureResources(scene: ReturnType<typeof createScene3D>): void {
  sceneResources = testResources.slice();
  testResources.length = 0;
  scene.resources = sceneResources;
}

function resourceOf(texture: Texture): ImageResourceReference | undefined {
  return sceneResources.find((ref) => ref.textures?.includes(texture) === true);
}

describe('loadScene3DResources', () => {
  it('awaits every started load so the scene is fully resolved on return', async () => {
    const fetch = vi.fn(async () => fakeImage);
    const a = createTexture({ resource: externalRef() });
    const b = createTexture({ resource: externalRef() });
    const scene = createScene3D();
    configureResources(scene);
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: a })]));
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: b })]));
    const resolver = createBuiltInScene3DResourceResolver({ fetch });

    await loadScene3DResources(scene, resolver);

    expect(getTextureSource(a)).toBe(fakeImage);
    expect(getTextureSource(b)).toBe(fakeImage);
    expect(resourceOf(a)?.state).toBe(ResourceResolutionState.Resolved);
    disposeScene3DResourceResolver(resolver);
  });

  it('resolves immediately when there is nothing pending', async () => {
    const scene = createScene3D();
    configureResources(scene);
    const resolver = createBuiltInScene3DResourceResolver({ fetch: async () => fakeImage });
    await expect(loadScene3DResources(scene, resolver)).resolves.toBeUndefined();
    disposeScene3DResourceResolver(resolver);
  });

  it('reports operation-scoped progress as unique references settle', async () => {
    const a = createTexture({ resource: externalRef() });
    const b = createTexture({ resource: externalRef() });
    const scene = createScene3D();
    configureResources(scene);
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: a })]));
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: b })]));
    const resolver = createBuiltInScene3DResourceResolver({ fetch: async () => fakeImage });
    const events: Scene3DResourceLoadProgress[] = [];
    const progress = createSignal<(event: Readonly<Scene3DResourceLoadProgress>) => void>();
    connectSignal(progress, (event) => events.push({ ...event }));

    await loadScene3DResources(scene, resolver, { progress });

    expect(events[0]).toEqual({ loaded: 0, total: 2 });
    expect(events.at(-1)).toEqual({ loaded: 2, total: 2 });
    disposeScene3DResourceResolver(resolver);
  });

  it('counts failed references as terminal without hiding their failure state', async () => {
    const texture = createTexture({ resource: externalRef() });
    const scene = createScene3D();
    configureResources(scene);
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: texture })]));
    const resolver = createBuiltInScene3DResourceResolver({ fetch: async () => null });
    const events: Scene3DResourceLoadProgress[] = [];
    const progress = createSignal<(event: Readonly<Scene3DResourceLoadProgress>) => void>();
    connectSignal(progress, (event) => events.push({ ...event }));

    await loadScene3DResources(scene, resolver, { progress });

    expect(getTextureSource(texture)).toBeNull();
    expect(resourceOf(texture)?.state).toBe(ResourceResolutionState.Failed);
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
    configureResources(scene);
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: selected })]));
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: deferred })]));
    const fetch = vi.fn(async () => fakeImage);
    const resolver = createBuiltInScene3DResourceResolver({ fetch });
    const events: Scene3DResourceLoadProgress[] = [];
    const progress = createSignal<(event: Readonly<Scene3DResourceLoadProgress>) => void>();
    connectSignal(progress, (event) => events.push({ ...event }));

    await loadScene3DResources(scene, resolver, { progress, select: (texture) => texture === selected });

    expect(getTextureSource(selected)).toBe(fakeImage);
    expect(getTextureSource(deferred)).toBeNull();
    expect(resourceOf(deferred)?.state).toBe(ResourceResolutionState.Unresolved);
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
