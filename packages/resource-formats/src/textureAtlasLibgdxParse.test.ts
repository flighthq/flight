import { createTextureAtlas } from '@flighthq/textureatlas';

import { parseTextureAtlasLibgdxAtlas } from './textureAtlasLibgdxParse';

const SIMPLE_ATLAS = `
atlas.png
size: 256,256
format: RGBA8888
filter: Nearest,Nearest
repeat: none
hero_idle
  rotate: false
  xy: 0, 0
  size: 64, 64
  orig: 64, 64
  offset: 0, 0
  index: -1
hero_walk
  rotate: false
  xy: 64, 0
  size: 48, 56
  orig: 64, 64
  offset: 8, 4
  index: -1
hero_run
  rotate: true
  xy: 112, 0
  size: 32, 48
  orig: 48, 32
  offset: 0, 0
  index: -1
`;

describe('parseTextureAtlasLibgdxAtlas', () => {
  it('populates regions from a libGDX atlas string', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasLibgdxAtlas(SIMPLE_ATLAS, atlas);
    expect(atlas.regions).toHaveLength(3);
  });
  it('assigns sequential ids starting at 0', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasLibgdxAtlas(SIMPLE_ATLAS, atlas);
    expect(atlas.regions[0].id).toBe(0);
    expect(atlas.regions[2].id).toBe(2);
  });
  it('sets region name', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasLibgdxAtlas(SIMPLE_ATLAS, atlas);
    expect(atlas.regions[0].name).toBe('hero_idle');
    expect(atlas.regions[1].name).toBe('hero_walk');
  });
  it('sets x/y/width/height from xy and size', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasLibgdxAtlas(SIMPLE_ATLAS, atlas);
    expect(atlas.regions[0].x).toBe(0);
    expect(atlas.regions[0].y).toBe(0);
    expect(atlas.regions[0].width).toBe(64);
    expect(atlas.regions[0].height).toBe(64);
    expect(atlas.regions[1].x).toBe(64);
    expect(atlas.regions[1].width).toBe(48);
  });
  it('sets trimmed fields when orig differs from size', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasLibgdxAtlas(SIMPLE_ATLAS, atlas);
    const walk = atlas.regions[1];
    expect(walk.trimmed).toBe(true);
    expect(walk.originalWidth).toBe(64);
    expect(walk.originalHeight).toBe(64);
    expect(walk.sourceX).toBe(8);
    expect(walk.sourceY).toBe(4);
  });
  it('marks non-trimmed regions correctly', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasLibgdxAtlas(SIMPLE_ATLAS, atlas);
    expect(atlas.regions[0].trimmed).toBe(false);
    expect(atlas.regions[0].originalWidth).toBeNull();
  });
  it('sets rotated on rotated regions', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasLibgdxAtlas(SIMPLE_ATLAS, atlas);
    expect(atlas.regions[2].rotated).toBe(true);
    expect(atlas.regions[0].rotated).toBe(false);
  });
  it('appends index to name when index >= 0', () => {
    const indexedAtlas = `
atlas.png
size: 256,256
format: RGBA8888
filter: Nearest,Nearest
repeat: none
hero_walk
  rotate: false
  xy: 0, 0
  size: 64, 64
  orig: 64, 64
  offset: 0, 0
  index: 1
`;
    const atlas = createTextureAtlas();
    parseTextureAtlasLibgdxAtlas(indexedAtlas, atlas);
    expect(atlas.regions[0].name).toBe('hero_walk_1');
  });
  it('clears existing regions before parsing', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasLibgdxAtlas(SIMPLE_ATLAS, atlas);
    parseTextureAtlasLibgdxAtlas(SIMPLE_ATLAS, atlas);
    expect(atlas.regions).toHaveLength(3);
  });
  it('returns the atlas for chaining', () => {
    const atlas = createTextureAtlas();
    const result = parseTextureAtlasLibgdxAtlas(SIMPLE_ATLAS, atlas);
    expect(result).toBe(atlas);
  });
});
