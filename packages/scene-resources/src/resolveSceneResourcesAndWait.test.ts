import { createUnlitMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import { createMesh, createScene } from '@flighthq/scene';
import { createTexture } from '@flighthq/texture';
import type { ImageResource, ImageResourceReference } from '@flighthq/types';
import { ResourceResolutionState, ImageResourceReferenceKind } from '@flighthq/types';
import { describe, expect, it, vi } from 'vitest';

import { resolveSceneResourcesAndWait } from './resolveSceneResourcesAndWait';
import { createSceneResourceResolver, disposeSceneResourceResolver } from './sceneResourceResolver';

const fakeImage = { height: 1, width: 1 } as unknown as ImageResource;

function externalRef(): ImageResourceReference {
  return {
    basePath: null,
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
    const resolver = createSceneResourceResolver({ fetch });

    await resolveSceneResourcesAndWait(scene.root, resolver);

    expect(a.image).toBe(fakeImage);
    expect(b.image).toBe(fakeImage);
    expect(a.resource?.state).toBe(ResourceResolutionState.Resolved);
    expect(resolver.inFlight.size).toBe(0);
    disposeSceneResourceResolver(resolver);
  });

  it('resolves immediately when there is nothing pending', async () => {
    const scene = createScene();
    const resolver = createSceneResourceResolver({ fetch: async () => fakeImage });
    await expect(resolveSceneResourcesAndWait(scene.root, resolver)).resolves.toBeUndefined();
    disposeSceneResourceResolver(resolver);
  });
});
