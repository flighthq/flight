import { createTintAdjustment } from '@flighthq/adjustments/contract';
import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import { setNodeColorAdjustments } from '@flighthq/node/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type { Adjustment, Renderable, RenderProxy, RenderState } from '@flighthq/types/contract';
import { RegistryEntryState } from '@flighthq/types/contract';

import { areColorAdjustmentGuardsEnabled, enableColorAdjustmentGuards } from './enableColorAdjustmentGuards';
import { enableColorAdjustments } from './enableColorAdjustments';
import { createRenderProxy } from './renderProxy';
import { createRenderState, getRenderStateRuntime } from './renderState';

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
    enableColorAdjustments(state);
    const node = createDisplayObject();
    const lut: Adjustment = { kind: 'acme.Lut' };
    setNodeColorAdjustments(node, [lut]);
    const data = createRenderProxy(state, node as unknown as Renderable);
    const sink = createMemoryLogSink(8);
    addLogSink(sink.sink);
    try {
      resolveColorAdjustments(state, data);
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
    enableColorAdjustments(state);
    const node = createDisplayObject();
    setNodeColorAdjustments(node, [createTintAdjustment(0x7fffffff)]);
    const data = createRenderProxy(state, node as unknown as Renderable);
    const sink = createMemoryLogSink(8);
    addLogSink(sink.sink);
    try {
      resolveColorAdjustments(state, data);
      expect(getMemoryLogSinkEntries(sink).length).toBe(0);
    } finally {
      removeLogSink(sink.sink);
    }
  });
});

function resolveColorAdjustments(state: RenderState, data: RenderProxy): void {
  const entry = getRenderStateRuntime(state).registries.colorAdjustments?.entry;
  if (entry?.state !== RegistryEntryState.Bound) throw new Error('Color-adjustment resolver is not enabled');
  entry.value(state, data);
}
