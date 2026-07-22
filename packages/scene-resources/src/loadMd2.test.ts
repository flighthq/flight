import { createUnlitMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { setNetBackend } from '@flighthq/net';
import { addNodeChild } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { createMesh, createScene } from '@flighthq/scene';
import { createSceneFromMd2, parseMd2 } from '@flighthq/scene-formats';
import { createTexture } from '@flighthq/texture';
import type { ImageResource, ImageResourceReference, NetResponse, SceneDocument } from '@flighthq/types';
import { ResourceResolutionState, ImageResourceReferenceKind } from '@flighthq/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadMd2, loadSceneFromMd2 } from './loadMd2';
import { createBuiltInSceneResourceResolver, disposeSceneResourceResolver } from './sceneResourceResolver';

vi.mock('@flighthq/scene-formats', () => ({
  createSceneFromMd2: vi.fn(),
  parseMd2: vi.fn(),
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

function okResponse(body: ArrayBuffer): NetResponse {
  return { body, headers: {}, ok: true, status: 200, statusText: 'OK', url: 'u' };
}

afterEach(() => {
  vi.clearAllMocks();
  setNetBackend(null);
});

describe('loadMd2', () => {
  it('fetches the URL as arraybuffer and parses the bytes into a document (no resolution)', async () => {
    const doc = emptyDocument();
    vi.mocked(parseMd2).mockReturnValue(doc);
    setNetBackend({ sendNetRequest: async () => okResponse(new Uint8Array([7]).buffer) });

    const loaded = await loadMd2('model.md2');

    expect(vi.mocked(parseMd2)).toHaveBeenCalledOnce();
    expect(Array.from(vi.mocked(parseMd2).mock.calls[0][0])).toEqual([7]);
    expect(loaded).toBe(doc);
  });
});

describe('loadSceneFromMd2', () => {
  it('parses MD2 and resolves its skin texture', async () => {
    const ref: ImageResourceReference = {
      basePath: null,
      failure: null,
      kind: ImageResourceReferenceKind.External,
      mimeType: null,
      state: ResourceResolutionState.Unresolved,
      uri: 'hero.pcx',
    };
    const texture = createTexture({ resource: ref });
    const scene = createScene();
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: texture })]));
    vi.mocked(createSceneFromMd2).mockReturnValue(scene as Scene);
    const resolver = createBuiltInSceneResourceResolver({ fetch: async () => fakeImage });

    const loaded = await loadSceneFromMd2(new Uint8Array([1]), { resolver });

    expect(vi.mocked(createSceneFromMd2)).toHaveBeenCalledOnce();
    expect(loaded).toBe(scene);
    expect(texture.resource?.state).toBe(ResourceResolutionState.Resolved);
    disposeSceneResourceResolver(resolver);
  });
});
