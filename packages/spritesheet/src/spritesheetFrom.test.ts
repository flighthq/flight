import { createTextureAtlas, createTextureAtlasRegion } from '@flighthq/textureatlas';
import { buildTilesetRegions, createTileset } from '@flighthq/tileset';

import { createSpritesheetAnimationData, createSpritesheetData, createSpritesheetFrameData } from './spritesheetData';
import { createSpritesheetFromData, createSpritesheetFromGrid, createSpritesheetFromTileset } from './spritesheetFrom';

function makeTileset(columns: number, rows: number) {
  const atlas = createTextureAtlas();
  const tileset = createTileset({ atlas, columns, rows, tileWidth: 32, tileHeight: 32 });
  buildTilesetRegions(tileset);
  return tileset;
}

describe('createSpritesheetFromData', () => {
  it('builds one frame per SpritesheetFrameData entry', () => {
    const atlas = createTextureAtlas();
    atlas.regions.push(
      createTextureAtlasRegion({ id: 0, name: 'hero_0', x: 0, y: 0, width: 32, height: 32 }),
      createTextureAtlasRegion({ id: 1, name: 'hero_1', x: 32, y: 0, width: 32, height: 32 }),
    );
    const data = createSpritesheetData({
      frames: [
        createSpritesheetFrameData({ name: 'hero_0', offsetX: 0, offsetY: 0 }),
        createSpritesheetFrameData({ name: 'hero_1', offsetX: 4, offsetY: 0 }),
      ],
      imageFile: 'hero.png',
      imageHeight: 64,
      imageWidth: 64,
    });
    const sheet = createSpritesheetFromData(data, atlas);
    expect(sheet.frames).toHaveLength(2);
    expect(sheet.frames[0].id).toBe(0);
    expect(sheet.frames[1].id).toBe(1);
    expect(sheet.frames[1].offsetX).toBe(4);
  });

  it('resolves frame region IDs by name', () => {
    const atlas = createTextureAtlas();
    atlas.regions.push(createTextureAtlasRegion({ id: 5, name: 'walk_0', x: 0, y: 0, width: 32, height: 32 }));
    const data = createSpritesheetData({
      frames: [createSpritesheetFrameData({ name: 'walk_0' })],
      imageHeight: 32,
      imageWidth: 32,
    });
    const sheet = createSpritesheetFromData(data, atlas);
    expect(sheet.frames[0].id).toBe(5);
  });

  it('falls back to positional index when frame name is empty', () => {
    const atlas = createTextureAtlas();
    atlas.regions.push(createTextureAtlasRegion({ id: 0, name: null, x: 0, y: 0, width: 32, height: 32 }));
    const data = createSpritesheetData({
      frames: [createSpritesheetFrameData({ name: '' })],
      imageHeight: 32,
      imageWidth: 32,
    });
    const sheet = createSpritesheetFromData(data, atlas);
    expect(sheet.frames[0].id).toBe(0);
  });

  it('builds animations keyed by name with direction and frameDurations', () => {
    const atlas = createTextureAtlas();
    atlas.regions.push(
      createTextureAtlasRegion({ id: 0, name: 'f0', x: 0, y: 0, width: 32, height: 32 }),
      createTextureAtlasRegion({ id: 1, name: 'f1', x: 32, y: 0, width: 32, height: 32 }),
    );
    const data = createSpritesheetData({
      animations: [
        createSpritesheetAnimationData({
          name: 'walk',
          direction: 'pingpong',
          frameDuration: 100,
          frameDurations: [80, 120],
          frameNames: ['f0', 'f1'],
          loop: true,
        }),
      ],
      frames: [createSpritesheetFrameData({ name: 'f0' }), createSpritesheetFrameData({ name: 'f1' })],
      imageHeight: 32,
      imageWidth: 64,
    });
    const sheet = createSpritesheetFromData(data, atlas);
    const walk = sheet.animations['walk'];
    expect(walk).toBeDefined();
    expect(walk.direction).toBe('pingpong');
    expect(walk.frameDurations).toEqual([80, 120]);
    expect(walk.frames).toEqual([0, 1]);
    expect(walk.loop).toBe(true);
  });

  it('carries pivot and rotated onto runtime frames', () => {
    const atlas = createTextureAtlas();
    atlas.regions.push(createTextureAtlasRegion({ id: 0, name: 'r0', x: 0, y: 0, width: 32, height: 32 }));
    const data = createSpritesheetData({
      frames: [createSpritesheetFrameData({ name: 'r0', pivotX: 8, pivotY: 16, rotated: true })],
      imageHeight: 32,
      imageWidth: 32,
    });
    const sheet = createSpritesheetFromData(data, atlas);
    expect(sheet.frames[0].pivotX).toBe(8);
    expect(sheet.frames[0].pivotY).toBe(16);
    expect(sheet.frames[0].rotated).toBe(true);
  });

  it('uses all data frames when animation has no frameNames', () => {
    const atlas = createTextureAtlas();
    atlas.regions.push(
      createTextureAtlasRegion({ id: 0, name: null, x: 0, y: 0, width: 32, height: 32 }),
      createTextureAtlasRegion({ id: 1, name: null, x: 32, y: 0, width: 32, height: 32 }),
    );
    const data = createSpritesheetData({
      animations: [createSpritesheetAnimationData({ name: 'idle', frameNames: [] })],
      frames: [createSpritesheetFrameData({ name: '' }), createSpritesheetFrameData({ name: '' })],
      imageHeight: 32,
      imageWidth: 64,
    });
    const sheet = createSpritesheetFromData(data, atlas);
    expect(sheet.animations['idle'].frames).toEqual([0, 1]);
  });
});

describe('createSpritesheetFromGrid', () => {
  it('creates one frame per cell in row-major order', () => {
    const sheet = createSpritesheetFromGrid({
      columns: 4,
      rows: 2,
      imageFile: 'sheet.png',
      imageWidth: 128,
      imageHeight: 64,
    });
    expect(sheet.frames).toHaveLength(8);
    expect(sheet.atlas!.regions).toHaveLength(8);
  });
  it('assigns sequential IDs starting at 0', () => {
    const sheet = createSpritesheetFromGrid({
      columns: 2,
      rows: 1,
      imageFile: 'sheet.png',
      imageWidth: 64,
      imageHeight: 32,
    });
    expect(sheet.frames[0].id).toBe(0);
    expect(sheet.frames[1].id).toBe(1);
  });
  it('computes cell x/y positions correctly with no margin or spacing', () => {
    const sheet = createSpritesheetFromGrid({
      columns: 2,
      rows: 2,
      imageFile: 'sheet.png',
      imageWidth: 64,
      imageHeight: 64,
    });
    const regions = sheet.atlas!.regions;
    expect(regions[0].x).toBe(0);
    expect(regions[0].y).toBe(0);
    expect(regions[1].x).toBe(32);
    expect(regions[1].y).toBe(0);
    expect(regions[2].x).toBe(0);
    expect(regions[2].y).toBe(32);
    expect(regions[3].x).toBe(32);
    expect(regions[3].y).toBe(32);
  });
  it('accounts for marginX, marginY, spacingX, and spacingY', () => {
    const sheet = createSpritesheetFromGrid({
      columns: 2,
      rows: 1,
      imageFile: 'sheet.png',
      imageWidth: 74,
      imageHeight: 36,
      frameWidth: 32,
      frameHeight: 32,
      marginX: 2,
      marginY: 2,
      spacingX: 4,
      spacingY: 0,
    });
    const regions = sheet.atlas!.regions;
    expect(regions[0].x).toBe(2);
    expect(regions[0].y).toBe(2);
    expect(regions[1].x).toBe(38); // 2 + 32 + 4
    expect(regions[1].y).toBe(2);
  });
  it('uses a custom namePrefix for region names', () => {
    const sheet = createSpritesheetFromGrid({
      columns: 2,
      rows: 1,
      imageFile: 'sheet.png',
      imageWidth: 64,
      imageHeight: 32,
      namePrefix: 'hero_',
    });
    expect(sheet.atlas!.regions[0].name).toBe('hero_0');
    expect(sheet.atlas!.regions[1].name).toBe('hero_1');
  });
  it('uses explicit frameWidth and frameHeight over derived values', () => {
    const sheet = createSpritesheetFromGrid({
      columns: 2,
      rows: 1,
      imageFile: 'sheet.png',
      imageWidth: 80,
      imageHeight: 40,
      frameWidth: 30,
      frameHeight: 40,
    });
    const regions = sheet.atlas!.regions;
    expect(regions[0].width).toBe(30);
    expect(regions[0].height).toBe(40);
  });
  it('creates a new atlas with no image (caller must assign image)', () => {
    const sheet = createSpritesheetFromGrid({
      columns: 1,
      rows: 1,
      imageFile: 'sheet.png',
      imageWidth: 32,
      imageHeight: 32,
    });
    expect(sheet.atlas!.image).toBeNull();
  });
});

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
