import { createUnlitMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { setNetBackend } from '@flighthq/net';
import { addNodeChild } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { createMesh, createScene } from '@flighthq/scene';
import { createSceneFromObj, parseObj } from '@flighthq/scene-formats';
import { createTexture } from '@flighthq/texture';
import type { ImageResource, ImageResourceReference, NetResponse, SceneDocument } from '@flighthq/types';
import { ResourceResolutionState, ImageResourceReferenceKind } from '@flighthq/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadObj, loadSceneFromObj } from './loadObj';
import { createBuiltInSceneResourceResolver, disposeSceneResourceResolver } from './sceneResourceResolver';

vi.mock('@flighthq/scene-formats', () => ({
  createSceneFromObj: vi.fn(),
  parseObj: vi.fn(),
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

afterEach(() => {
  vi.clearAllMocks();
  setNetBackend(null);
});

describe('loadObj', () => {
  it('fetches the URL as text and parses the source into a document (no resolution)', async () => {
    const doc = emptyDocument();
    vi.mocked(parseObj).mockReturnValue(doc);
    let requestedType: string | undefined;
    setNetBackend({
      sendNetRequest: async (request) => {
        requestedType = request.responseType;
        return okResponse('v 0 0 0');
      },
    });

    const loaded = await loadObj('model.obj');

    expect(requestedType).toBe('text');
    expect(vi.mocked(parseObj)).toHaveBeenCalledOnce();
    expect(vi.mocked(parseObj).mock.calls[0][0]).toBe('v 0 0 0');
    expect(loaded).toBe(doc);
  });
});

describe('loadSceneFromObj', () => {
  it('parses OBJ and resolves the MTL material textures', async () => {
    const ref: ImageResourceReference = {
      basePath: null,
      failure: null,
      kind: ImageResourceReferenceKind.External,
      mimeType: null,
      state: ResourceResolutionState.Unresolved,
      uri: 'wood.png',
    };
    const texture = createTexture({ resource: ref });
    const scene = createScene();
    addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: texture })]));
    vi.mocked(createSceneFromObj).mockReturnValue(scene as Scene);
    const resolver = createBuiltInSceneResourceResolver({ fetch: async () => fakeImage });

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
