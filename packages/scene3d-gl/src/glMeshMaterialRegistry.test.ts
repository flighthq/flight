import type { GlMeshMaterialRenderer, Material } from '@flighthq/types/contract';
import { StandardMaterialKind } from '@flighthq/types/contract';

import {
  getGlMeshMaterialRenderer,
  registerGlMeshMaterialRenderer,
  resolveGlMeshMaterialRenderer,
} from './glMeshMaterialRegistry';
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
