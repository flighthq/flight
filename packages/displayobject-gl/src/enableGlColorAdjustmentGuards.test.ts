import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log';
import { getGlRenderStateRuntime } from '@flighthq/render-gl';
import type { ColorTransform } from '@flighthq/types';

import { areGlColorAdjustmentGuardsEnabled, enableGlColorAdjustmentGuards } from './enableGlColorAdjustmentGuards';
import { recordGlSpriteBatchColorTransform } from './glSpriteBatch';
import { createGlState } from './glTestHelper';

function ct(): ColorTransform {
  return {
    redMultiplier: 0.5,
    greenMultiplier: 0.5,
    blueMultiplier: 0.5,
    alphaMultiplier: 1,
    redOffset: 0,
    greenOffset: 0,
    blueOffset: 0,
    alphaOffset: 0,
  } as ColorTransform;
}

describe('areGlColorAdjustmentGuardsEnabled', () => {
  it('reports false until guards are installed, then true', () => {
    const { state } = createGlState();
    expect(areGlColorAdjustmentGuardsEnabled(state)).toBe(false);
    enableGlColorAdjustmentGuards(state);
    expect(areGlColorAdjustmentGuardsEnabled(state)).toBe(true);
  });
});

describe('enableGlColorAdjustmentGuards', () => {
  it('warns once when a color transform is recorded but color adjustment was never enabled', () => {
    const { state } = createGlState();
    const sink = createMemoryLogSink(8);
    addLogSink(sink.sink);
    try {
      enableGlColorAdjustmentGuards(state);
      recordGlSpriteBatchColorTransform(state, ct(), 0);
      const entries = getMemoryLogSinkEntries(sink);
      expect(entries.length).toBe(1);
      const data = entries[0].data as Record<string, unknown>;
      expect(String(data.message)).toContain('enableGlColorAdjustment');
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
      recordGlSpriteBatchColorTransform(state, null, 0);
      expect(getMemoryLogSinkEntries(sink).length).toBe(0);
    } finally {
      removeLogSink(sink.sink);
    }
  });

  it('does not warn when the guard slot is present but color adjustment is also enabled', () => {
    const { state } = createGlState();
    const runtime = getGlRenderStateRuntime(state);
    const sink = createMemoryLogSink(8);
    addLogSink(sink.sink);
    try {
      enableGlColorAdjustmentGuards(state);
      // Simulate the fold being installed so the dispatcher never reaches the guard branch.
      runtime.glColorAdjustmentFold = { flush: () => false, record: () => {} };
      recordGlSpriteBatchColorTransform(state, ct(), 0);
      expect(getMemoryLogSinkEntries(sink).length).toBe(0);
    } finally {
      removeLogSink(sink.sink);
    }
  });
});
