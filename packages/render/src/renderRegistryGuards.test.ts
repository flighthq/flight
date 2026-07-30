import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import { emitSignal } from '@flighthq/signals/contract';
import { RenderRegistry } from '@flighthq/types/contract';

import { registerRenderer } from './renderer';
import { createRenderProxy } from './renderProxy';
import {
  areRenderRegistryGuardsEnabled,
  enableRenderRegistryGuards,
  explainRenderRegistryMisses,
} from './renderRegistryGuards';
import { enableRenderRegistrySignals } from './renderRegistrySignals';
import { createRenderState } from './renderState';

describe('areRenderRegistryGuardsEnabled', () => {
  it('reports whether the state-local registry guard is enabled', () => {
    const state = createRenderState();
    expect(areRenderRegistryGuardsEnabled(state)).toBe(false);
    enableRenderRegistryGuards(state);
    expect(areRenderRegistryGuardsEnabled(state)).toBe(true);
  });
});

describe('enableRenderRegistryGuards', () => {
  it('is idempotent', () => {
    const state = createRenderState();
    enableRenderRegistryGuards(state);
    enableRenderRegistryGuards(state);
    expect(areRenderRegistryGuardsEnabled(state)).toBe(true);
  });

  it('warns once per state, registry, and kind', () => {
    const firstState = createRenderState();
    const secondState = createRenderState();
    const sink = createMemoryLogSink(4);
    addLogSink(sink.sink);
    enableRenderRegistryGuards(firstState);
    enableRenderRegistryGuards(secondState);
    try {
      createRenderProxy(firstState, { kind: 'acme.Missing' } as never);
      createRenderProxy(firstState, { kind: 'acme.Missing' } as never);
      createRenderProxy(secondState, { kind: 'acme.Missing' } as never);

      const entries = getMemoryLogSinkEntries(sink);
      expect(entries).toHaveLength(2);
      expect(entries[0]?.data).toMatchObject({
        kind: 'acme.Missing',
        message:
          'createRenderProxy: node kind has no registered renderer — call registerRenderer(state, kind, renderer)',
        registry: RenderRegistry.NodeRenderer,
      });
    } finally {
      removeLogSink(sink.sink);
    }
  });

  it('stays silent when the node renderer is registered', () => {
    const state = createRenderState();
    const sink = createMemoryLogSink(1);
    addLogSink(sink.sink);
    enableRenderRegistryGuards(state);
    registerRenderer(state, 'acme.Registered', { createData: () => null, submit: () => {} });
    try {
      createRenderProxy(state, { kind: 'acme.Registered' } as never);
      expect(getMemoryLogSinkEntries(sink)).toHaveLength(0);
    } finally {
      removeLogSink(sink.sink);
    }
  });
});

describe('explainRenderRegistryMisses', () => {
  it('returns each recorded registry and kind pair once in event order', () => {
    const state = createRenderState();
    enableRenderRegistryGuards(state);
    const signals = enableRenderRegistrySignals(state);
    emitSignal(signals.onRegistryMiss, RenderRegistry.TextureResolver, 'acme.Texture');
    emitSignal(signals.onRegistryMiss, RenderRegistry.TextureResolver, 'acme.Texture');
    emitSignal(signals.onRegistryMiss, RenderRegistry.ShapeCommandHandler, 'acme.ShapeCommand');

    expect(explainRenderRegistryMisses(state)).toEqual({
      misses: [
        { kind: 'acme.Texture', registry: RenderRegistry.TextureResolver },
        { kind: 'acme.ShapeCommand', registry: RenderRegistry.ShapeCommandHandler },
      ],
      status: 'misses-recorded',
    });
  });

  it('returns a complete empty explanation before any miss is recorded', () => {
    const state = createRenderState();
    expect(explainRenderRegistryMisses(state)).toEqual({ misses: [], status: 'complete' });
  });
});
