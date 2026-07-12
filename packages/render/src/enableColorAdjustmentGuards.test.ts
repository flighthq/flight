import { createColorTransformAdjustment, createSaturationColorMatrix } from '@flighthq/adjustments';
import { createDisplayObject, setDisplayObjectColorAdjustments } from '@flighthq/displayobject';
import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log';
import { createColorTransform } from '@flighthq/materials';
import type { Adjustment, Renderable } from '@flighthq/types';

import { areColorAdjustmentGuardsEnabled, enableColorAdjustmentGuards } from './enableColorAdjustmentGuards';
import { updateRenderProxyColorTransform } from './renderColorTransform';
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
  it('warns once when a node carries a non-inline-able channel-mixing adjustment', () => {
    const state = createRenderState();
    enableColorAdjustmentGuards(state);
    const node = createDisplayObject();
    const saturation: Adjustment = { kind: 'Saturation', colorMatrix: createSaturationColorMatrix(0) } as Adjustment;
    setDisplayObjectColorAdjustments(node, [saturation]);
    const data = createRenderProxy(state, node as unknown as Renderable);
    const sink = createMemoryLogSink(8);
    addLogSink(sink.sink);
    try {
      updateRenderProxyColorTransform(state, data);
      const entries = getMemoryLogSinkEntries(sink);
      expect(entries.length).toBe(1);
      expect(String((entries[0].data as Record<string, unknown>).message)).toContain('channel-mixing');
    } finally {
      removeLogSink(sink.sink);
    }
  });

  it('stays silent for an affine (inline-able) color-adjustment stack', () => {
    const state = createRenderState();
    enableColorAdjustmentGuards(state);
    const node = createDisplayObject();
    setDisplayObjectColorAdjustments(node, [
      createColorTransformAdjustment(createColorTransform({ redMultiplier: 0.5 })),
    ]);
    const data = createRenderProxy(state, node as unknown as Renderable);
    const sink = createMemoryLogSink(8);
    addLogSink(sink.sink);
    try {
      updateRenderProxyColorTransform(state, data);
      expect(getMemoryLogSinkEntries(sink).length).toBe(0);
    } finally {
      removeLogSink(sink.sink);
    }
  });
});
