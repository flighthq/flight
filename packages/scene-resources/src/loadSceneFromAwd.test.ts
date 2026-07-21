import { createUnlitMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { setNetBackend } from '@flighthq/net';
import { addNodeChild } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { createMesh, createScene } from '@flighthq/scene';
import { createSceneFromAwd, parseAwd } from '@flighthq/scene-formats';
import { createTexture } from '@flighthq/texture';
import type { ImageResource, ImageResourceReference, NetResponse, SceneDocument } from '@flighthq/types';
import { ResourceResolutionState, ImageResourceReferenceKind } from '@flighthq/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadAwd, loadSceneFromAwd } from './loadSceneFromAwd';
import { createSceneResourceResolver, disposeSceneResourceResolver } from './sceneResourceResolver';

vi.mock('@flighthq/scene-formats', () => ({
  createSceneFromAwd: vi.fn(),
  parseAwd: vi.fn(),
}));

const createSceneFromAwdMock = vi.mocked(createSceneFromAwd);
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

function externalRef(): ImageResourceReference {
  return {
    basePath: null,
    kind: ImageResourceReferenceKind.External,
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

function okResponse(body: ArrayBuffer): NetResponse {
  return { body, headers: {}, ok: true, status: 200, statusText: 'OK', url: 'u' };
}

afterEach(() => {
  vi.clearAllMocks();
  setNetBackend(null);
});

describe('loadAwd', () => {
  it('fetches the URL as arraybuffer and parses the bytes into a document (no resolution)', async () => {
    const doc = emptyDocument();
    vi.mocked(parseAwd).mockReturnValue(doc);
    setNetBackend({ sendNetRequest: async () => okResponse(new Uint8Array([5, 6]).buffer) });

    const loaded = await loadAwd('model.awd');

    expect(vi.mocked(parseAwd)).toHaveBeenCalledOnce();
    expect(Array.from(vi.mocked(parseAwd).mock.calls[0][0])).toEqual([5, 6]);
    expect(loaded).toBe(doc);
  });
});

describe('loadSceneFromAwd', () => {
  it('parses then eagerly resolves the scene resources through a supplied resolver', async () => {
    const texture = createTexture({ resource: externalRef() });
    createSceneFromAwdMock.mockReturnValue(fakeParsedScene(texture));
    const resolver = createSceneResourceResolver({ fetch: async () => fakeImage });

    const scene = await loadSceneFromAwd(new Uint8Array([1, 2, 3]), { resolver });

    expect(createSceneFromAwdMock).toHaveBeenCalledOnce();
    expect(scene).toBeDefined();
    expect(texture.image).toBe(fakeImage);
    expect(texture.resource?.state).toBe(ResourceResolutionState.Resolved);
    disposeSceneResourceResolver(resolver);
  });
});
