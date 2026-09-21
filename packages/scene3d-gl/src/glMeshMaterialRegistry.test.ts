import { getRegistryTableEntry } from '@flighthq/registry/contract';
import {
  allocateEmptyGlRenderRegistries,
  getGlRenderStateRuntime,
  registerGlQuadMaterialRenderer,
  resolveGlQuadMaterialRenderer,
} from '@flighthq/render-gl/contract';
import type { GlMeshMaterialRenderer, GlQuadMaterialRenderer, Material } from '@flighthq/types/contract';
import { StandardMaterialKind } from '@flighthq/types/contract';

import {
  getGlMeshMaterialRenderer,
  registerGlMeshMaterialRenderer,
  resolveGlMeshMaterialRenderer,
} from './glMeshMaterialRegistry';
import { getGlScene3DRuntime } from './glScene3DRuntime';
import { makeGlScene3DState } from './glScene3DTestHelper';

const TestKind = 'TestMeshMaterial';
const renderer: GlMeshMaterialRenderer = { bind() {}, draw() {} };

function makeMaterial(kind: string): Material {
  return { kind } as Material;
}

describe('getGlMeshMaterialRenderer', () => {
  it('returns null when nothing is registered for the kind', () => {
    const { state } = makeGlScene3DState();
    expect(getGlMeshMaterialRenderer(state, TestKind)).toBeNull();
  });
});

describe('registerGlMeshMaterialRenderer', () => {
  it('registers a renderer retrievable by kind', () => {
    const { state } = makeGlScene3DState();
    registerGlMeshMaterialRenderer(state, TestKind, renderer);
    expect(getGlMeshMaterialRenderer(state, TestKind)).toBe(renderer);
  });

  it('replaces the persistent table while an explicitly copied state retains its snapshot', () => {
    const { state: screen } = makeGlScene3DState();
    const replacement: GlMeshMaterialRenderer = { bind() {}, draw() {} };
    registerGlMeshMaterialRenderer(screen, TestKind, renderer);
    const snapshot = getGlRenderStateRuntime(screen).registries.materialRenderers;
    const { state: derived } = makeGlScene3DState(undefined, { ...getGlRenderStateRuntime(screen).registries });

    getGlScene3DRuntime(derived);
    registerGlMeshMaterialRenderer(screen, TestKind, replacement);

    expect(getGlRenderStateRuntime(derived).registries.materialRenderers).toBe(snapshot);
    expect(getGlRenderStateRuntime(screen).registries.materialRenderers).not.toBe(snapshot);
    expect(getRegistryTableEntry(snapshot, TestKind)).toBe(renderer);
    expect(getGlMeshMaterialRenderer(derived, TestKind)).toBe(renderer);
    expect(getGlMeshMaterialRenderer(screen, TestKind)).toBe(replacement);
  });
});

describe('resolveGlMeshMaterialRenderer', () => {
  it('returns null when nothing is registered — no built-in fallback', () => {
    const { state } = makeGlScene3DState();
    expect(resolveGlMeshMaterialRenderer(state, null)).toBeNull();
    expect(resolveGlMeshMaterialRenderer(state, makeMaterial(TestKind))).toBeNull();
  });

  it('resolves by the material kind', () => {
    const { state } = makeGlScene3DState();
    registerGlMeshMaterialRenderer(state, TestKind, renderer);
    expect(resolveGlMeshMaterialRenderer(state, makeMaterial(TestKind))).toBe(renderer);
  });

  it('falls back to the StandardMaterialKind renderer', () => {
    const { state } = makeGlScene3DState();
    registerGlMeshMaterialRenderer(state, StandardMaterialKind, renderer);
    expect(resolveGlMeshMaterialRenderer(state, makeMaterial('Other'))).toBe(renderer);
    expect(resolveGlMeshMaterialRenderer(state, null)).toBe(renderer);
  });
});

describe('shared materialRenderers storage', () => {
  const quadRenderer: GlQuadMaterialRenderer = { instanceFloatCount: 0, bind() {} };
  const meshRenderer: GlMeshMaterialRenderer = { bind() {}, draw() {} };
  const QuadKind = 'TestQuadMaterial';
  const MeshKind = 'TestMeshMaterial';

  it('holds quad and mesh entries in the same table', () => {
    const { state } = makeGlScene3DState();
    registerGlQuadMaterialRenderer(state, QuadKind, quadRenderer);
    registerGlMeshMaterialRenderer(state, MeshKind, meshRenderer);

    const table = getGlRenderStateRuntime(state).registries.materialRenderers;
    expect(table.entries.has(QuadKind)).toBe(true);
    expect(table.entries.has(MeshKind)).toBe(true);
  });

  it('typed resolvers return the correct protocol from shared storage', () => {
    const { state } = makeGlScene3DState();
    registerGlQuadMaterialRenderer(state, QuadKind, quadRenderer);
    registerGlMeshMaterialRenderer(state, MeshKind, meshRenderer);

    expect(resolveGlQuadMaterialRenderer(state, makeMaterial(QuadKind))).toBe(quadRenderer);
    expect(resolveGlMeshMaterialRenderer(state, makeMaterial(MeshKind))).toBe(meshRenderer);
  });

  it('neither registrar shadows the other — both entries survive in the shared table', () => {
    const { state } = makeGlScene3DState();
    registerGlQuadMaterialRenderer(state, QuadKind, quadRenderer);
    registerGlMeshMaterialRenderer(state, MeshKind, meshRenderer);

    const table = getGlRenderStateRuntime(state).registries.materialRenderers;
    expect(table.entries.size).toBe(2);
    expect(getRegistryTableEntry(table, QuadKind)).toBe(quadRenderer);
    expect(getRegistryTableEntry(table, MeshKind)).toBe(meshRenderer);
  });
});
