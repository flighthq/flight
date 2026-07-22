import { createUnlitMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { setNetBackend } from '@flighthq/net';
import { addNodeChild } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { createMesh, createScene } from '@flighthq/scene';
import { createSceneFrom3ds, parse3ds } from '@flighthq/scene-formats';
import { createTexture } from '@flighthq/texture';
import type { ImageResource, ImageResourceReference, NetResponse, SceneDocument } from '@flighthq/types';
import { ResourceResolutionState, ImageResourceReferenceKind } from '@flighthq/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { load3ds, loadSceneFrom3ds } from './load3ds';
import { createBuiltInSceneResourceResolver, disposeSceneResourceResolver } from './sceneResourceResolver';

vi.mock('@flighthq/scene-formats', () => ({
  createSceneFrom3ds: vi.fn(),
  parse3ds: vi.fn(),
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

describe('load3ds', () => {
  it('fetches the URL as arraybuffer and parses the bytes into a document (no resolution)', async () => {
    const doc = emptyDocument();
    vi.mocked(parse3ds).mockReturnValue(doc);
    setNetBackend({ sendNetRequest: async () => okResponse(new Uint8Array([9, 8]).buffer) });

    const loaded = await load3ds('model.3ds');

    expect(vi.mocked(parse3ds)).toHaveBeenCalledOnce();
    expect(Array.from(vi.mocked(parse3ds).mock.calls[0][0])).toEqual([9, 8]);
    expect(loaded).toBe(doc);
  });
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
    const resolver = createBuiltInSceneResourceResolver({ fetch: async () => fakeImage });

    const loaded = await loadSceneFrom3ds(new Uint8Array([1]), { resolver });

    expect(vi.mocked(createSceneFrom3ds)).toHaveBeenCalledOnce();
    expect(loaded).toBe(scene);
    expect(texture.resource?.state).toBe(ResourceResolutionState.Resolved);
    disposeSceneResourceResolver(resolver);
  });
});
