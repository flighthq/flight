import { createTextureAtlas } from '@flighthq/textureatlas';

import { parseTextureAtlasPackerDocument, parseTextureAtlasPackerJson } from './textureAtlasPackerParse';
import type { TextureAtlasPackerArrayDocument, TextureAtlasPackerHashDocument } from './textureAtlasPackerSchema';

// Minimal TexturePacker JSON-Hash fixture
const HASH_FIXTURE: TextureAtlasPackerHashDocument = {
  frames: {
    'hero_idle_0.png': {
      frame: { x: 0, y: 0, w: 64, h: 64 },
      pivot: { x: 0.5, y: 0.5 },
      rotated: false,
      sourceSize: { w: 64, h: 64 },
      spriteSourceSize: { x: 0, y: 0, w: 64, h: 64 },
      trimmed: false,
    },
    'hero_walk_0.png': {
      frame: { x: 64, y: 0, w: 48, h: 56 },
      pivot: { x: 0.5, y: 1.0 },
      rotated: false,
      sourceSize: { w: 64, h: 64 },
      spriteSourceSize: { x: 8, y: 4, w: 48, h: 56 },
      trimmed: true,
    },
  },
  meta: {
    app: 'https://www.codeandweb.com/texturepacker',
    format: 'RGBA8888',
    image: 'atlas.png',
    scale: 1,
    size: { w: 256, h: 256 },
    version: '1.0',
  },
};

// Minimal TexturePacker JSON-Array fixture
const ARRAY_FIXTURE: TextureAtlasPackerArrayDocument = {
  frames: [
    {
      filename: 'tile_0.png',
      frame: { x: 0, y: 0, w: 32, h: 32 },
      rotated: false,
      sourceSize: { w: 32, h: 32 },
      spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
      trimmed: false,
    },
    {
      filename: 'tile_1.png',
      frame: { x: 32, y: 0, w: 32, h: 32 },
      rotated: true,
      sourceSize: { w: 32, h: 32 },
      spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
      trimmed: false,
    },
  ],
  meta: {
    app: 'https://www.codeandweb.com/texturepacker',
    format: 'RGBA8888',
    image: 'tiles.png',
    scale: '1',
    size: { w: 64, h: 32 },
    version: '1.0',
  },
};

describe('parseTextureAtlasPackerDocument', () => {
  it('populates regions from a hash-format document', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasPackerDocument(HASH_FIXTURE, atlas);
    expect(atlas.regions).toHaveLength(2);
  });
  it('populates regions from an array-format document', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasPackerDocument(ARRAY_FIXTURE, atlas);
    expect(atlas.regions).toHaveLength(2);
  });
  it('sets region name from the frame key (hash format)', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasPackerDocument(HASH_FIXTURE, atlas);
    const names = atlas.regions.map((r) => r.name);
    expect(names).toContain('hero_idle_0.png');
    expect(names).toContain('hero_walk_0.png');
  });
  it('sets region name from filename field (array format)', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasPackerDocument(ARRAY_FIXTURE, atlas);
    expect(atlas.regions[0].name).toBe('tile_0.png');
    expect(atlas.regions[1].name).toBe('tile_1.png');
  });
  it('assigns sequential ids starting at 0', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasPackerDocument(ARRAY_FIXTURE, atlas);
    expect(atlas.regions[0].id).toBe(0);
    expect(atlas.regions[1].id).toBe(1);
  });
  it('populates x/y/width/height from the frame rect', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasPackerDocument(ARRAY_FIXTURE, atlas);
    expect(atlas.regions[0].x).toBe(0);
    expect(atlas.regions[0].y).toBe(0);
    expect(atlas.regions[0].width).toBe(32);
    expect(atlas.regions[0].height).toBe(32);
  });
  it('sets trimmed fields when the frame is trimmed', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasPackerDocument(HASH_FIXTURE, atlas);
    const trimmed = atlas.regions.find((r) => r.name === 'hero_walk_0.png');
    expect(trimmed).toBeDefined();
    expect(trimmed!.trimmed).toBe(true);
    expect(trimmed!.sourceX).toBe(8);
    expect(trimmed!.sourceY).toBe(4);
    expect(trimmed!.originalWidth).toBe(64);
    expect(trimmed!.originalHeight).toBe(64);
  });
  it('sets null originalWidth/Height when the frame is not trimmed', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasPackerDocument(HASH_FIXTURE, atlas);
    const idle = atlas.regions.find((r) => r.name === 'hero_idle_0.png')!;
    expect(idle.trimmed).toBe(false);
    expect(idle.originalWidth).toBeNull();
    expect(idle.originalHeight).toBeNull();
  });
  it('sets pivot when pivot is present', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasPackerDocument(HASH_FIXTURE, atlas);
    const idle = atlas.regions.find((r) => r.name === 'hero_idle_0.png')!;
    expect(idle.pivotX).toBe(0.5);
    expect(idle.pivotY).toBe(0.5);
  });
  it('sets null pivot when pivot is absent', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasPackerDocument(ARRAY_FIXTURE, atlas);
    expect(atlas.regions[0].pivotX).toBeNull();
    expect(atlas.regions[0].pivotY).toBeNull();
  });
  it('sets rotated on rotated regions', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasPackerDocument(ARRAY_FIXTURE, atlas);
    expect(atlas.regions[0].rotated).toBe(false);
    expect(atlas.regions[1].rotated).toBe(true);
  });
  it('swaps width/height for rotated regions', () => {
    // Rotated 90°: packed w=32,h=32 with rotation → logical w=h, h=w (same here since square)
    const rotatedDoc: TextureAtlasPackerArrayDocument = {
      frames: [
        {
          filename: 'rotated.png',
          frame: { x: 0, y: 0, w: 20, h: 40 },
          rotated: true,
          sourceSize: { w: 40, h: 20 },
          spriteSourceSize: { x: 0, y: 0, w: 40, h: 20 },
          trimmed: false,
        },
      ],
      meta: { app: 'tp', format: 'RGBA8888', image: 'a.png', scale: 1, size: { w: 64, h: 64 }, version: '1.0' },
    };
    const atlas = createTextureAtlas();
    parseTextureAtlasPackerDocument(rotatedDoc, atlas);
    // When rotated: logical width = packed h, logical height = packed w
    expect(atlas.regions[0].width).toBe(40);
    expect(atlas.regions[0].height).toBe(20);
  });
  it('clears existing regions before parsing', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasPackerDocument(ARRAY_FIXTURE, atlas);
    parseTextureAtlasPackerDocument(ARRAY_FIXTURE, atlas);
    expect(atlas.regions).toHaveLength(2);
  });
  it('returns the atlas for chaining', () => {
    const atlas = createTextureAtlas();
    const result = parseTextureAtlasPackerDocument(HASH_FIXTURE, atlas);
    expect(result).toBe(atlas);
  });
});

describe('parseTextureAtlasPackerJson', () => {
  it('parses a JSON string and populates atlas regions', () => {
    const atlas = createTextureAtlas();
    const json = JSON.stringify(ARRAY_FIXTURE);
    parseTextureAtlasPackerJson(json, atlas);
    expect(atlas.regions).toHaveLength(2);
    expect(atlas.regions[0].name).toBe('tile_0.png');
  });
  it('accepts an optional stripPathPrefix option', () => {
    const docWithPaths: TextureAtlasPackerHashDocument = {
      frames: {
        'sprites/hero.png': {
          frame: { x: 0, y: 0, w: 32, h: 32 },
          rotated: false,
          sourceSize: { w: 32, h: 32 },
          spriteSourceSize: { x: 0, y: 0, w: 32, h: 32 },
          trimmed: false,
        },
      },
      meta: { app: 'tp', format: 'RGBA8888', image: 'a.png', scale: 1, size: { w: 64, h: 64 }, version: '1.0' },
    };
    const atlas = createTextureAtlas();
    parseTextureAtlasPackerJson(JSON.stringify(docWithPaths), atlas, { stripPathPrefix: true });
    expect(atlas.regions[0].name).toBe('hero.png');
  });
  it('returns the atlas for chaining', () => {
    const atlas = createTextureAtlas();
    const result = parseTextureAtlasPackerJson(JSON.stringify(ARRAY_FIXTURE), atlas);
    expect(result).toBe(atlas);
  });
});
