import { createStandardPbrMaterial } from '@flighthq/materials/contract';
import {
  getWgpuRenderStateRuntime,
  registerWgpuQuadMaterialRenderer,
  resolveWgpuQuadMaterialRenderer,
} from '@flighthq/render-wgpu/contract';
import type { Material, WgpuMeshMaterialRenderer, WgpuQuadMaterialRenderer } from '@flighthq/types/contract';
import { StandardMaterialKind, StandardPbrMaterialKind } from '@flighthq/types/contract';

import {
  getWgpuMeshMaterialRenderer,
  registerWgpuMeshMaterialRenderer,
  resolveWgpuMeshMaterialRenderer,
} from './wgpuMeshMaterialRegistry.ts';
import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime.ts';
import { makeWgpuScene3DState } from './wgpuScene3DTestHelper.ts';

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

  it('replaces the persistent table while an explicit pipeline state retains its snapshot', () => {
    const { state: screen } = makeWgpuScene3DState();
    const renderer = makeRenderer();
    const replacement = makeRenderer();
    registerWgpuMeshMaterialRenderer(screen, StandardPbrMaterialKind, renderer);
    const snapshot = getWgpuRenderStateRuntime(screen).registries.materialRenderers;
    const { state: derived } = makeWgpuScene3DState({ ...getWgpuRenderStateRuntime(screen).registries });

    getWgpuScene3DRuntime(derived);
    registerWgpuMeshMaterialRenderer(screen, StandardPbrMaterialKind, replacement);

    expect(getWgpuRenderStateRuntime(derived).registries.materialRenderers).not.toBe(snapshot);
    expect(getWgpuRenderStateRuntime(screen).registries.materialRenderers).not.toBe(snapshot);
    expect(snapshot.get(StandardPbrMaterialKind) ?? null).toBe(renderer);
    expect(getWgpuMeshMaterialRenderer(derived, StandardPbrMaterialKind)).toBe(renderer);
    expect(getWgpuMeshMaterialRenderer(screen, StandardPbrMaterialKind)).toBe(replacement);
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

describe('shared materialRenderers storage', () => {
  const quadRenderer: WgpuQuadMaterialRenderer = {
    instanceFloatCount: 0,
    getShaderModule: () => null as unknown as GPUShaderModule,
  };
  const meshRenderer: WgpuMeshMaterialRenderer = { bind() {}, draw() {} };
  const QuadKind = 'TestQuadMaterial';
  const MeshKind = 'TestMeshMaterial';

  function makeMaterial(kind: string): Material {
    return { kind } as Material;
  }

  it('holds quad and mesh entries in the same table', () => {
    const { state } = makeWgpuScene3DState();
    registerWgpuQuadMaterialRenderer(state, QuadKind, quadRenderer);
    registerWgpuMeshMaterialRenderer(state, MeshKind, meshRenderer);

    const table = getWgpuRenderStateRuntime(state).registries.materialRenderers;
    expect(table.has(QuadKind)).toBe(true);
    expect(table.has(MeshKind)).toBe(true);
  });

  it('typed resolvers return the correct protocol from shared storage', () => {
    const { state } = makeWgpuScene3DState();
    registerWgpuQuadMaterialRenderer(state, QuadKind, quadRenderer);
    registerWgpuMeshMaterialRenderer(state, MeshKind, meshRenderer);

    expect(resolveWgpuQuadMaterialRenderer(state, makeMaterial(QuadKind))).toBe(quadRenderer);
    expect(resolveWgpuMeshMaterialRenderer(state, makeMaterial(MeshKind))).toBe(meshRenderer);
  });

  it('neither registrar shadows the other — both entries survive in the shared table', () => {
    const { state } = makeWgpuScene3DState();
    registerWgpuQuadMaterialRenderer(state, QuadKind, quadRenderer);
    registerWgpuMeshMaterialRenderer(state, MeshKind, meshRenderer);

    const table = getWgpuRenderStateRuntime(state).registries.materialRenderers;
    expect(table.size).toBe(2);
    expect(table.get(QuadKind) ?? null).toBe(quadRenderer);
    expect(table.get(MeshKind) ?? null).toBe(meshRenderer);
  });
});
