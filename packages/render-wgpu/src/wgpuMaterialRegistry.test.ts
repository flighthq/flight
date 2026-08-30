import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import { enableRenderRegistryGuards, explainRenderRegistryMisses } from '@flighthq/render/contract';
import type { Material, WgpuMaterialRenderer, WgpuRenderState } from '@flighthq/types/contract';
import { StandardMaterialKind, EntityRuntimeKey, RenderRegistry } from '@flighthq/types/contract';

import {
  getWgpuMaterialRenderer,
  registerWgpuMaterialRenderer,
  resolveWgpuMaterialRenderer,
} from './wgpuMaterialRegistry';
import { createEmptyWgpuRegistries, createWgpuPipeline } from './wgpuPipeline';
import { createWgpuDeviceState, createWgpuRenderStateRuntime, getWgpuRenderStateRuntime } from './wgpuRenderState';

const TestKind = 'TestMaterial';
const testRenderer: WgpuMaterialRenderer = { instanceFloatCount: 0, getShaderModule: () => ({}) as GPUShaderModule };
const _pipeline = createWgpuPipeline(createEmptyWgpuRegistries());

function makeState(): WgpuRenderState {
  // `device` is what the guard's message table dispatches on to name the wgpu registrar.
  const device = {} as GPUDevice;
  const state = { device } as WgpuRenderState;
  state[EntityRuntimeKey] = createWgpuRenderStateRuntime(createWgpuDeviceState(device), _pipeline);
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
    const before = getWgpuRenderStateRuntime(state).registries.materialRenderers;
    registerWgpuMaterialRenderer(state, TestKind, testRenderer);
    expect(getWgpuMaterialRenderer(state, TestKind)).toBe(testRenderer);
    expect(getWgpuRenderStateRuntime(state).registries.materialRenderers).not.toBe(before);
    expect(before.entries.size).toBe(0);
  });

  it('is last-write-wins without mutating the earlier snapshot', () => {
    const state = makeState();
    const replacement: WgpuMaterialRenderer = { instanceFloatCount: 0, getShaderModule: () => ({}) as GPUShaderModule };
    registerWgpuMaterialRenderer(state, TestKind, testRenderer);
    const before = getWgpuRenderStateRuntime(state).registries.materialRenderers;

    registerWgpuMaterialRenderer(state, TestKind, replacement);

    expect(getWgpuMaterialRenderer(state, TestKind)).toBe(replacement);
    expect(before.entries.get(TestKind)).toEqual({ state: 'bound', value: testRenderer });
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
