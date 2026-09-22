import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import { enableRenderRegistriesGuards, explainRenderRegistriesMisses } from '@flighthq/render/contract';
import type { Material, WgpuQuadMaterialRenderer, WgpuRenderState } from '@flighthq/types/contract';
import { StandardMaterialKind, EntityRuntimeKey, RenderRegistryTable } from '@flighthq/types/contract';

import {
  getWgpuQuadMaterialRenderer,
  registerWgpuQuadMaterialRenderer,
  resolveWgpuQuadMaterialRenderer,
} from './wgpuQuadMaterialRegistry';
import { createWgpuDeviceState, createWgpuRenderStateRuntime, getWgpuRenderStateRuntime } from './wgpuRenderState';

const TestKind = 'TestMaterial';
const testRenderer: WgpuQuadMaterialRenderer = {
  instanceFloatCount: 0,
  getShaderModule: () => ({}) as GPUShaderModule,
};

function makeState(): WgpuRenderState {
  const device = {} as GPUDevice;
  const state = { device } as WgpuRenderState;
  state[EntityRuntimeKey] = createWgpuRenderStateRuntime(createWgpuDeviceState(device));
  return state;
}

function makeMaterial(kind: string): Material {
  return { kind } as Material;
}

describe('getWgpuQuadMaterialRenderer', () => {
  it('returns null when nothing is registered for the kind', () => {
    expect(getWgpuQuadMaterialRenderer(makeState(), TestKind)).toBeNull();
  });
});

describe('registerWgpuQuadMaterialRenderer', () => {
  it('registers a renderer retrievable by kind', () => {
    const state = makeState();
    const before = getWgpuRenderStateRuntime(state).registries.materialRenderers;
    registerWgpuQuadMaterialRenderer(state, TestKind, testRenderer);
    expect(getWgpuQuadMaterialRenderer(state, TestKind)).toBe(testRenderer);
    expect(getWgpuRenderStateRuntime(state).registries.materialRenderers).not.toBe(before);
    expect(before.size).toBe(0);
  });

  it('is last-write-wins without mutating the earlier snapshot', () => {
    const state = makeState();
    const replacement: WgpuQuadMaterialRenderer = {
      instanceFloatCount: 0,
      getShaderModule: () => ({}) as GPUShaderModule,
    };
    registerWgpuQuadMaterialRenderer(state, TestKind, testRenderer);
    const before = getWgpuRenderStateRuntime(state).registries.materialRenderers;

    registerWgpuQuadMaterialRenderer(state, TestKind, replacement);

    expect(getWgpuQuadMaterialRenderer(state, TestKind)).toBe(replacement);
    expect(before.get(TestKind)).toEqual(testRenderer);
  });
});

describe('resolveWgpuQuadMaterialRenderer', () => {
  it('returns null when nothing is registered — no built-in fallback', () => {
    expect(resolveWgpuQuadMaterialRenderer(makeState(), null)).toBeNull();
    expect(resolveWgpuQuadMaterialRenderer(makeState(), makeMaterial(TestKind))).toBeNull();
  });

  it('returns the registered renderer for a material kind', () => {
    const state = makeState();
    registerWgpuQuadMaterialRenderer(state, TestKind, testRenderer);
    expect(resolveWgpuQuadMaterialRenderer(state, makeMaterial(TestKind))).toBe(testRenderer);
  });

  it('falls back to the renderer registered for StandardMaterialKind', () => {
    const state = makeState();
    registerWgpuQuadMaterialRenderer(state, StandardMaterialKind, testRenderer);
    expect(resolveWgpuQuadMaterialRenderer(state, makeMaterial('Other'))).toBe(testRenderer);
    expect(resolveWgpuQuadMaterialRenderer(state, null)).toBe(testRenderer);
  });

  it('reports the missing kind against the wgpu registrar, not the gl one', () => {
    const state = makeState();
    enableRenderRegistriesGuards(state);
    const sink = createMemoryLogSink(4);
    addLogSink(sink.sink);

    try {
      resolveWgpuQuadMaterialRenderer(state, makeMaterial(TestKind));

      expect(explainRenderRegistriesMisses(state).misses).toEqual([
        { kind: TestKind, registry: RenderRegistryTable.MaterialRenderer },
      ]);
      expect(getMemoryLogSinkEntries(sink)[0]?.data).toMatchObject({
        kind: TestKind,
        message:
          'resolveWgpuQuadMaterialRenderer: material kind has no registered renderer, so nodes using it do not draw — call registerWgpuQuadMaterialRenderer(state, kind, renderer)',
        registry: RenderRegistryTable.MaterialRenderer,
      });
    } finally {
      removeLogSink(sink.sink);
    }
  });
});
