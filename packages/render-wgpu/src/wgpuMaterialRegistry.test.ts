import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import { enableRenderRegistryGuards, explainRenderRegistryMisses } from '@flighthq/render/contract';
import type { Material, WgpuMaterialRenderer, WgpuRenderState } from '@flighthq/types/contract';
import { StandardMaterialKind, EntityRuntimeKey, RenderRegistry } from '@flighthq/types/contract';

import {
  getWgpuMaterialRenderer,
  registerWgpuMaterialRenderer,
  resolveWgpuMaterialRenderer,
} from './wgpuMaterialRegistry';
import { createWgpuRenderStateRuntime } from './wgpuRenderState';

const TestKind = 'TestMaterial';
const testRenderer: WgpuMaterialRenderer = { instanceFloatCount: 0, getShaderModule: () => ({}) as GPUShaderModule };

function makeState(): WgpuRenderState {
  // `device` is what the guard's message table dispatches on to name the wgpu registrar.
  const state = { device: {} } as WgpuRenderState;
  state[EntityRuntimeKey] = createWgpuRenderStateRuntime();
  return state;
}

function makeMaterial(kind: string): Material {
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

  it('falls back to the renderer registered for StandardMaterialKind', () => {
    const state = makeState();
    registerWgpuMaterialRenderer(state, StandardMaterialKind, testRenderer);
    expect(resolveWgpuMaterialRenderer(state, makeMaterial('Other'))).toBe(testRenderer);
    expect(resolveWgpuMaterialRenderer(state, null)).toBe(testRenderer);
  });

  it('reports the missing kind against the wgpu registrar, not the gl one', () => {
    const state = makeState();
    enableRenderRegistryGuards(state);
    const sink = createMemoryLogSink(4);
    addLogSink(sink.sink);

    try {
      resolveWgpuMaterialRenderer(state, makeMaterial(TestKind));

      expect(explainRenderRegistryMisses(state).misses).toEqual([
        { kind: TestKind, registry: RenderRegistry.MaterialRenderer },
      ]);
      expect(getMemoryLogSinkEntries(sink)[0]?.data).toMatchObject({
        kind: TestKind,
        message:
          'resolveWgpuMaterialRenderer: material kind has no registered renderer, so nodes using it do not draw — call registerWgpuMaterialRenderer(state, kind, renderer)',
        registry: RenderRegistry.MaterialRenderer,
      });
    } finally {
      removeLogSink(sink.sink);
    }
  });
});
