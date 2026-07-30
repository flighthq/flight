import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { ImageResource } from '@flighthq/types/contract';

import { createCanvasRenderState } from './canvasRenderState';
import { registerCanvasTextureResolver, resolveCanvasTexture } from './canvasTextureResolver';
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
    registerCanvasTextureResolver(state, 'acme.registered.canvas', () => null);
    try {
      expect(resolveCanvasTexture(state, missing)).toBeNull();
      expect(resolveCanvasTexture(state, missing)).toBeNull();
      expect(resolveCanvasTexture(state, registered)).toBeNull();

      const entries = getMemoryLogSinkEntries(sink);
      expect(entries).toHaveLength(1);
      expect(entries[0]?.data).toMatchObject({
        kind: 'acme.missing.canvas',
        message:
          'resolveCanvasTexture: texture backing kind has no registered resolver — call registerCanvasTextureResolver(state, backingKind, resolver)',
      });
    } finally {
      removeLogSink(sink.sink);
    }
  });
});

function textureWithKind(kind: string) {
  return createTexture({
    storage: { dimension: '2d', image: { kind } as ImageResource },
  });
}
