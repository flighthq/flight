import {
  addLogSink,
  createLogState,
  createMemoryLogSink,
  getMemoryLogSinkEntries,
  removeLogSink,
} from '@flighthq/log/contract';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu/contract';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu/contract';
import type { ColorScaleBias, LogEntry, MemoryLogSink } from '@flighthq/types/contract';

import {
  areWgpuColorAdjustmentGuardsEnabled,
  enableWgpuColorAdjustmentGuards,
} from './enableWgpuColorAdjustmentGuards.ts';
import { registerWgpuColorAdjustmentMaterialFeature } from './wgpuColorAdjustmentMaterialFeature.ts';
import { recordWgpuQuadBatchColorScaleBias } from './wgpuQuadBatchWriter.ts';

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
    enableWgpuColorAdjustmentGuards(state, createLogState());
    expect(areWgpuColorAdjustmentGuardsEnabled(state)).toBe(true);
    const guard = getWgpuRenderStateRuntime(state).registries.colorAdjustmentFeatureGuard;
    expect(guard).not.toBeNull();
    enableWgpuColorAdjustmentGuards(state, null);
    expect(getWgpuRenderStateRuntime(state).registries.colorAdjustmentFeatureGuard).toBe(guard);
  });
});

describe('enableWgpuColorAdjustmentGuards', () => {
  it('warns once when a color adjustment is recorded but color adjustment was never enabled', async () => {
    const state = await createWgpuRenderStateForTest();
    const logState = createLogState();
    const sink = createMemoryLogSink(8);
    addLogSink(logState, sink.sink);
    try {
      enableWgpuColorAdjustmentGuards(state, logState);
      recordWgpuQuadBatchColorScaleBias(state, ct(), 0);
      const entries = readMemoryLogEntries(sink);
      expect(entries.length).toBe(1);
      const data = entries[0].data as Record<string, unknown>;
      expect(String(data.message)).toContain('registerWgpuColorAdjustmentMaterialFeature');
    } finally {
      removeLogSink(logState, sink.sink);
    }
  });

  it('stays silent for an untinted instance', async () => {
    const state = await createWgpuRenderStateForTest();
    const logState = createLogState();
    const sink = createMemoryLogSink(8);
    addLogSink(logState, sink.sink);
    try {
      enableWgpuColorAdjustmentGuards(state, logState);
      recordWgpuQuadBatchColorScaleBias(state, null, 0);
      expect(readMemoryLogEntries(sink).length).toBe(0);
    } finally {
      removeLogSink(logState, sink.sink);
    }
  });

  it('does not warn when the guard slot is present but color adjustment is also enabled', async () => {
    const state = await createWgpuRenderStateForTest();
    const logState = createLogState();
    const sink = createMemoryLogSink(8);
    addLogSink(logState, sink.sink);
    try {
      enableWgpuColorAdjustmentGuards(state, logState);
      registerWgpuColorAdjustmentMaterialFeature(state);
      recordWgpuQuadBatchColorScaleBias(state, ct(), 0);
      expect(readMemoryLogEntries(sink).length).toBe(0);
    } finally {
      removeLogSink(logState, sink.sink);
    }
  });
});

function readMemoryLogEntries(sink: Readonly<MemoryLogSink>): LogEntry[] {
  const entries: LogEntry[] = [];
  getMemoryLogSinkEntries(entries, sink);
  return entries;
}
