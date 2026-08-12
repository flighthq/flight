import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import { getGlRenderStateRuntime } from '@flighthq/render-gl/contract';
import type { ColorScaleBias } from '@flighthq/types/contract';
import { RegistryEntryState } from '@flighthq/types/contract';

import { areGlColorAdjustmentGuardsEnabled, enableGlColorAdjustmentGuards } from './enableGlColorAdjustmentGuards';
import { registerGlColorAdjustmentMaterialFeature } from './glColorAdjustmentMaterialFeature';
import { recordGlQuadBatchColorScaleBias } from './glQuadBatchWriter';
import { createGlState } from './glTestHelper';

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

describe('areGlColorAdjustmentGuardsEnabled', () => {
  it('reports false until guards are installed, then true', () => {
    const { state } = createGlState();
    expect(areGlColorAdjustmentGuardsEnabled(state)).toBe(false);
    enableGlColorAdjustmentGuards(state);
    expect(areGlColorAdjustmentGuardsEnabled(state)).toBe(true);
    const table = getGlRenderStateRuntime(state).registries.colorAdjustmentFeatureGuard;
    expect(table).toMatchObject({
      entry: { state: RegistryEntryState.Bound },
      onMiss: 'Disabled',
      registry: 'GlColorAdjustmentFeatureGuard',
      shape: 'slot',
    });
    enableGlColorAdjustmentGuards(state);
    expect(getGlRenderStateRuntime(state).registries.colorAdjustmentFeatureGuard).toBe(table);
  });
});

describe('enableGlColorAdjustmentGuards', () => {
  it('warns once when a color adjustment is recorded but color adjustment was never enabled', () => {
    const { state } = createGlState();
    const sink = createMemoryLogSink(8);
    addLogSink(sink.sink);
    try {
      enableGlColorAdjustmentGuards(state);
      recordGlQuadBatchColorScaleBias(state, ct(), 0);
      const entries = getMemoryLogSinkEntries(sink);
      expect(entries.length).toBe(1);
      const data = entries[0].data as Record<string, unknown>;
      expect(String(data.message)).toContain('registerGlColorAdjustmentMaterialFeature');
    } finally {
      removeLogSink(sink.sink);
    }
  });

  it('stays silent for an untinted instance', () => {
    const { state } = createGlState();
    const sink = createMemoryLogSink(8);
    addLogSink(sink.sink);
    try {
      enableGlColorAdjustmentGuards(state);
      recordGlQuadBatchColorScaleBias(state, null, 0);
      expect(getMemoryLogSinkEntries(sink).length).toBe(0);
    } finally {
      removeLogSink(sink.sink);
    }
  });

  it('does not warn when the guard slot is present but color adjustment is also enabled', () => {
    const { state } = createGlState();
    const sink = createMemoryLogSink(8);
    addLogSink(sink.sink);
    try {
      enableGlColorAdjustmentGuards(state);
      registerGlColorAdjustmentMaterialFeature(state);
      recordGlQuadBatchColorScaleBias(state, ct(), 0);
      expect(getMemoryLogSinkEntries(sink).length).toBe(0);
    } finally {
      removeLogSink(sink.sink);
    }
  });
});
