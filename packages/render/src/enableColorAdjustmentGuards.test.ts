import { createTintAdjustment } from '@flighthq/adjustments/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import {
  addLogSink,
  createLogState,
  createMemoryLogSink,
  getMemoryLogSinkEntries,
  removeLogSink,
} from '@flighthq/log/contract';
import type { LogState } from '@flighthq/log/contract';
import { setNodeColorAdjustments } from '@flighthq/node/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type { Adjustment, LogEntry, MemoryLogSink, NodeAny, RenderProxy, RenderState } from '@flighthq/types/contract';

import { areColorAdjustmentGuardsEnabled, enableColorAdjustmentGuards } from './enableColorAdjustmentGuards.ts';
import { enableColorAdjustments } from './enableColorAdjustments.ts';
import { createRenderProxy } from './renderProxy.ts';
import { createRenderState, getRenderStateRuntime } from './renderState.ts';

// Each test logs into a fresh caller-owned state, so logOnce keys never leak between tests.
let logState: LogState;

beforeEach(() => {
  logState = createLogState();
});

describe('areColorAdjustmentGuardsEnabled', () => {
  it('reports false until guards are installed, then true', () => {
    const state = createRenderState();
    expect(areColorAdjustmentGuardsEnabled(state)).toBe(false);
    enableColorAdjustmentGuards(state, logState);
    expect(areColorAdjustmentGuardsEnabled(state)).toBe(true);
    const guard = getRenderStateRuntime(state).registries.colorAdjustmentUnsupportedGuard;
    expect(guard).not.toBeNull();
    enableColorAdjustmentGuards(state, logState);
    expect(getRenderStateRuntime(state).registries.colorAdjustmentUnsupportedGuard).toBe(guard);
  });
});

describe('enableColorAdjustmentGuards', () => {
  it('warns once when a node carries a non-inline-able non-matrix adjustment', () => {
    const state = createRenderState();
    enableColorAdjustmentGuards(state, logState);
    enableColorAdjustments(state);
    const node = createDisplayObject();
    const lut = allocateEntity<any>();
    lut.kind = 'acme.Lut';
    setNodeColorAdjustments(node, [lut as Adjustment]);
    const data = createRenderProxy(state, node as unknown as NodeAny);
    const sink = createMemoryLogSink(8);
    addLogSink(logState, sink.sink);
    try {
      resolveColorAdjustments(state, data);
      const entries = readMemoryLogEntries(sink);
      expect(entries.length).toBe(1);
      expect(String((entries[0].data as Record<string, unknown>).message)).toContain('not inline-able');
    } finally {
      removeLogSink(logState, sink.sink);
    }
  });

  it('stays silent for an affine (inline-able) color-adjustment stack', () => {
    const state = createRenderState();
    enableColorAdjustmentGuards(state, logState);
    enableColorAdjustments(state);
    const node = createDisplayObject();
    setNodeColorAdjustments(node, [createTintAdjustment(0x7fffffff)]);
    const data = createRenderProxy(state, node as unknown as NodeAny);
    const sink = createMemoryLogSink(8);
    addLogSink(logState, sink.sink);
    try {
      resolveColorAdjustments(state, data);
      expect(readMemoryLogEntries(sink).length).toBe(0);
    } finally {
      removeLogSink(logState, sink.sink);
    }
  });
});

function resolveColorAdjustments(state: RenderState, data: RenderProxy): void {
  const resolver = getRenderStateRuntime(state).registries.colorAdjustments;
  if (resolver == null) throw new Error('Color-adjustment resolver is not enabled');
  resolver(state, data);
}

function readMemoryLogEntries(handle: Readonly<MemoryLogSink>): LogEntry[] {
  const entries: LogEntry[] = [];
  getMemoryLogSinkEntries(entries, handle);
  return entries;
}
