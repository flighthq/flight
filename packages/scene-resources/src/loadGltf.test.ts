import { createUnlitMaterial } from '@flighthq/materials';
import { createBoxMeshGeometry } from '@flighthq/mesh';
import { addNodeChild } from '@flighthq/node';
import type { Scene } from '@flighthq/scene';
import { createMesh, createScene } from '@flighthq/scene';
import {
  createSceneFromGlb,
  createSceneFromGltf,
  createScenesFromGlb,
  createScenesFromGltf,
} from '@flighthq/scene-formats';
import { createTexture } from '@flighthq/texture';
import type { ImageResource, SceneResourceRef } from '@flighthq/types';
import { ResourceResolutionState, SceneResourceRefKind } from '@flighthq/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadSceneFromGlb, loadSceneFromGltf, loadScenesFromGlb, loadScenesFromGltf } from './loadGltf';
import { createSceneResourceResolver, disposeSceneResourceResolver } from './sceneResourceResolver';

vi.mock('@flighthq/scene-formats', () => ({
  createSceneFromGlb: vi.fn(),
  createSceneFromGltf: vi.fn(),
  createScenesFromGlb: vi.fn(),
  createScenesFromGltf: vi.fn(),
}));

const fakeImage = { height: 1, width: 1 } as unknown as ImageResource;

function externalRef(): SceneResourceRef {
  return {
    basePath: null,
    kind: SceneResourceRefKind.External,
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

function withResolver(): ReturnType<typeof createSceneResourceResolver> {
  return createSceneResourceResolver({ fetch: async () => fakeImage });
}

afterEach(() => {
  vi.clearAllMocks();
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
