import { createUnlitMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { createMesh, createScene } from '@flighthq/scene';
import { createSceneFrom3ds } from '@flighthq/scene-formats';
import { createTexture } from '@flighthq/texture';
import type { ImageResource, ImageResourceReference } from '@flighthq/types';
import { ResourceResolutionState, ImageResourceReferenceKind } from '@flighthq/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadSceneFrom3ds } from './load3ds';
import { createSceneResourceResolver, disposeSceneResourceResolver } from './sceneResourceResolver';

vi.mock('@flighthq/scene-formats', () => ({
  createSceneFrom3ds: vi.fn(),
}));

const fakeImage = { height: 1, width: 1 } as unknown as ImageResource;

afterEach(() => {
  vi.clearAllMocks();
});

describe('loadSceneFrom3ds', () => {
  it('parses 3DS and resolves its material textures', async () => {
    const ref: ImageResourceReference = {
      basePath: null,
      kind: ImageResourceReferenceKind.External,
      mimeType: null,
      state: ResourceResolutionState.Unresolved,
      uri: 'skin.png',
    };
    const texture = createTexture({ resource: ref });
    const scene = createScene();
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: texture })]));
    vi.mocked(createSceneFrom3ds).mockReturnValue(scene as Scene);
    const resolver = createSceneResourceResolver({ fetch: async () => fakeImage });

    const loaded = await loadSceneFrom3ds(new Uint8Array([1]), { resolver });

    expect(vi.mocked(createSceneFrom3ds)).toHaveBeenCalledOnce();
    expect(loaded).toBe(scene);
    expect(texture.resource?.state).toBe(ResourceResolutionState.Resolved);
    disposeSceneResourceResolver(resolver);
  });
});
