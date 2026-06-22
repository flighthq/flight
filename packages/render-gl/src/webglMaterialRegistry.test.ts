import type { GlMaterialRenderer, Material } from '@flighthq/types';
import { DefaultMaterialKind } from '@flighthq/types';

import { getGlMaterialRenderer, registerGlMaterialRenderer, resolveGlMaterialRenderer } from './webglMaterialRegistry';
import { makeGlState } from './webglTestHelper';

const TestKind: unique symbol = Symbol('TestMaterial');
const testRenderer: GlMaterialRenderer = { instanceFloatCount: 0, bind() {} };

function makeMaterial(kind: symbol): Material {
  return { kind } as Material;
}

describe('getGlMaterialRenderer', () => {
  it('returns null when nothing is registered for the kind', () => {
    const { state } = makeGlState();
    expect(getGlMaterialRenderer(state, TestKind)).toBeNull();
  });
});

describe('registerGlMaterialRenderer', () => {
  it('registers a renderer retrievable by kind', () => {
    const { state } = makeGlState();
    registerGlMaterialRenderer(state, TestKind, testRenderer);
    expect(getGlMaterialRenderer(state, TestKind)).toBe(testRenderer);
  });
});

describe('resolveGlMaterialRenderer', () => {
  it('returns null when nothing is registered — no built-in fallback', () => {
    const { state } = makeGlState();
    expect(resolveGlMaterialRenderer(state, null)).toBeNull();
    expect(resolveGlMaterialRenderer(state, makeMaterial(TestKind))).toBeNull();
  });

  it('returns the registered renderer for a material kind', () => {
    const { state } = makeGlState();
    registerGlMaterialRenderer(state, TestKind, testRenderer);
    expect(resolveGlMaterialRenderer(state, makeMaterial(TestKind))).toBe(testRenderer);
  });

  it('falls back to the renderer registered for DefaultMaterialKind', () => {
    const { state } = makeGlState();
    registerGlMaterialRenderer(state, DefaultMaterialKind, testRenderer);
    expect(resolveGlMaterialRenderer(state, makeMaterial(Symbol('Other')))).toBe(testRenderer);
    expect(resolveGlMaterialRenderer(state, null)).toBe(testRenderer);
  });
});
