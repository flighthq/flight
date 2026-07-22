import { createUnlitMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { createMesh, createScene } from '@flighthq/scene';
import { createTexture } from '@flighthq/texture';
import type { ImageResource, ImageResourceReference } from '@flighthq/types';
import { ResourceResolutionState, ImageResourceReferenceKind } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { resolveScenesWithOptions } from './loadSceneOptions';
import { createBuiltInSceneResourceResolver, disposeSceneResourceResolver } from './sceneResourceResolver';

const fakeImage = { height: 1, width: 1 } as unknown as ImageResource;

function externalRef(uri: string): ImageResourceReference {
  return {
    basePath: null,
    failure: null,
    kind: ImageResourceReferenceKind.External,
    mimeType: null,
    state: ResourceResolutionState.Unresolved,
    uri,
  };
}

function sceneWithTexture(uri: string): { scene: Scene; texture: ReturnType<typeof createTexture> } {
  const texture = createTexture({ resource: externalRef(uri) });
  const scene = createScene();
  addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: texture })]));
  return { scene: scene as Scene, texture };
}

describe('resolveScenesWithOptions', () => {
  it('resolves a scene’s external texture refs through a supplied resolver', async () => {
    const { scene, texture } = sceneWithTexture('a.png');
    const resolver = createBuiltInSceneResourceResolver({ fetch: async () => fakeImage });

    await resolveScenesWithOptions([scene], { resolver });

    expect(texture.image).toBe(fakeImage);
    expect(texture.resource?.state).toBe(ResourceResolutionState.Resolved);
    disposeSceneResourceResolver(resolver);
  });

  it('resolves every scene in a multi-scene list through one shared resolver', async () => {
    const a = sceneWithTexture('a.png');
    const b = sceneWithTexture('b.png');
    const resolver = createBuiltInSceneResourceResolver({ fetch: async () => fakeImage });

    await resolveScenesWithOptions([a.scene, b.scene], { resolver });

    expect(a.texture.resource?.state).toBe(ResourceResolutionState.Resolved);
    expect(b.texture.resource?.state).toBe(ResourceResolutionState.Resolved);
    disposeSceneResourceResolver(resolver);
  });

  it('completes with a private resolver when none is supplied and there is nothing to resolve', async () => {
    // A texture-free scene exercises the private-resolver create-and-dispose path without needing a
    // fetch backend: the call must complete without throwing.
    const scene = createScene();
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({})]));
    await expect(resolveScenesWithOptions([scene as Scene])).resolves.toBeUndefined();
  });
});
