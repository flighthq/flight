import { createTintAdjustment } from '@flighthq/adjustments';
import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log';
import { setNodeColorAdjustments } from '@flighthq/node';
import { createDisplayObject } from '@flighthq/scene2d';
import type { Adjustment, Renderable } from '@flighthq/types/contract';

import { areColorAdjustmentGuardsEnabled, enableColorAdjustmentGuards } from './enableColorAdjustmentGuards';
import { updateRenderProxyColorScaleBias } from './renderColorScaleBias';
import { createRenderProxy } from './renderProxy';
import { createRenderState } from './renderState';

describe('areColorAdjustmentGuardsEnabled', () => {
  it('reports false until guards are installed, then true', () => {
    const state = createRenderState();
    expect(areColorAdjustmentGuardsEnabled(state)).toBe(false);
    enableColorAdjustmentGuards(state);
    expect(areColorAdjustmentGuardsEnabled(state)).toBe(true);
  });
});

describe('enableColorAdjustmentGuards', () => {
  it('warns once when a node carries a non-inline-able non-matrix adjustment', () => {
    const state = createRenderState();
    enableColorAdjustmentGuards(state);
    const node = createDisplayObject();
    const lut: Adjustment = { kind: 'acme.Lut' };
    setNodeColorAdjustments(node, [lut]);
    const data = createRenderProxy(state, node as unknown as Renderable);
    const sink = createMemoryLogSink(8);
    addLogSink(sink.sink);
    try {
      updateRenderProxyColorScaleBias(state, data);
      const entries = getMemoryLogSinkEntries(sink);
      expect(entries.length).toBe(1);
      expect(String((entries[0].data as Record<string, unknown>).message)).toContain('not inline-able');
    } finally {
      removeLogSink(sink.sink);
    }
  });

  it('stays silent for an affine (inline-able) color-adjustment stack', () => {
    const state = createRenderState();
    enableColorAdjustmentGuards(state);
    const node = createDisplayObject();
    setNodeColorAdjustments(node, [createTintAdjustment(0x7fffffff)]);
    const data = createRenderProxy(state, node as unknown as Renderable);
    const sink = createMemoryLogSink(8);
    addLogSink(sink.sink);
    try {
      updateRenderProxyColorScaleBias(state, data);
      expect(getMemoryLogSinkEntries(sink).length).toBe(0);
    } finally {
      removeLogSink(sink.sink);
    }
  });
});
