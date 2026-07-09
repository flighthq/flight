import { createImageResourceFromImageElement } from '@flighthq/image';
import { createTextureAtlas, createTextureAtlasRegion, getTextureAtlasRegionById } from '@flighthq/textureatlas';
import type { TextureAtlas, Tileset } from '@flighthq/types';

import { buildTilesetRegions, createTileset, disposeTileset } from './tileset';

describe('buildTilesetRegions', () => {
  it('advances y by tileHeight for each row', () => {
    const source = createImageResourceFromImageElement({ width: 32, height: 64 } as HTMLImageElement);
    const atlas = createTextureAtlas({ image: source });
    const tileset = createTileset({ atlas, columns: 1, rows: 2, tileWidth: 32, tileHeight: 32 });
    buildTilesetRegions(tileset);
    // region 0: column=0, row=0 → x=0, y=0
    expect(atlas.regions[0].x).toBe(0);
    expect(atlas.regions[0].y).toBe(0);
    // region 1: column=0, row=1 → x=0, y=32
    expect(atlas.regions[1].x).toBe(0);
    expect(atlas.regions[1].y).toBe(32);
  });

  it('does nothing when atlas is null', () => {
    const tileset = createTileset({ columns: 2, rows: 2, tileWidth: 32, tileHeight: 32 });
    expect(buildTilesetRegions(tileset)).toBeUndefined();
    expect(tileset.atlas).toBeNull();
  });

  it('honors margin offset for each region', () => {
    const source = createImageResourceFromImageElement({ width: 68, height: 34 } as HTMLImageElement);
    const atlas = createTextureAtlas({ image: source });
    const tileset = createTileset({ atlas, columns: 2, rows: 1, tileWidth: 32, tileHeight: 32, margin: 2 });
    buildTilesetRegions(tileset);
    // margin=2: first tile starts at x=2, second at x=2+32=34
    expect(atlas.regions[0].x).toBe(2);
    expect(atlas.regions[0].y).toBe(2);
    expect(atlas.regions[1].x).toBe(34);
    expect(atlas.regions[1].y).toBe(2);
  });

  it('honors spacing gap between tiles', () => {
    const source = createImageResourceFromImageElement({ width: 66, height: 32 } as HTMLImageElement);
    const atlas = createTextureAtlas({ image: source });
    // spacing=2: two 32x32 tiles with a 2px gap between them
    const tileset = createTileset({ atlas, columns: 2, rows: 1, tileWidth: 32, tileHeight: 32, spacing: 2 });
    buildTilesetRegions(tileset);
    // region 0: x=0, region 1: x=32+2=34
    expect(atlas.regions[0].x).toBe(0);
    expect(atlas.regions[1].x).toBe(34);
  });

  it('positions regions at (column * tileWidth, row * tileHeight)', () => {
    const source = createImageResourceFromImageElement({ width: 64, height: 32 } as HTMLImageElement);
    const atlas = createTextureAtlas({ image: source });
    const tileset = createTileset({ atlas, columns: 2, rows: 1, tileWidth: 32, tileHeight: 32 });
    buildTilesetRegions(tileset);
    // region 0: column=0, row=0 → x=0, y=0
    expect(atlas.regions[0].x).toBe(0);
    expect(atlas.regions[0].y).toBe(0);
    // region 1: column=1, row=0 → x=32, y=0
    expect(atlas.regions[1].x).toBe(32);
    expect(atlas.regions[1].y).toBe(0);
  });

  it('reuses existing region objects when capacity is already available', () => {
    const source = createImageResourceFromImageElement({ width: 64, height: 32 } as HTMLImageElement);
    const atlas = createTextureAtlas({ image: source });
    const firstRegion = {} as TextureAtlas['regions'][number];
    const secondRegion = {} as TextureAtlas['regions'][number];
    atlas.regions.push(firstRegion, secondRegion);
    const tileset = createTileset({ atlas, columns: 2, rows: 1, tileWidth: 32, tileHeight: 32 });

    buildTilesetRegions(tileset);

    expect(atlas.regions).toHaveLength(2);
    expect(atlas.regions[0]).toBe(firstRegion);
    expect(atlas.regions[1]).toBe(secondRegion);
    expect(atlas.regions[0].x).toBe(0);
    expect(atlas.regions[1].x).toBe(32);
  });

  it('truncates stale trailing regions when the grid shrinks after growing', () => {
    const source = createImageResourceFromImageElement({ width: 64, height: 64 } as HTMLImageElement);
    const atlas = createTextureAtlas({ image: source });
    const tileset = createTileset({ atlas, columns: 2, rows: 2, tileWidth: 32, tileHeight: 32 });
    buildTilesetRegions(tileset);
    expect(atlas.regions).toHaveLength(4);

    tileset.columns = 1;
    tileset.rows = 1;
    buildTilesetRegions(tileset);
    expect(atlas.regions).toHaveLength(1);
  });

  it('assigns each region id to its row-major tile index', () => {
    const source = createImageResourceFromImageElement({ width: 64, height: 64 } as HTMLImageElement);
    const atlas = createTextureAtlas({ image: source });
    const tileset = createTileset({ atlas, columns: 2, rows: 2, tileWidth: 32, tileHeight: 32 });
    buildTilesetRegions(tileset);

    expect(atlas.regions.map((region) => region.id)).toEqual([0, 1, 2, 3]);
    expect(getTextureAtlasRegionById(atlas, 3)).toBe(atlas.regions[3]);
  });

  it('clears stale name/rotated/trimmed metadata on a reused region', () => {
    const source = createImageResourceFromImageElement({ width: 32, height: 32 } as HTMLImageElement);
    const atlas = createTextureAtlas({ image: source });
    atlas.regions.push(createTextureAtlasRegion({ id: 99, name: 'stale', rotated: true, trimmed: true }));
    const tileset = createTileset({ atlas, columns: 1, rows: 1, tileWidth: 32, tileHeight: 32 });

    buildTilesetRegions(tileset);

    expect(atlas.regions[0].id).toBe(0);
    expect(atlas.regions[0].name).toBeNull();
    expect(atlas.regions[0].rotated).toBe(false);
    expect(atlas.regions[0].trimmed).toBe(false);
  });
});

describe('createTileset', () => {
  let tileset: Tileset;

  beforeEach(() => {
    tileset = createTileset();
  });

  it('allows pre-defined values', () => {
    const base = {
      atlas: {} as TextureAtlas,
      tileWidth: 10,
      tileHeight: 20,
      rows: 1,
      columns: 2,
      margin: 4,
      spacing: 2,
    };
    const obj = createTileset(base);
    expect(obj.atlas).toStrictEqual(base.atlas);
    expect(obj.tileWidth).toStrictEqual(base.tileWidth);
    expect(obj.tileHeight).toStrictEqual(base.tileHeight);
    expect(obj.rows).toStrictEqual(base.rows);
    expect(obj.columns).toStrictEqual(base.columns);
    expect(obj.margin).toStrictEqual(base.margin);
    expect(obj.spacing).toStrictEqual(base.spacing);
  });

  it('initializes default values', () => {
    expect(tileset.atlas).toBeNull();
    expect(tileset.tileWidth).toStrictEqual(0);
    expect(tileset.tileHeight).toStrictEqual(0);
    expect(tileset.rows).toStrictEqual(0);
    expect(tileset.columns).toStrictEqual(0);
    expect(tileset.margin).toStrictEqual(0);
    expect(tileset.spacing).toStrictEqual(0);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createTileset(base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('disposeTileset', () => {
  it('clears the atlas reference so it becomes eligible for GC', () => {
    const source = createImageResourceFromImageElement({ width: 32, height: 32 } as HTMLImageElement);
    const atlas = createTextureAtlas({ image: source });
    const tileset = createTileset({ atlas, columns: 1, rows: 1, tileWidth: 32, tileHeight: 32 });

    disposeTileset(tileset);

    expect(tileset.atlas).toBeNull();
  });

  it('leaves the grid parameters intact', () => {
    const source = createImageResourceFromImageElement({ width: 64, height: 32 } as HTMLImageElement);
    const atlas = createTextureAtlas({ image: source });
    const tileset = createTileset({ atlas, columns: 2, rows: 1, tileWidth: 32, tileHeight: 16, margin: 4, spacing: 2 });

    disposeTileset(tileset);

    expect(tileset.columns).toBe(2);
    expect(tileset.rows).toBe(1);
    expect(tileset.tileWidth).toBe(32);
    expect(tileset.tileHeight).toBe(16);
    expect(tileset.margin).toBe(4);
    expect(tileset.spacing).toBe(2);
  });

  it('does not erase the shared atlas regions', () => {
    const source = createImageResourceFromImageElement({ width: 64, height: 32 } as HTMLImageElement);
    const atlas = createTextureAtlas({ image: source });
    const tileset = createTileset({ atlas, columns: 2, rows: 1, tileWidth: 32, tileHeight: 32 });
    buildTilesetRegions(tileset);

    disposeTileset(tileset);

    expect(atlas.regions).toHaveLength(2);
  });
});
