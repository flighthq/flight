import { createStandardPbrMaterial } from '@flighthq/materials/contract';
import type { WgpuMeshMaterialRenderer } from '@flighthq/types/contract';
import { StandardMaterialKind, StandardPbrMaterialKind } from '@flighthq/types/contract';

import {
  getWgpuMeshMaterialRenderer,
  registerWgpuMeshMaterialRenderer,
  resolveWgpuMeshMaterialRenderer,
} from './wgpuMeshMaterialRegistry';
import { makeWgpuScene3DState } from './wgpuScene3DTestHelper';

function makeRenderer(): WgpuMeshMaterialRenderer {
  return { bind: () => {}, draw: () => {} };
}

describe('getWgpuMeshMaterialRenderer', () => {
  it('returns a registered renderer by kind, else null', () => {
    const { state } = makeWgpuScene3DState();
    const renderer = makeRenderer();
    expect(getWgpuMeshMaterialRenderer(state, StandardPbrMaterialKind)).toBeNull();
    registerWgpuMeshMaterialRenderer(state, StandardPbrMaterialKind, renderer);
    expect(getWgpuMeshMaterialRenderer(state, StandardPbrMaterialKind)).toBe(renderer);
  });
});

describe('registerWgpuMeshMaterialRenderer', () => {
  it('registers a renderer in the scene-wgpu 3D registry', () => {
    const { state } = makeWgpuScene3DState();
    const renderer = makeRenderer();
    registerWgpuMeshMaterialRenderer(state, StandardPbrMaterialKind, renderer);
    expect(getWgpuMeshMaterialRenderer(state, StandardPbrMaterialKind)).toBe(renderer);
  });
});

describe('resolveWgpuMeshMaterialRenderer', () => {
  it('resolves by the material kind', () => {
    const { state } = makeWgpuScene3DState();
    const renderer = makeRenderer();
    registerWgpuMeshMaterialRenderer(state, StandardPbrMaterialKind, renderer);
    expect(resolveWgpuMeshMaterialRenderer(state, createStandardPbrMaterial())).toBe(renderer);
  });

  it('falls back to StandardMaterialKind for an unregistered kind or null material', () => {
    const { state } = makeWgpuScene3DState();
    const fallback = makeRenderer();
    registerWgpuMeshMaterialRenderer(state, StandardMaterialKind, fallback);
    expect(resolveWgpuMeshMaterialRenderer(state, createStandardPbrMaterial())).toBe(fallback);
    expect(resolveWgpuMeshMaterialRenderer(state, null)).toBe(fallback);
  });

  it('returns null when neither the kind nor the default is registered', () => {
    const { state } = makeWgpuScene3DState();
    expect(resolveWgpuMeshMaterialRenderer(state, createStandardPbrMaterial())).toBeNull();
  });
});
