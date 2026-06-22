import type { GlMeshMaterialRenderer, Material } from '@flighthq/types';
import { DefaultMaterialKind } from '@flighthq/types';

import {
  getGlMeshMaterialRenderer,
  registerGlMeshMaterialRenderer,
  resolveGlMeshMaterialRenderer,
} from './glMeshMaterialRegistry';
import { makeGlSceneState } from './glSceneTestHelper';

const TestKind: unique symbol = Symbol('TestMeshMaterial');
const renderer: GlMeshMaterialRenderer = { bind() {}, draw() {} };

function makeMaterial(kind: symbol): Material {
  return { kind } as Material;
}

describe('getGlMeshMaterialRenderer', () => {
  it('returns null when nothing is registered for the kind', () => {
    const { state } = makeGlSceneState();
    expect(getGlMeshMaterialRenderer(state, TestKind)).toBeNull();
  });
});

describe('registerGlMeshMaterialRenderer', () => {
  it('registers a renderer retrievable by kind', () => {
    const { state } = makeGlSceneState();
    registerGlMeshMaterialRenderer(state, TestKind, renderer);
    expect(getGlMeshMaterialRenderer(state, TestKind)).toBe(renderer);
  });
});

describe('resolveGlMeshMaterialRenderer', () => {
  it('returns null when nothing is registered — no built-in fallback', () => {
    const { state } = makeGlSceneState();
    expect(resolveGlMeshMaterialRenderer(state, null)).toBeNull();
    expect(resolveGlMeshMaterialRenderer(state, makeMaterial(TestKind))).toBeNull();
  });

  it('resolves by the material kind', () => {
    const { state } = makeGlSceneState();
    registerGlMeshMaterialRenderer(state, TestKind, renderer);
    expect(resolveGlMeshMaterialRenderer(state, makeMaterial(TestKind))).toBe(renderer);
  });

  it('falls back to the DefaultMaterialKind renderer', () => {
    const { state } = makeGlSceneState();
    registerGlMeshMaterialRenderer(state, DefaultMaterialKind, renderer);
    expect(resolveGlMeshMaterialRenderer(state, makeMaterial(Symbol('Other')))).toBe(renderer);
    expect(resolveGlMeshMaterialRenderer(state, null)).toBe(renderer);
  });
});
