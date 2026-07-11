import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import { createWgpuRenderStateForTest, installWgpuMock } from '@flighthq/render-wgpu';
import type { ColorTransform } from '@flighthq/types';

import {
  areWgpuColorAdjustmentGuardsEnabled,
  enableWgpuColorAdjustmentGuards,
} from './enableWgpuColorAdjustmentGuards';
import { recordWgpuSpriteBatchColorTransform } from './wgpuSpriteBatch';

beforeAll(() => {
  installWgpuMock();
});

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

describe('areWgpuColorAdjustmentGuardsEnabled', () => {
  it('reports false until guards are installed, then true', async () => {
    const state = await createWgpuRenderStateForTest();
    expect(areWgpuColorAdjustmentGuardsEnabled(state)).toBe(false);
    enableWgpuColorAdjustmentGuards(state);
    expect(areWgpuColorAdjustmentGuardsEnabled(state)).toBe(true);
  });
});

describe('enableWgpuColorAdjustmentGuards', () => {
  it('warns once when a color transform is recorded but color adjustment was never enabled', async () => {
    const state = await createWgpuRenderStateForTest();
    const sink = createMemoryLogSink(8);
    addLogSink(sink.sink);
    try {
      enableWgpuColorAdjustmentGuards(state);
      recordWgpuSpriteBatchColorTransform(state, ct(), 0);
      const entries = getMemoryLogSinkEntries(sink);
      expect(entries.length).toBe(1);
      const data = entries[0].data as Record<string, unknown>;
      expect(String(data.message)).toContain('enableWgpuColorAdjustment');
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
      recordWgpuSpriteBatchColorTransform(state, null, 0);
      expect(getMemoryLogSinkEntries(sink).length).toBe(0);
    } finally {
      removeLogSink(sink.sink);
    }
  });

  it('does not warn when the guard slot is present but color adjustment is also enabled', async () => {
    const state = await createWgpuRenderStateForTest();
    const runtime = getWgpuRenderStateRuntime(state);
    const sink = createMemoryLogSink(8);
    addLogSink(sink.sink);
    try {
      enableWgpuColorAdjustmentGuards(state);
      runtime.wgpuColorAdjustmentFold = { record: () => {}, resolveFlush: () => null };
      recordWgpuSpriteBatchColorTransform(state, ct(), 0);
      expect(getMemoryLogSinkEntries(sink).length).toBe(0);
    } finally {
      removeLogSink(sink.sink);
    }
  });
});
