import { createUnlitMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { createMesh, createScene } from '@flighthq/scene';
import { createSceneFromAwd } from '@flighthq/scene-formats';
import { createTexture } from '@flighthq/texture';
import type { ImageResource, SceneResourceRef } from '@flighthq/types';
import { ResourceResolutionState, SceneResourceRefKind } from '@flighthq/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadSceneFromAwd } from './loadSceneFromAwd';
import { createSceneResourceResolver, disposeSceneResourceResolver } from './sceneResourceResolver';

vi.mock('@flighthq/scene-formats', () => ({
  createSceneFromAwd: vi.fn(),
}));

const parseAwd = vi.mocked(createSceneFromAwd);
const fakeImage = { height: 1, width: 1 } as unknown as ImageResource;

function externalRef(): SceneResourceRef {
  return {
    basePath: null,
    kind: SceneResourceRefKind.External,
    mimeType: null,
    state: ResourceResolutionState.Unresolved,
    uri: 'leaf.png',
  };
}

function fakeParsedScene(texture: ReturnType<typeof createTexture>): Scene {
  const scene = createScene();
  addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: texture })]));
  return scene as Scene;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('loadSceneFromAwd', () => {
  it('parses then eagerly resolves the scene resources through a supplied resolver', async () => {
    const texture = createTexture({ resource: externalRef() });
    parseAwd.mockReturnValue(fakeParsedScene(texture));
    const resolver = createSceneResourceResolver({ fetch: async () => fakeImage });

    const scene = await loadSceneFromAwd(new Uint8Array([1, 2, 3]), { resolver });

    expect(parseAwd).toHaveBeenCalledOnce();
    expect(scene).toBeDefined();
    expect(texture.image).toBe(fakeImage);
    expect(texture.resource?.state).toBe(ResourceResolutionState.Resolved);
    disposeSceneResourceResolver(resolver);
  });
});
