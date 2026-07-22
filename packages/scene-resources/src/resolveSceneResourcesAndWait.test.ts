import { createUnlitMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import { createMesh, createScene } from '@flighthq/scene';
import { createTexture } from '@flighthq/texture';
import type { ImageResource, ImageResourceReference } from '@flighthq/types';
import { ResourceResolutionState, ImageResourceReferenceKind } from '@flighthq/types';
import { describe, expect, it, vi } from 'vitest';

import { resolveSceneResourcesAndWait, waitForSceneResourceResolver } from './resolveSceneResourcesAndWait';
import { createBuiltInSceneResourceResolver, disposeSceneResourceResolver } from './sceneResourceResolver';

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

describe('resolveSceneResourcesAndWait', () => {
  it('awaits every started load so the scene is fully resolved on return', async () => {
    const fetch = vi.fn(async () => fakeImage);
    const a = createTexture({ resource: externalRef() });
    const b = createTexture({ resource: externalRef() });
    const scene = createScene();
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: a })]));
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: b })]));
    const resolver = createBuiltInSceneResourceResolver({ fetch });

    await resolveSceneResourcesAndWait(scene.root, resolver);

    expect(a.image).toBe(fakeImage);
    expect(b.image).toBe(fakeImage);
    expect(a.resource?.state).toBe(ResourceResolutionState.Resolved);
    disposeSceneResourceResolver(resolver);
  });

  it('resolves immediately when there is nothing pending', async () => {
    const scene = createScene();
    const resolver = createBuiltInSceneResourceResolver({ fetch: async () => fakeImage });
    await expect(resolveSceneResourcesAndWait(scene.root, resolver)).resolves.toBeUndefined();
    disposeSceneResourceResolver(resolver);
  });
});

describe('waitForSceneResourceResolver', () => {
  it('resolves immediately when the resolver has no pending requests', async () => {
    const resolver = createBuiltInSceneResourceResolver();
    await expect(waitForSceneResourceResolver(resolver)).resolves.toBeUndefined();
    disposeSceneResourceResolver(resolver);
  });
});
