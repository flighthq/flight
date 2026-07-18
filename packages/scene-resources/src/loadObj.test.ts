import { createUnlitMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { createMesh, createScene } from '@flighthq/scene';
import { createSceneFromObj } from '@flighthq/scene-formats';
import { createTexture } from '@flighthq/texture';
import type { ImageResource, SceneResourceRef } from '@flighthq/types';
import { ResourceResolutionState, SceneResourceRefKind } from '@flighthq/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadSceneFromObj } from './loadObj';
import { createSceneResourceResolver, disposeSceneResourceResolver } from './sceneResourceResolver';

vi.mock('@flighthq/scene-formats', () => ({
  createSceneFromObj: vi.fn(),
}));

const fakeImage = { height: 1, width: 1 } as unknown as ImageResource;

describe('loadSceneFromObj', () => {
  it('parses OBJ and resolves the MTL material textures', async () => {
    const ref: SceneResourceRef = {
      basePath: null,
      kind: SceneResourceRefKind.External,
      mimeType: null,
      state: ResourceResolutionState.Unresolved,
      uri: 'wood.png',
    };
    const texture = createTexture({ resource: ref });
    const scene = createScene();
    addNodeChild(scene, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: texture })]));
    vi.mocked(createSceneFromObj).mockReturnValue(scene as Scene);
    const resolver = createSceneResourceResolver({ fetch: async () => fakeImage });

    const loaded = await loadSceneFromObj('v 0 0 0', undefined, { resolver });

    expect(vi.mocked(createSceneFromObj)).toHaveBeenCalledOnce();
    expect(loaded).toBe(scene);
    expect(texture.resource?.state).toBe(ResourceResolutionState.Resolved);
    disposeSceneResourceResolver(resolver);
  });
});

afterEach(() => {
  vi.clearAllMocks();
});
