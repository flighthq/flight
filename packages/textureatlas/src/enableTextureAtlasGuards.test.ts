import { addLogSink, createLogState, createMemoryLogSink, getMemoryLogSinkEntries } from '@flighthq/log/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { LogEntry } from '@flighthq/types/contract';
import type { ImageResource } from '@flighthq/types/contract';

import {
  areTextureAtlasGuardsEnabled,
  disableTextureAtlasGuards,
  enableTextureAtlasGuards,
} from './enableTextureAtlasGuards.ts';
import { createTextureAtlas } from './textureAtlas.ts';
import { addTextureAtlasRegion, getTextureAtlasRegionTexture } from './textureAtlasRegion.ts';

afterEach(() => {
  disableTextureAtlasGuards();
});

describe('areTextureAtlasGuardsEnabled', () => {
  it('reports the current guard state', () => {
    expect(areTextureAtlasGuardsEnabled()).toBe(false);
    enableTextureAtlasGuards(createLogState(), () => 0);
    expect(areTextureAtlasGuardsEnabled()).toBe(true);
  });
});

describe('disableTextureAtlasGuards', () => {
  it('removes an enabled guard', () => {
    enableTextureAtlasGuards(createLogState(), () => 0);
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
    const logState = createLogState();
    const sink = createMemoryLogSink(8);
    addLogSink(logState, sink.sink);
    enableTextureAtlasGuards(logState, () => 0);

    expect(getTextureAtlasRegionTexture(atlas, 0)).toBeNull();
    expect(getTextureAtlasRegionTexture(atlas, 0)).toBeNull();
    const entries: LogEntry[] = [];
    getMemoryLogSinkEntries(entries, sink);
    expect(entries).toHaveLength(1);
    expect(String((entries[0].data as Record<string, unknown>).message)).toContain('uvRotation');
  });
});
