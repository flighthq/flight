import { addLogSink, createMemoryLogSink, getMemoryLogSinkEntries, removeLogSink } from '@flighthq/log/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { ImageResource } from '@flighthq/types/contract';

import {
  areTextureAtlasGuardsEnabled,
  disableTextureAtlasGuards,
  enableTextureAtlasGuards,
} from './enableTextureAtlasGuards';
import { createTextureAtlas } from './textureAtlas';
import { addTextureAtlasRegion, getTextureAtlasRegionTexture } from './textureAtlasRegion';

afterEach(() => {
  disableTextureAtlasGuards();
});

describe('areTextureAtlasGuardsEnabled', () => {
  it('reports the current guard state', () => {
    expect(areTextureAtlasGuardsEnabled()).toBe(false);
    enableTextureAtlasGuards();
    expect(areTextureAtlasGuardsEnabled()).toBe(true);
  });
});

describe('disableTextureAtlasGuards', () => {
  it('removes an enabled guard', () => {
    enableTextureAtlasGuards();
    disableTextureAtlasGuards();
    expect(areTextureAtlasGuardsEnabled()).toBe(false);
  });
});

describe('enableTextureAtlasGuards', () => {
  it('warns once when a rotated page cannot mint a region Texture', () => {
    const atlas = createTextureAtlas({
      texture: createTexture({
        dimension: '2d',
        source: { height: 50, width: 100 } as ImageResource,
        uvRotation: 0.25,
      }),
    });
    addTextureAtlasRegion(atlas, 0, 0, 10, 10);
    const sink = createMemoryLogSink(8);
    addLogSink(sink.sink);
    try {
      enableTextureAtlasGuards();

      expect(getTextureAtlasRegionTexture(atlas, 0)).toBeNull();
      expect(getTextureAtlasRegionTexture(atlas, 0)).toBeNull();
      const entries = getMemoryLogSinkEntries(sink);
      expect(entries).toHaveLength(1);
      expect(String((entries[0].data as Record<string, unknown>).message)).toContain('uvRotation');
    } finally {
      removeLogSink(sink.sink);
    }
  });
});
