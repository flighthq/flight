import type { Material, WebGLMaterialRenderer } from '@flighthq/types';
import { DefaultMaterialKind } from '@flighthq/types';

import {
  defaultWebGLMaterialRenderer,
  getWebGLMaterialRenderer,
  registerDefaultWebGLMaterial,
  registerWebGLMaterialRenderer,
  resolveWebGLMaterialRenderer,
} from './webglMaterialRegistry';
import { makeWebGLState } from './webglTestHelper';

const TestKind: unique symbol = Symbol('TestMaterial');
const testRenderer: WebGLMaterialRenderer = { instanceFloatCount: 0, bind() {} };

function makeMaterial(kind: symbol): Material {
  return { kind } as Material;
}

describe('defaultWebGLMaterialRenderer', () => {
  it('declares no per-instance float data', () => {
    expect(defaultWebGLMaterialRenderer.instanceFloatCount).toBe(0);
  });
});

describe('getWebGLMaterialRenderer', () => {
  it('returns null when nothing is registered for the kind', () => {
    const { state } = makeWebGLState();
    expect(getWebGLMaterialRenderer(state, TestKind)).toBeNull();
  });
});

describe('registerDefaultWebGLMaterial', () => {
  it('registers the built-in default under DefaultMaterialKind', () => {
    const { state } = makeWebGLState();
    registerDefaultWebGLMaterial(state);
    expect(getWebGLMaterialRenderer(state, DefaultMaterialKind)).toBe(defaultWebGLMaterialRenderer);
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
  it('falls back to the built-in default when nothing is registered', () => {
    const { state } = makeWebGLState();
    expect(resolveWebGLMaterialRenderer(state, null)).toBe(defaultWebGLMaterialRenderer);
  });

  it('returns the registered renderer for a material kind', () => {
    const { state } = makeWebGLState();
    registerWebGLMaterialRenderer(state, TestKind, testRenderer);
    expect(resolveWebGLMaterialRenderer(state, makeMaterial(TestKind))).toBe(testRenderer);
  });

  it('falls back to the registered default for an unregistered kind', () => {
    const { state } = makeWebGLState();
    registerDefaultWebGLMaterial(state);
    expect(resolveWebGLMaterialRenderer(state, makeMaterial(Symbol('Other')))).toBe(defaultWebGLMaterialRenderer);
  });
});
