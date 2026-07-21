import { createUnlitMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { createMesh, createScene } from '@flighthq/scene';
import { createSceneFromMd2 } from '@flighthq/scene-formats';
import { createTexture } from '@flighthq/texture';
import type { ImageResource, ImageResourceReference } from '@flighthq/types';
import { ResourceResolutionState, ImageResourceReferenceKind } from '@flighthq/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadSceneFromMd2 } from './loadMd2';
import { createSceneResourceResolver, disposeSceneResourceResolver } from './sceneResourceResolver';

vi.mock('@flighthq/scene-formats', () => ({
  createSceneFromMd2: vi.fn(),
}));

const fakeImage = { height: 1, width: 1 } as unknown as ImageResource;

afterEach(() => {
  vi.clearAllMocks();
});

describe('loadSceneFromMd2', () => {
  it('parses MD2 and resolves its skin texture', async () => {
    const ref: ImageResourceReference = {
      basePath: null,
      kind: ImageResourceReferenceKind.External,
      mimeType: null,
      state: ResourceResolutionState.Unresolved,
      uri: 'hero.pcx',
    };
    const texture = createTexture({ resource: ref });
    const scene = createScene();
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: texture })]));
    vi.mocked(createSceneFromMd2).mockReturnValue(scene as Scene);
    const resolver = createSceneResourceResolver({ fetch: async () => fakeImage });

    const loaded = await loadSceneFromMd2(new Uint8Array([1]), { resolver });

    expect(vi.mocked(createSceneFromMd2)).toHaveBeenCalledOnce();
    expect(loaded).toBe(scene);
    expect(texture.resource?.state).toBe(ResourceResolutionState.Resolved);
    disposeSceneResourceResolver(resolver);
  });
});
