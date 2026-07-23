import { createTextureAtlas } from '@flighthq/textureatlas';
import type { TextureAtlasAsepriteArrayDocument, TextureAtlasAsepriteHashDocument } from '@flighthq/types';

import { parseTextureAtlasAsepriteDocument, parseTextureAtlasAsepriteJson } from './textureAtlasAsepriteParse';

const HASH_DOC: TextureAtlasAsepriteHashDocument = {
  frames: {
    'hero_idle.png': {
      duration: 100,
      frame: { x: 0, y: 0, w: 64, h: 64 },
      rotated: false,
      sourceSize: { w: 64, h: 64 },
      spriteSourceSize: { x: 0, y: 0, w: 64, h: 64 },
      trimmed: false,
    },
    'hero_walk.png': {
      duration: 80,
      frame: { x: 64, y: 0, w: 48, h: 56 },
      rotated: false,
      sourceSize: { w: 64, h: 64 },
      spriteSourceSize: { x: 8, y: 4, w: 48, h: 56 },
      trimmed: true,
    },
  },
  meta: {
    app: 'https://www.aseprite.org/',
    format: 'RGBA8888',
    image: 'atlas.png',
    scale: 1,
    size: { w: 256, h: 256 },
    version: '1.3',
  },
};

const ARRAY_DOC: TextureAtlasAsepriteArrayDocument = {
  frames: [
    {
      duration: 100,
      filename: 'tile_0.png',
      frame: { x: 0, y: 0, w: 32, h: 32 },
      rotated: false,
      sourceSize: { w: 32, h: 32 },
      spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
      trimmed: false,
    },
  ],
  meta: {
    app: 'https://www.aseprite.org/',
    format: 'RGBA8888',
    image: 'tiles.png',
    scale: '1',
    size: { w: 32, h: 32 },
    version: '1.3',
  },
};

describe('parseTextureAtlasAsepriteDocument', () => {
  it('populates regions from a hash-format document', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasAsepriteDocument(HASH_DOC, atlas);
    expect(atlas.regions).toHaveLength(2);
  });
  it('populates regions from an array-format document', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasAsepriteDocument(ARRAY_DOC, atlas);
    expect(atlas.regions).toHaveLength(1);
    expect(atlas.regions[0].name).toBe('tile_0.png');
  });
  it('assigns sequential ids starting at 0', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasAsepriteDocument(ARRAY_DOC, atlas);
    expect(atlas.regions[0].id).toBe(0);
  });
  it('sets x/y/width/height from frame', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasAsepriteDocument(ARRAY_DOC, atlas);
    expect(atlas.regions[0].x).toBe(0);
    expect(atlas.regions[0].y).toBe(0);
    expect(atlas.regions[0].width).toBe(32);
    expect(atlas.regions[0].height).toBe(32);
  });
  it('sets trimmed fields when frame is trimmed', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasAsepriteDocument(HASH_DOC, atlas);
    const walk = atlas.regions.find((r) => r.name === 'hero_walk.png')!;
    expect(walk.trimmed).toBe(true);
    expect(walk.originalWidth).toBe(64);
    expect(walk.originalHeight).toBe(64);
    expect(walk.sourceX).toBe(8);
    expect(walk.sourceY).toBe(4);
  });
  it('sets null originalWidth/Height when not trimmed', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasAsepriteDocument(HASH_DOC, atlas);
    const idle = atlas.regions.find((r) => r.name === 'hero_idle.png')!;
    expect(idle.trimmed).toBe(false);
    expect(idle.originalWidth).toBeNull();
    expect(idle.originalHeight).toBeNull();
  });
  it('sets null pivot (Aseprite does not export pivot)', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasAsepriteDocument(ARRAY_DOC, atlas);
    expect(atlas.regions[0].pivotX).toBeNull();
    expect(atlas.regions[0].pivotY).toBeNull();
  });
  it('clears existing regions before parsing', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasAsepriteDocument(ARRAY_DOC, atlas);
    parseTextureAtlasAsepriteDocument(ARRAY_DOC, atlas);
    expect(atlas.regions).toHaveLength(1);
  });
  it('returns the atlas for chaining', () => {
    const atlas = createTextureAtlas();
    const result = parseTextureAtlasAsepriteDocument(ARRAY_DOC, atlas);
    expect(result).toBe(atlas);
  });
});

describe('parseTextureAtlasAsepriteJson', () => {
  it('parses a JSON string and populates atlas regions', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasAsepriteJson(JSON.stringify(ARRAY_DOC), atlas);
    expect(atlas.regions).toHaveLength(1);
    expect(atlas.regions[0].name).toBe('tile_0.png');
  });
  it('returns the atlas for chaining', () => {
    const atlas = createTextureAtlas();
    const result = parseTextureAtlasAsepriteJson(JSON.stringify(ARRAY_DOC), atlas);
    expect(result).toBe(atlas);
  });
});
