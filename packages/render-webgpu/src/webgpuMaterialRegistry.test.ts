import type { Material, WebGPUMaterialRenderer } from '@flighthq/types';
import { DefaultMaterialKind } from '@flighthq/types';

import {
  getWebGPUMaterialRenderer,
  registerWebGPUMaterialRenderer,
  resolveWebGPUMaterialRenderer,
} from './webgpuMaterialRegistry';

const TestKind: unique symbol = Symbol('TestMaterial');
const testRenderer: WebGPUMaterialRenderer = { instanceFloatCount: 0, getShaderModule: () => ({}) as GPUShaderModule };

function makeState() {
  return {} as never;
}

function makeMaterial(kind: symbol): Material {
  return { kind } as Material;
}

describe('getWebGPUMaterialRenderer', () => {
  it('returns null when nothing is registered for the kind', () => {
    expect(getWebGPUMaterialRenderer(makeState(), TestKind)).toBeNull();
  });
});

describe('registerWebGPUMaterialRenderer', () => {
  it('registers a renderer retrievable by kind', () => {
    const state = makeState();
    registerWebGPUMaterialRenderer(state, TestKind, testRenderer);
    expect(getWebGPUMaterialRenderer(state, TestKind)).toBe(testRenderer);
  });
});

describe('resolveWebGPUMaterialRenderer', () => {
  it('returns null when nothing is registered — no built-in fallback', () => {
    expect(resolveWebGPUMaterialRenderer(makeState(), null)).toBeNull();
    expect(resolveWebGPUMaterialRenderer(makeState(), makeMaterial(TestKind))).toBeNull();
  });

  it('returns the registered renderer for a material kind', () => {
    const state = makeState();
    registerWebGPUMaterialRenderer(state, TestKind, testRenderer);
    expect(resolveWebGPUMaterialRenderer(state, makeMaterial(TestKind))).toBe(testRenderer);
  });

  it('falls back to the renderer registered for DefaultMaterialKind', () => {
    const state = makeState();
    registerWebGPUMaterialRenderer(state, DefaultMaterialKind, testRenderer);
    expect(resolveWebGPUMaterialRenderer(state, makeMaterial(Symbol('Other')))).toBe(testRenderer);
    expect(resolveWebGPUMaterialRenderer(state, null)).toBe(testRenderer);
  });
});
