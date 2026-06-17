import type { Material, WebGLMaterialRenderer } from '@flighthq/types';
import { DefaultMaterialKind } from '@flighthq/types';

import {
  getWebGLMaterialRenderer,
  registerWebGLMaterialRenderer,
  resolveWebGLMaterialRenderer,
} from './webglMaterialRegistry';
import { makeWebGLState } from './webglTestHelper';

const TestKind: unique symbol = Symbol('TestMaterial');
const testRenderer: WebGLMaterialRenderer = { instanceFloatCount: 0, bind() {} };

function makeMaterial(kind: symbol): Material {
  return { kind } as Material;
}

describe('getWebGLMaterialRenderer', () => {
  it('returns null when nothing is registered for the kind', () => {
    const { state } = makeWebGLState();
    expect(getWebGLMaterialRenderer(state, TestKind)).toBeNull();
  });
});

describe('registerWebGLMaterialRenderer', () => {
  it('registers a renderer retrievable by kind', () => {
    const { state } = makeWebGLState();
    registerWebGLMaterialRenderer(state, TestKind, testRenderer);
    expect(getWebGLMaterialRenderer(state, TestKind)).toBe(testRenderer);
  });
});

describe('resolveWebGLMaterialRenderer', () => {
  it('returns null when nothing is registered — no built-in fallback', () => {
    const { state } = makeWebGLState();
    expect(resolveWebGLMaterialRenderer(state, null)).toBeNull();
    expect(resolveWebGLMaterialRenderer(state, makeMaterial(TestKind))).toBeNull();
  });

  it('returns the registered renderer for a material kind', () => {
    const { state } = makeWebGLState();
    registerWebGLMaterialRenderer(state, TestKind, testRenderer);
    expect(resolveWebGLMaterialRenderer(state, makeMaterial(TestKind))).toBe(testRenderer);
  });

  it('falls back to the renderer registered for DefaultMaterialKind', () => {
    const { state } = makeWebGLState();
    registerWebGLMaterialRenderer(state, DefaultMaterialKind, testRenderer);
    expect(resolveWebGLMaterialRenderer(state, makeMaterial(Symbol('Other')))).toBe(testRenderer);
    expect(resolveWebGLMaterialRenderer(state, null)).toBe(testRenderer);
  });
});
