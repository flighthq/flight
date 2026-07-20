import { createUnlitMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { createMesh, createScene } from '@flighthq/scene';
import { createSceneFromMd5Mesh } from '@flighthq/scene-formats';
import { createTexture } from '@flighthq/texture';
import type { ImageResource, SceneResourceRef } from '@flighthq/types';
import { ResourceResolutionState, SceneResourceRefKind } from '@flighthq/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadSceneFromMd5Mesh } from './loadMd5';
import { createSceneResourceResolver, disposeSceneResourceResolver } from './sceneResourceResolver';

vi.mock('@flighthq/scene-formats', () => ({
  createSceneFromMd5Mesh: vi.fn(),
}));

const fakeImage = { height: 1, width: 1 } as unknown as ImageResource;

function sceneWithTexture(): { scene: Scene; texture: ReturnType<typeof createTexture> } {
  const ref: SceneResourceRef = {
    basePath: null,
    kind: SceneResourceRefKind.External,
    mimeType: null,
    state: ResourceResolutionState.Unresolved,
    uri: 'skin.png',
  };
  const texture = createTexture({ resource: ref });
  const scene = createScene();
  addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: texture })]));
  return { scene: scene as Scene, texture };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('loadSceneFromMd5Mesh', () => {
  it('parses the mesh (+ optional anim) into a scene and resolves its shader textures', async () => {
    const { scene, texture } = sceneWithTexture();
    vi.mocked(createSceneFromMd5Mesh).mockReturnValue(scene);
    const resolver = createSceneResourceResolver({ fetch: async () => fakeImage });

    const loaded = await loadSceneFromMd5Mesh('meshsrc', 'animsrc', { resolver });

    expect(loaded).toBe(scene);
    expect(vi.mocked(createSceneFromMd5Mesh)).toHaveBeenCalledWith('meshsrc', 'animsrc');
    expect(texture.resource?.state).toBe(ResourceResolutionState.Resolved);
    disposeSceneResourceResolver(resolver);
  });
});
