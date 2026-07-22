import { createUnlitMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { setNetBackend } from '@flighthq/net';
import { addNodeChild } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { createMesh, createScene } from '@flighthq/scene';
import { createSceneFromMd5Mesh, parseMd5Mesh } from '@flighthq/scene-formats';
import { createTexture } from '@flighthq/texture';
import type { ImageResource, ImageResourceReference, NetResponse, SceneDocument } from '@flighthq/types';
import { ResourceResolutionState, ImageResourceReferenceKind } from '@flighthq/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadMd5Mesh, loadSceneFromMd5Mesh } from './loadMd5';
import { createBuiltInSceneResourceResolver, disposeSceneResourceResolver } from './sceneResourceResolver';

vi.mock('@flighthq/scene-formats', () => ({
  createSceneFromMd5Mesh: vi.fn(),
  parseMd5Mesh: vi.fn(),
}));

const fakeImage = { height: 1, width: 1 } as unknown as ImageResource;

function emptyDocument(): SceneDocument {
  return {
    animations: [],
    cameras: [],
    lights: [],
    materials: [],
    meshes: [],
    metadata: null,
    nodes: [],
    resources: [],
    scenes: [],
    skins: [],
  };
}

function okResponse(body: string): NetResponse {
  return { body, headers: {}, ok: true, status: 200, statusText: 'OK', url: 'u' };
}

function sceneWithTexture(): { scene: Scene; texture: ReturnType<typeof createTexture> } {
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
  return { scene: scene as Scene, texture };
}

afterEach(() => {
  vi.clearAllMocks();
  setNetBackend(null);
});

describe('loadMd5Mesh', () => {
  it('fetches the URL as text and parses the source into a document (no resolution)', async () => {
    const doc = emptyDocument();
    vi.mocked(parseMd5Mesh).mockReturnValue(doc);
    let requestedType: string | undefined;
    setNetBackend({
      sendNetRequest: async (request) => {
        requestedType = request.responseType;
        return okResponse('MD5Version 10');
      },
    });

    const loaded = await loadMd5Mesh('model.md5mesh');

    expect(requestedType).toBe('text');
    expect(vi.mocked(parseMd5Mesh)).toHaveBeenCalledOnce();
    expect(vi.mocked(parseMd5Mesh).mock.calls[0][0]).toBe('MD5Version 10');
    expect(loaded).toBe(doc);
  });
});

describe('loadSceneFromMd5Mesh', () => {
  it('parses the mesh (+ optional anim) into a scene and resolves its shader textures', async () => {
    const { scene, texture } = sceneWithTexture();
    vi.mocked(createSceneFromMd5Mesh).mockReturnValue(scene);
    const resolver = createBuiltInSceneResourceResolver({ fetch: async () => fakeImage });

    const loaded = await loadSceneFromMd5Mesh('meshsrc', { resolver });

    expect(loaded).toBe(scene);
    expect(vi.mocked(createSceneFromMd5Mesh)).toHaveBeenCalledWith('meshsrc');
    expect(texture.resource?.state).toBe(ResourceResolutionState.Resolved);
    disposeSceneResourceResolver(resolver);
  });
});
