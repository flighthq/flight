import { createUnlitMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { setNetBackend } from '@flighthq/net';
import { addNodeChild } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { createMesh, createScene } from '@flighthq/scene';
import {
  createSceneFromGlb,
  createSceneFromGltf,
  createScenesFromGlb,
  createScenesFromGltf,
  parseGlb,
  parseGltf,
} from '@flighthq/scene-formats';
import { createTexture } from '@flighthq/texture';
import type { ImageResource, ImageResourceReference, NetResponse, SceneDocument } from '@flighthq/types';
import { ResourceResolutionState, ImageResourceReferenceKind } from '@flighthq/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  loadGlb,
  loadGltf,
  loadSceneFromGlb,
  loadSceneFromGltf,
  loadScenesFromGlb,
  loadScenesFromGltf,
} from './loadGltf';
import { createBuiltInSceneResourceResolver, disposeSceneResourceResolver } from './sceneResourceResolver';

vi.mock('@flighthq/scene-formats', () => ({
  createSceneFromGlb: vi.fn(),
  createSceneFromGltf: vi.fn(),
  createScenesFromGlb: vi.fn(),
  createScenesFromGltf: vi.fn(),
  parseGlb: vi.fn(),
  parseGltf: vi.fn(),
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

function okResponse(body: string | ArrayBuffer): NetResponse {
  return { body, headers: {}, ok: true, status: 200, statusText: 'OK', url: 'u' };
}

function externalRef(): ImageResourceReference {
  return {
    basePath: null,
    kind: ImageResourceReferenceKind.External,
    mimeType: null,
    state: ResourceResolutionState.Unresolved,
    uri: 'tex.png',
  };
}

function sceneWithTexture(): { scene: Scene; texture: ReturnType<typeof createTexture> } {
  const texture = createTexture({ resource: externalRef() });
  const scene = createScene();
  addNodeChild(scene.root, createMesh(createBoxMeshGeometry(), [createUnlitMaterial({ baseColorMap: texture })]));
  return { scene: scene as Scene, texture };
}

function withResolver(): ReturnType<typeof createBuiltInSceneResourceResolver> {
  return createBuiltInSceneResourceResolver({ fetch: async () => fakeImage });
}

afterEach(() => {
  vi.clearAllMocks();
  setNetBackend(null);
});

describe('loadGlb', () => {
  it('fetches the URL as arraybuffer and parses the bytes into a document (no resolution)', async () => {
    const doc = emptyDocument();
    vi.mocked(parseGlb).mockReturnValue(doc);
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    let requestedType: string | undefined;
    setNetBackend({
      sendNetRequest: async (request) => {
        requestedType = request.responseType;
        return okResponse(buffer);
      },
    });

    const loaded = await loadGlb('model.glb');

    expect(requestedType).toBe('arraybuffer');
    expect(vi.mocked(parseGlb)).toHaveBeenCalledOnce();
    expect(Array.from(vi.mocked(parseGlb).mock.calls[0][0])).toEqual([1, 2, 3]);
    expect(loaded).toBe(doc);
  });

  it('returns an empty document without parsing on a fetch failure', async () => {
    setNetBackend({
      sendNetRequest: async () => ({ body: null, headers: {}, ok: false, status: 404, statusText: 'x', url: 'u' }),
    });
    const warnings: string[] = [];
    const loaded = await loadGlb('missing.glb', warnings);
    expect(vi.mocked(parseGlb)).not.toHaveBeenCalled();
    expect(loaded.nodes).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe('loadGltf', () => {
  it('fetches the URL as text and parses the source into a document (no resolution)', async () => {
    const doc = emptyDocument();
    vi.mocked(parseGltf).mockReturnValue(doc);
    let requestedType: string | undefined;
    setNetBackend({
      sendNetRequest: async (request) => {
        requestedType = request.responseType;
        return okResponse('{"asset":{"version":"2.0"}}');
      },
    });

    const loaded = await loadGltf('model.gltf');

    expect(requestedType).toBe('text');
    expect(vi.mocked(parseGltf)).toHaveBeenCalledOnce();
    expect(vi.mocked(parseGltf).mock.calls[0][0]).toBe('{"asset":{"version":"2.0"}}');
    expect(loaded).toBe(doc);
  });
});

describe('loadSceneFromGlb', () => {
  it('parses a GLB into its default scene and resolves its textures', async () => {
    const { scene, texture } = sceneWithTexture();
    vi.mocked(createSceneFromGlb).mockReturnValue(scene);
    const resolver = withResolver();

    const loaded = await loadSceneFromGlb(new Uint8Array([1]), { resolver });

    expect(vi.mocked(createSceneFromGlb)).toHaveBeenCalledOnce();
    expect(loaded).toBe(scene);
    expect(texture.resource?.state).toBe(ResourceResolutionState.Resolved);
    disposeSceneResourceResolver(resolver);
  });
});

describe('loadSceneFromGltf', () => {
  it('parses a glTF document into its default scene and resolves its textures', async () => {
    const { scene, texture } = sceneWithTexture();
    vi.mocked(createSceneFromGltf).mockReturnValue(scene);
    const resolver = withResolver();

    await loadSceneFromGltf({ asset: { version: '2.0' } }, { resolver });

    expect(vi.mocked(createSceneFromGltf)).toHaveBeenCalledOnce();
    expect(texture.resource?.state).toBe(ResourceResolutionState.Resolved);
    disposeSceneResourceResolver(resolver);
  });
});

describe('loadScenesFromGlb', () => {
  it('parses a GLB into all its scenes and resolves their textures', async () => {
    const { scene, texture } = sceneWithTexture();
    vi.mocked(createScenesFromGlb).mockReturnValue([scene]);
    const resolver = withResolver();

    const loaded = await loadScenesFromGlb(new Uint8Array([1]), { resolver });

    expect(vi.mocked(createScenesFromGlb)).toHaveBeenCalledOnce();
    expect(loaded).toEqual([scene]);
    expect(texture.resource?.state).toBe(ResourceResolutionState.Resolved);
    disposeSceneResourceResolver(resolver);
  });
});

describe('loadScenesFromGltf', () => {
  it('parses a glTF document into all its scenes and resolves their textures', async () => {
    const { scene, texture } = sceneWithTexture();
    vi.mocked(createScenesFromGltf).mockReturnValue([scene]);
    const resolver = withResolver();

    const loaded = await loadScenesFromGltf({ asset: { version: '2.0' } }, { resolver });

    expect(vi.mocked(createScenesFromGltf)).toHaveBeenCalledOnce();
    expect(loaded).toEqual([scene]);
    expect(texture.resource?.state).toBe(ResourceResolutionState.Resolved);
    disposeSceneResourceResolver(resolver);
  });
});
