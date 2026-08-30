import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { Image } from '@flighthq/types/contract';

import { areGlTextureResolverGuardsEnabled, enableGlTextureResolverGuards } from './enableGlTextureResolverGuards';
import { createGlState } from './glTestHelper';
import { registerGlTextureResolver, resolveGlTexture } from './glTextureResolver';

describe('areGlTextureResolverGuardsEnabled', () => {
  it('reports whether diagnostics were installed for the state', () => {
    const { state } = createGlState();
    expect(areGlTextureResolverGuardsEnabled(state)).toBe(false);

    enableGlTextureResolverGuards(state);
    expect(areGlTextureResolverGuardsEnabled(state)).toBe(true);
  });
});

describe('enableGlTextureResolverGuards', () => {
  it('is idempotent', () => {
    const { state } = createGlState();
    enableGlTextureResolverGuards(state);
    enableGlTextureResolverGuards(state);
    expect(areGlTextureResolverGuardsEnabled(state)).toBe(true);
  });

  it('warns once for a missing resolver and stays silent for a registered resolver returning null', () => {
    const { state } = createGlState();
    const missing = textureWithKind('acme.missing.gl');
    const registered = textureWithKind('acme.registered.gl');
    const sink = createMemoryLogSink(4);
    addLogSink(sink.sink);
    enableGlTextureResolverGuards(state);
    registerGlTextureResolver(state, 'acme.registered.gl', () => null);
    try {
      expect(resolveGlTexture(state, missing)).toBeNull();
      expect(resolveGlTexture(state, missing)).toBeNull();
      expect(resolveGlTexture(state, registered)).toBeNull();

      const entries = getMemoryLogSinkEntries(sink);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.data).toMatchObject({
        kind: 'acme.missing.gl',
        message:
          'resolveGlTexture: texture source kind has no registered resolver — rebuild the GlPipeline with the required resolver and create the render state from that pipeline',
      });
    } finally {
      removeLogSink(sink.sink);
    }
  });
});

function textureWithKind(kind: string) {
  return createTexture({
    dimension: '2d',
    source: { kind } as Image,
  });
}
