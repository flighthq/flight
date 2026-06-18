import { buildTilesetRegions, createTextureAtlas, createTileset } from '@flighthq/resources';

import { createSpritesheetFromTileset } from './spritesheetFrom';

function makeTileset(columns: number, rows: number) {
  const atlas = createTextureAtlas();
  const tileset = createTileset({ atlas, columns, rows, tileWidth: 32, tileHeight: 32 });
  buildTilesetRegions(tileset);
  return tileset;
}

describe('createSpritesheetFromTileset', () => {
  it('creates one frame per tile region', () => {
    const tileset = makeTileset(3, 2);
    const sheet = createSpritesheetFromTileset(tileset);

    expect(sheet.frames).toHaveLength(6);
  });

  it('assigns region ids to frames in order', () => {
    const tileset = makeTileset(2, 1);
    const sheet = createSpritesheetFromTileset(tileset);
    const regions = tileset.atlas?.regions ?? [];

    expect(sheet.frames[0].id).toBe(regions[0].id);
    expect(sheet.frames[1].id).toBe(regions[1].id);
  });

  it('passes the atlas through to the spritesheet', () => {
    const tileset = makeTileset(1, 1);
    const sheet = createSpritesheetFromTileset(tileset);

    expect(sheet.atlas).toBe(tileset.atlas);
  });

  it('produces no frames when atlas is null', () => {
    const tileset = createTileset();
    const sheet = createSpritesheetFromTileset(tileset);

    expect(sheet.frames).toHaveLength(0);
    expect(sheet.atlas).toBeNull();
  });

  it('starts with no animations', () => {
    const tileset = makeTileset(2, 2);
    const sheet = createSpritesheetFromTileset(tileset);

    expect(Object.keys(sheet.animations)).toHaveLength(0);
  });
});
