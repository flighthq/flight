import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import type { ColorScaleBias } from '@flighthq/types/contract';
import { RegistryEntryState } from '@flighthq/types/contract';

import {
  areWgpuColorAdjustmentGuardsEnabled,
  enableWgpuColorAdjustmentGuards,
} from './enableWgpuColorAdjustmentGuards';
import { registerWgpuColorAdjustmentMaterialFeature } from './wgpuColorAdjustmentMaterialFeature';
import { recordWgpuQuadBatchColorScaleBias } from './wgpuQuadBatchWriter';

beforeAll(() => {
  installWgpuMock();
});

function ct(): ColorScaleBias {
  return {
    redScale: 0.5,
    greenScale: 0.5,
    blueScale: 0.5,
    alphaScale: 1,
    redBias: 0,
    greenBias: 0,
    blueBias: 0,
    alphaBias: 0,
  } as ColorScaleBias;
}

describe('areWgpuColorAdjustmentGuardsEnabled', () => {
  it('reports false until guards are installed, then true', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(areWgpuColorAdjustmentGuardsEnabled(state)).toBe(false);
    enableWgpuColorAdjustmentGuards(state);
    expect(areWgpuColorAdjustmentGuardsEnabled(state)).toBe(true);
    const table = getWgpuRenderStateRuntime(state).registries.colorAdjustmentFeatureGuard;
    expect(table).toMatchObject({
      entry: { state: RegistryEntryState.Bound },
      onMiss: 'Disabled',
      registry: 'WgpuColorAdjustmentFeatureGuard',
      shape: 'slot',
    });
    enableWgpuColorAdjustmentGuards(state);
    expect(getWgpuRenderStateRuntime(state).registries.colorAdjustmentFeatureGuard).toBe(table);
  });
});

describe('enableWgpuColorAdjustmentGuards', () => {
  it('warns once when a color adjustment is recorded but color adjustment was never enabled', async () => {
    const state = await createWgpuRenderStateForTest();
    const sink = createMemoryLogSink(8);
    addLogSink(sink.sink);
    try {
      enableWgpuColorAdjustmentGuards(state);
      recordWgpuQuadBatchColorScaleBias(state, ct(), 0);
      const entries = getMemoryLogSinkEntries(sink);
      expect(entries.length).toBe(1);
      const data = entries[0].data as Record<string, unknown>;
      expect(String(data.message)).toContain('registerWgpuColorAdjustmentMaterialFeature');
    } finally {
      removeLogSink(sink.sink);
    }
  });

  it('stays silent for an untinted instance', async () => {
    const state = await createWgpuRenderStateForTest();
    const sink = createMemoryLogSink(8);
    addLogSink(sink.sink);
    try {
      enableWgpuColorAdjustmentGuards(state);
      recordWgpuQuadBatchColorScaleBias(state, null, 0);
      expect(getMemoryLogSinkEntries(sink).length).toBe(0);
    } finally {
      removeLogSink(sink.sink);
    }
  });

  it('does not warn when the guard slot is present but color adjustment is also enabled', async () => {
    const state = await createWgpuRenderStateForTest();
    const sink = createMemoryLogSink(8);
    addLogSink(sink.sink);
    try {
      enableWgpuColorAdjustmentGuards(state);
      registerWgpuColorAdjustmentMaterialFeature(state);
      recordWgpuQuadBatchColorScaleBias(state, ct(), 0);
      expect(getMemoryLogSinkEntries(sink).length).toBe(0);
    } finally {
      removeLogSink(sink.sink);
    }
  });
});
