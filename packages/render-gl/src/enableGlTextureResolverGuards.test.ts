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

import { areGlTextureResolverGuardsEnabled, enableGlTextureResolverGuards } from './enableGlTextureResolverGuards.ts';
import { createGlState } from './glTestHelper.ts';
import { registerGlTextureResolver, resolveGlTexture } from './glTextureResolver.ts';

// Each test logs into a fresh caller-owned state, so logOnce keys never leak between tests.
let logState: LogState;

beforeEach(() => {
  logState = createLogState();
});

describe('areGlTextureResolverGuardsEnabled', () => {
  it('reports whether diagnostics were installed for the state', () => {
    const { state } = createGlState();
    expect(areGlTextureResolverGuardsEnabled(state)).toBe(false);

    enableGlTextureResolverGuards(state, logState);
    expect(areGlTextureResolverGuardsEnabled(state)).toBe(true);
  });
});

describe('enableGlTextureResolverGuards', () => {
  it('is idempotent', () => {
    const { state } = createGlState();
    enableGlTextureResolverGuards(state, logState);
    enableGlTextureResolverGuards(state, logState);
    expect(areGlTextureResolverGuardsEnabled(state)).toBe(true);
  });

  it('warns once for a missing resolver and stays silent for a registered resolver returning null', () => {
    const { state } = createGlState();
    const missing = textureWithKind('acme.missing.gl');
    const registered = textureWithKind('acme.registered.gl');
    const sink = createMemoryLogSink(4);
    addLogSink(logState, sink.sink);
    enableGlTextureResolverGuards(state, logState);
    registerGlTextureResolver(state, 'acme.registered.gl', () => null);
    try {
      expect(resolveGlTexture(state, missing)).toBeNull();
      expect(resolveGlTexture(state, missing)).toBeNull();
      expect(resolveGlTexture(state, registered)).toBeNull();

      const entries = readMemoryLogEntries(sink);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.data).toMatchObject({
        kind: 'acme.missing.gl',
        message:
          'resolveGlTexture: texture source kind has no registered resolver — rebuild the GlRenderRegistries with the required resolver and create the render state from that registry',
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
