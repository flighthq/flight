import { createStandardPbrMaterial } from '@flighthq/materials';
import type { WgpuMeshMaterialRenderer } from '@flighthq/types';
import { DefaultMaterialKind, StandardPbrMaterialKind } from '@flighthq/types';

import {
  getWgpuMeshMaterialRenderer,
  registerWgpuMeshMaterialRenderer,
  resolveWgpuMeshMaterialRenderer,
} from './webgpuMeshMaterialRegistry';
import { makeWgpuSceneState } from './webgpuSceneTestHelper';

function makeRenderer(): WgpuMeshMaterialRenderer {
  return { bind: () => {}, draw: () => {} };
}

describe('getWgpuMeshMaterialRenderer', () => {
  it('returns a registered renderer by kind, else null', () => {
    const { state } = makeWgpuSceneState();
    const renderer = makeRenderer();
    expect(getWgpuMeshMaterialRenderer(state, StandardPbrMaterialKind)).toBeNull();
    registerWgpuMeshMaterialRenderer(state, StandardPbrMaterialKind, renderer);
    expect(getWgpuMeshMaterialRenderer(state, StandardPbrMaterialKind)).toBe(renderer);
  });
});

describe('registerWgpuMeshMaterialRenderer', () => {
  it('registers a renderer in the scene-wgpu 3D registry', () => {
    const { state } = makeWgpuSceneState();
    const renderer = makeRenderer();
    registerWgpuMeshMaterialRenderer(state, StandardPbrMaterialKind, renderer);
    expect(getWgpuMeshMaterialRenderer(state, StandardPbrMaterialKind)).toBe(renderer);
  });
});

describe('resolveWgpuMeshMaterialRenderer', () => {
  it('resolves by the material kind', () => {
    const { state } = makeWgpuSceneState();
    const renderer = makeRenderer();
    registerWgpuMeshMaterialRenderer(state, StandardPbrMaterialKind, renderer);
    expect(resolveWgpuMeshMaterialRenderer(state, createStandardPbrMaterial())).toBe(renderer);
  });

  it('falls back to DefaultMaterialKind for an unregistered kind or null material', () => {
    const { state } = makeWgpuSceneState();
    const fallback = makeRenderer();
    registerWgpuMeshMaterialRenderer(state, DefaultMaterialKind, fallback);
    expect(resolveWgpuMeshMaterialRenderer(state, createStandardPbrMaterial())).toBe(fallback);
    expect(resolveWgpuMeshMaterialRenderer(state, null)).toBe(fallback);
  });

  it('returns null when neither the kind nor the default is registered', () => {
    const { state } = makeWgpuSceneState();
    expect(resolveWgpuMeshMaterialRenderer(state, createStandardPbrMaterial())).toBeNull();
  });
});
