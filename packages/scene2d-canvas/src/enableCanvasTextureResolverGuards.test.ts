import {
  addLogSink,
  createLogState,
  createMemoryLogSink,
  getMemoryLogSinkEntries,
  removeLogSink,
} from '@flighthq/log/contract';
import type { LogState } from '@flighthq/log/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { ImageResource, LogEntry, MemoryLogSink } from '@flighthq/types/contract';

import { getCanvasRenderStateTextureResolvers } from './canvasTestSupport.ts';
import { createCanvasRenderState } from './canvasTestSupport.ts';
import { registerCanvasTextureResolver, resolveCanvasTexture } from './canvasTestSupport.ts';
import {
  areCanvasTextureResolverGuardsEnabled,
  enableCanvasTextureResolverGuards,
} from './enableCanvasTextureResolverGuards.ts';

// Each test logs into a fresh caller-owned state, so logOnce keys never leak between tests.
let logState: LogState;

beforeEach(() => {
  logState = createLogState();
});

describe('areCanvasTextureResolverGuardsEnabled', () => {
  it('reports whether diagnostics were installed for the state', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    expect(areCanvasTextureResolverGuardsEnabled(state)).toBe(false);

    enableCanvasTextureResolverGuards(state, logState);
    expect(areCanvasTextureResolverGuardsEnabled(state)).toBe(true);
  });
});

describe('enableCanvasTextureResolverGuards', () => {
  it('is idempotent', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    enableCanvasTextureResolverGuards(state, logState);
    enableCanvasTextureResolverGuards(state, logState);
    expect(areCanvasTextureResolverGuardsEnabled(state)).toBe(true);
  });

  it('warns once for a missing resolver and stays silent for a registered resolver returning null', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const missing = textureWithKind('acme.missing.canvas');
    const registered = textureWithKind('acme.registered.canvas');
    const sink = createMemoryLogSink(4);
    addLogSink(logState, sink.sink);
    enableCanvasTextureResolverGuards(state, logState);
    registerCanvasTextureResolver(getCanvasRenderStateTextureResolvers(state), 'acme.registered.canvas', () => null);
    try {
      expect(resolveCanvasTexture(getCanvasRenderStateTextureResolvers(state), missing)).toBeNull();
      expect(resolveCanvasTexture(getCanvasRenderStateTextureResolvers(state), missing)).toBeNull();
      expect(resolveCanvasTexture(getCanvasRenderStateTextureResolvers(state), registered)).toBeNull();

      const entries = readMemoryLogEntries(sink);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.data).toMatchObject({
        kind: 'acme.missing.canvas',
        message:
          'resolveCanvasTexture: texture source kind has no registered resolver — call registerCanvasTextureResolver(resolvers, sourceKind, resolver) on the set the caller resolves through',
      });
    } finally {
      removeLogSink(logState, sink.sink);
    }
  });
});

function textureWithKind(kind: string) {
  return createTexture({
    dimension: '2d',
    source: { kind } as ImageResource,
  });
}

function readMemoryLogEntries(handle: Readonly<MemoryLogSink>): LogEntry[] {
  const entries: LogEntry[] = [];
  getMemoryLogSinkEntries(entries, handle);
  return entries;
}
