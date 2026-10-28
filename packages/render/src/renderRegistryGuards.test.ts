import {
  addLogSink,
  createLogState,
  createMemoryLogSink,
  getMemoryLogSinkEntries,
  removeLogSink,
} from '@flighthq/log/contract';
import type { LogState } from '@flighthq/log/contract';
import { emitSignal } from '@flighthq/signals/contract';
import type { LogEntry, MemoryLogSink } from '@flighthq/types/contract';
import { RenderRegistryTable } from '@flighthq/types/contract';

import { registerNodeRenderer } from './renderer.ts';
import { createRenderProxy } from './renderProxy.ts';
import {
  areRenderRegistriesGuardsEnabled,
  enableRenderRegistriesGuards,
  explainRenderRegistriesMisses,
} from './renderRegistryGuards.ts';
import { enableRenderRegistrySignals } from './renderRegistrySignals.ts';
import { createRenderState } from './renderState.ts';

// Each test logs into a fresh caller-owned state, so logOnce keys never leak between tests.
let logState: LogState;

beforeEach(() => {
  logState = createLogState();
});

describe('areRenderRegistriesGuardsEnabled', () => {
  it('reports whether the state-local registry guard is enabled', () => {
    const state = createRenderState();
    expect(areRenderRegistriesGuardsEnabled(state)).toBe(false);
    enableRenderRegistriesGuards(state, logState);
    expect(areRenderRegistriesGuardsEnabled(state)).toBe(true);
  });
});

describe('enableRenderRegistriesGuards', () => {
  it('is idempotent', () => {
    const state = createRenderState();
    enableRenderRegistriesGuards(state, logState);
    enableRenderRegistriesGuards(state, logState);
    expect(areRenderRegistriesGuardsEnabled(state)).toBe(true);
  });

  it('warns once per state, registry, and kind', () => {
    const firstState = createRenderState();
    const secondState = createRenderState();
    const sink = createMemoryLogSink(4);
    addLogSink(logState, sink.sink);
    enableRenderRegistriesGuards(firstState, logState);
    enableRenderRegistriesGuards(secondState, logState);
    try {
      createRenderProxy(firstState, { kind: 'acme.Missing' } as never);
      createRenderProxy(firstState, { kind: 'acme.Missing' } as never);
      createRenderProxy(secondState, { kind: 'acme.Missing' } as never);

      const entries = readMemoryLogEntries(sink);
      expect(entries).toHaveLength(2);
      expect(entries[0]?.data).toMatchObject({
        kind: 'acme.Missing',
        message:
          'createRenderProxy: node kind has no registered renderer — call registerNodeRenderer(state, kind, renderer)',
        registry: RenderRegistryTable.NodeRenderer,
      });
    } finally {
      removeLogSink(logState, sink.sink);
    }
  });

  it('stays silent when the node renderer is registered', () => {
    const state = createRenderState();
    const sink = createMemoryLogSink(1);
    addLogSink(logState, sink.sink);
    enableRenderRegistriesGuards(state, logState);
    registerNodeRenderer(state, 'acme.Registered', { createData: () => null, submit: () => {} });
    try {
      createRenderProxy(state, { kind: 'acme.Registered' } as never);
      expect(readMemoryLogEntries(sink)).toHaveLength(0);
    } finally {
      removeLogSink(logState, sink.sink);
    }
  });
});

describe('explainRenderRegistriesMisses', () => {
  it('returns each recorded registry and kind pair once in event order', () => {
    const state = createRenderState();
    enableRenderRegistriesGuards(state, logState);
    const signals = enableRenderRegistrySignals(state);
    emitSignal(signals.onRegistryMiss, RenderRegistryTable.TextureResolver, 'acme.Texture');
    emitSignal(signals.onRegistryMiss, RenderRegistryTable.TextureResolver, 'acme.Texture');
    emitSignal(signals.onRegistryMiss, RenderRegistryTable.ShapeCommandHandler, 'acme.ShapeCommand');

    expect(explainRenderRegistriesMisses(state)).toEqual({
      misses: [
        { kind: 'acme.Texture', registry: RenderRegistryTable.TextureResolver },
        { kind: 'acme.ShapeCommand', registry: RenderRegistryTable.ShapeCommandHandler },
      ],
      status: 'misses-recorded',
    });
  });

  it('returns a complete empty explanation before any miss is recorded', () => {
    const state = createRenderState();
    expect(explainRenderRegistriesMisses(state)).toEqual({ misses: [], status: 'complete' });
  });
});

function readMemoryLogEntries(handle: Readonly<MemoryLogSink>): LogEntry[] {
  const entries: LogEntry[] = [];
  getMemoryLogSinkEntries(entries, handle);
  return entries;
}
