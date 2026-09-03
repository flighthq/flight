import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { ImageResource } from '@flighthq/types/contract';

import { createDomRenderState } from './domRenderState';
import { registerDomTextureResolver, resolveDomTexture } from './domTextureResolver';
import { areDomTextureResolverGuardsEnabled, enableDomTextureResolverGuards } from './enableDomTextureResolverGuards';

describe('areDomTextureResolverGuardsEnabled', () => {
  it('reports whether diagnostics were installed for the state', () => {
    const state = createDomRenderState(document.createElement('div'));
    expect(areDomTextureResolverGuardsEnabled(state)).toBe(false);

    enableDomTextureResolverGuards(state);
    expect(areDomTextureResolverGuardsEnabled(state)).toBe(true);
  });
});

describe('enableDomTextureResolverGuards', () => {
  it('is idempotent', () => {
    const state = createDomRenderState(document.createElement('div'));
    enableDomTextureResolverGuards(state);
    enableDomTextureResolverGuards(state);
    expect(areDomTextureResolverGuardsEnabled(state)).toBe(true);
  });

  it('warns once for a missing resolver and stays silent for a registered resolver returning null', () => {
    const state = createDomRenderState(document.createElement('div'));
    const missing = textureWithKind('acme.missing.dom');
    const registered = textureWithKind('acme.registered.dom');
    const sink = createMemoryLogSink(4);
    addLogSink(sink.sink);
    enableDomTextureResolverGuards(state);
    registerDomTextureResolver(state, 'acme.registered.dom', () => null);
    try {
      expect(resolveDomTexture(state, missing)).toBeNull();
      expect(resolveDomTexture(state, missing)).toBeNull();
      expect(resolveDomTexture(state, registered)).toBeNull();

      const entries = getMemoryLogSinkEntries(sink);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.data).toMatchObject({
        kind: 'acme.missing.dom',
        message:
          'resolveDomTexture: texture source kind has no registered resolver — call registerDomTextureResolver(state, sourceKind, resolver)',
      });
    } finally {
      removeLogSink(sink.sink);
    }
  });
});

function textureWithKind(kind: string) {
  return createTexture({
    dimension: '2d',
    source: { kind } as ImageResource,
  });
}
