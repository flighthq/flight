import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { ImageResource } from '@flighthq/types/contract';

import { getCanvasRenderStateTextureResolvers } from './canvasTestSupport';
import { createCanvasRenderState } from './canvasTestSupport';
import { registerCanvasTextureResolver, resolveCanvasTexture } from './canvasTestSupport';
import {
  areCanvasTextureResolverGuardsEnabled,
  enableCanvasTextureResolverGuards,
} from './enableCanvasTextureResolverGuards';

describe('areCanvasTextureResolverGuardsEnabled', () => {
  it('reports whether diagnostics were installed for the state', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    expect(areCanvasTextureResolverGuardsEnabled(state)).toBe(false);

    enableCanvasTextureResolverGuards(state);
    expect(areCanvasTextureResolverGuardsEnabled(state)).toBe(true);
  });
});

describe('enableCanvasTextureResolverGuards', () => {
  it('is idempotent', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    enableCanvasTextureResolverGuards(state);
    enableCanvasTextureResolverGuards(state);
    expect(areCanvasTextureResolverGuardsEnabled(state)).toBe(true);
  });

  it('warns once for a missing resolver and stays silent for a registered resolver returning null', () => {
    const state = createCanvasRenderState(document.createElement('canvas'));
    const missing = textureWithKind('acme.missing.canvas');
    const registered = textureWithKind('acme.registered.canvas');
    const sink = createMemoryLogSink(4);
    addLogSink(sink.sink);
    enableCanvasTextureResolverGuards(state);
    registerCanvasTextureResolver(getCanvasRenderStateTextureResolvers(state), 'acme.registered.canvas', () => null);
    try {
      expect(resolveCanvasTexture(getCanvasRenderStateTextureResolvers(state), missing)).toBeNull();
      expect(resolveCanvasTexture(getCanvasRenderStateTextureResolvers(state), missing)).toBeNull();
      expect(resolveCanvasTexture(getCanvasRenderStateTextureResolvers(state), registered)).toBeNull();

      const entries = getMemoryLogSinkEntries(sink);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.data).toMatchObject({
        kind: 'acme.missing.canvas',
        message:
          'resolveCanvasTexture: texture source kind has no registered resolver — call registerCanvasTextureResolver(resolvers, sourceKind, resolver) on the set the caller resolves through',
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
