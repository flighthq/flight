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

import { createDomRenderState } from './domRenderState.ts';
import { registerDomTextureResolver, resolveDomTexture } from './domTextureResolver.ts';
import {
  areDomTextureResolverGuardsEnabled,
  enableDomTextureResolverGuards,
} from './enableDomTextureResolverGuards.ts';

// Each test logs into a fresh caller-owned state, so logOnce keys never leak between tests.
let logState: LogState;

beforeEach(() => {
  logState = createLogState();
});

describe('areDomTextureResolverGuardsEnabled', () => {
  it('reports whether diagnostics were installed for the state', () => {
    const state = createDomRenderState(document.createElement('div'));
    expect(areDomTextureResolverGuardsEnabled(state)).toBe(false);

    enableDomTextureResolverGuards(state, logState);
    expect(areDomTextureResolverGuardsEnabled(state)).toBe(true);
  });
});

describe('enableDomTextureResolverGuards', () => {
  it('is idempotent', () => {
    const state = createDomRenderState(document.createElement('div'));
    enableDomTextureResolverGuards(state, logState);
    enableDomTextureResolverGuards(state, logState);
    expect(areDomTextureResolverGuardsEnabled(state)).toBe(true);
  });

  it('warns once for a missing resolver and stays silent for a registered resolver returning null', () => {
    const state = createDomRenderState(document.createElement('div'));
    const missing = textureWithKind('acme.missing.dom');
    const registered = textureWithKind('acme.registered.dom');
    const sink = createMemoryLogSink(4);
    addLogSink(logState, sink.sink);
    enableDomTextureResolverGuards(state, logState);
    registerDomTextureResolver(state, 'acme.registered.dom', () => null);
    try {
      expect(resolveDomTexture(state, missing)).toBeNull();
      expect(resolveDomTexture(state, missing)).toBeNull();
      expect(resolveDomTexture(state, registered)).toBeNull();

      const entries = readMemoryLogEntries(sink);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.data).toMatchObject({
        kind: 'acme.missing.dom',
        message:
          'resolveDomTexture: texture source kind has no registered resolver — call registerDomTextureResolver(state, sourceKind, resolver)',
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
