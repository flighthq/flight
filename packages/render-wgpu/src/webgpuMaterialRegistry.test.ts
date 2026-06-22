import type { Material, WgpuMaterialRenderer, WgpuRenderState } from '@flighthq/types';
import { DefaultMaterialKind, EntityRuntimeKey } from '@flighthq/types';

import {
  getWgpuMaterialRenderer,
  registerWgpuMaterialRenderer,
  resolveWgpuMaterialRenderer,
} from './webgpuMaterialRegistry';
import { createWgpuRenderStateRuntime } from './webgpuRenderState';

const TestKind: unique symbol = Symbol('TestMaterial');
const testRenderer: WgpuMaterialRenderer = { instanceFloatCount: 0, getShaderModule: () => ({}) as GPUShaderModule };

function makeState(): WgpuRenderState {
  const state = {} as WgpuRenderState;
  state[EntityRuntimeKey] = createWgpuRenderStateRuntime();
  return state;
}

function makeMaterial(kind: symbol): Material {
  return { kind } as Material;
}

describe('getWgpuMaterialRenderer', () => {
  it('returns null when nothing is registered for the kind', () => {
    expect(getWgpuMaterialRenderer(makeState(), TestKind)).toBeNull();
  });
});

describe('registerWgpuMaterialRenderer', () => {
  it('registers a renderer retrievable by kind', () => {
    const state = makeState();
    registerWgpuMaterialRenderer(state, TestKind, testRenderer);
    expect(getWgpuMaterialRenderer(state, TestKind)).toBe(testRenderer);
  });
});

describe('resolveWgpuMaterialRenderer', () => {
  it('returns null when nothing is registered — no built-in fallback', () => {
    expect(resolveWgpuMaterialRenderer(makeState(), null)).toBeNull();
    expect(resolveWgpuMaterialRenderer(makeState(), makeMaterial(TestKind))).toBeNull();
  });

  it('returns the registered renderer for a material kind', () => {
    const state = makeState();
    registerWgpuMaterialRenderer(state, TestKind, testRenderer);
    expect(resolveWgpuMaterialRenderer(state, makeMaterial(TestKind))).toBe(testRenderer);
  });

  it('falls back to the renderer registered for DefaultMaterialKind', () => {
    const state = makeState();
    registerWgpuMaterialRenderer(state, DefaultMaterialKind, testRenderer);
    expect(resolveWgpuMaterialRenderer(state, makeMaterial(Symbol('Other')))).toBe(testRenderer);
    expect(resolveWgpuMaterialRenderer(state, null)).toBe(testRenderer);
  });
});
