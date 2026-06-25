import { createRectangle, createVector2 } from '@flighthq/geometry';
import type { TextureAtlasRegion } from '@flighthq/types';

import { createTextureAtlas } from './textureAtlas';
import {
  addTextureAtlasRegion,
  addTextureAtlasRegionRectangle,
  addTextureAtlasRegionRectangleXY,
  addTextureAtlasRegionVector2,
  createTextureAtlasRegion,
  getTextureAtlasRegionById,
  getTextureAtlasRegionByName,
  getTextureAtlasRegionSequence,
  getTextureAtlasRegionUv,
  setTextureAtlasRegion,
} from './textureAtlasRegion';

describe('addTextureAtlasRegion', () => {
  it('pushes a new region onto the atlas with the given coordinates', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 10, 20, 30, 40);
    expect(atlas.regions).toHaveLength(1);
    expect(atlas.regions[0].x).toBe(10);
    expect(atlas.regions[0].y).toBe(20);
    expect(atlas.regions[0].width).toBe(30);
    expect(atlas.regions[0].height).toBe(40);
  });

  it('assigns id equal to the region index before insertion', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10);
    addTextureAtlasRegion(atlas, 0, 0, 10, 10);
    expect(atlas.regions[0].id).toBe(0);
    expect(atlas.regions[1].id).toBe(1);
  });

  it('sets optional pivot values', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10, 5, 5);
    expect(atlas.regions[0].pivotX).toBe(5);
    expect(atlas.regions[0].pivotY).toBe(5);
  });

  it('sets optional name', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10, undefined, undefined, 'hero');
    expect(atlas.regions[0].name).toBe('hero');
  });

  it('defaults name to null when not provided', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10);
    expect(atlas.regions[0].name).toBeNull();
  });
});

describe('addTextureAtlasRegionRectangle', () => {
  it('accepts rectangle-like and vector-like objects', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegionRectangle(atlas, { x: 10, y: 20, width: 30, height: 40 }, { x: 5, y: 6 });
    expect(atlas.regions[0].x).toBe(10);
    expect(atlas.regions[0].y).toBe(20);
    expect(atlas.regions[0].width).toBe(30);
    expect(atlas.regions[0].height).toBe(40);
    expect(atlas.regions[0].pivotX).toBe(5);
    expect(atlas.regions[0].pivotY).toBe(6);
  });

  it('adds a region from a Rectangle', () => {
    const atlas = createTextureAtlas();
    const rect = createRectangle(10, 20, 30, 40);
    addTextureAtlasRegionRectangle(atlas, rect);
    expect(atlas.regions[0].x).toBe(10);
    expect(atlas.regions[0].width).toBe(30);
  });

  it('sets optional name', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegionRectangle(atlas, createRectangle(0, 0, 10, 10), undefined, 'frame_00');
    expect(atlas.regions[0].name).toBe('frame_00');
  });

  it('sets pivot from optional Vector2', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegionRectangle(atlas, createRectangle(0, 0, 10, 10), createVector2(3, 4));
    expect(atlas.regions[0].pivotX).toBe(3);
    expect(atlas.regions[0].pivotY).toBe(4);
  });
});

describe('addTextureAtlasRegionRectangleXY', () => {
  it('computes width and height from corner coordinates', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegionRectangleXY(atlas, 5, 10, 25, 30);
    expect(atlas.regions[0].x).toBe(5);
    expect(atlas.regions[0].y).toBe(10);
    expect(atlas.regions[0].width).toBe(20);
    expect(atlas.regions[0].height).toBe(20);
  });

  it('sets optional name', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegionRectangleXY(atlas, 0, 0, 10, 10, undefined, undefined, 'tile_0');
    expect(atlas.regions[0].name).toBe('tile_0');
  });
});

describe('addTextureAtlasRegionVector2', () => {
  it('accepts vector-like corner and pivot objects', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegionVector2(atlas, { x: 5, y: 10 }, { x: 25, y: 30 }, { x: 3, y: 4 });
    expect(atlas.regions[0].x).toBe(5);
    expect(atlas.regions[0].y).toBe(10);
    expect(atlas.regions[0].width).toBe(20);
    expect(atlas.regions[0].height).toBe(20);
    expect(atlas.regions[0].pivotX).toBe(3);
    expect(atlas.regions[0].pivotY).toBe(4);
  });

  it('computes region from two Vector2 corner points', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegionVector2(atlas, createVector2(5, 10), createVector2(25, 30));
    expect(atlas.regions[0].x).toBe(5);
    expect(atlas.regions[0].y).toBe(10);
    expect(atlas.regions[0].width).toBe(20);
    expect(atlas.regions[0].height).toBe(20);
  });

  it('sets optional name', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegionVector2(atlas, { x: 0, y: 0 }, { x: 10, y: 10 }, undefined, 'walk_01');
    expect(atlas.regions[0].name).toBe('walk_01');
  });
});

describe('createTextureAtlasRegion', () => {
  let region: TextureAtlasRegion;

  beforeEach(() => {
    region = createTextureAtlasRegion();
  });

  it('allows pre-defined values', () => {
    const base = {
      x: 1,
      y: 2,
      width: 3,
      height: 4,
      id: 5,
      name: 'hero',
      pivotX: 6,
      pivotY: 7,
    };
    const obj = createTextureAtlasRegion(base);
    expect(obj.x).toStrictEqual(base.x);
    expect(obj.y).toStrictEqual(base.y);
    expect(obj.width).toStrictEqual(base.width);
    expect(obj.height).toStrictEqual(base.height);
    expect(obj.id).toStrictEqual(base.id);
    expect(obj.name).toStrictEqual(base.name);
    expect(obj.pivotX).toStrictEqual(base.pivotX);
    expect(obj.pivotY).toStrictEqual(base.pivotY);
  });

  it('initializes default values', () => {
    expect(region.x).toStrictEqual(0);
    expect(region.y).toStrictEqual(0);
    expect(region.id).toStrictEqual(-1);
    expect(region.name).toBeNull();
    expect(region.originalHeight).toBeNull();
    expect(region.originalWidth).toBeNull();
    expect(region.pivotX).toBeNull();
    expect(region.pivotY).toBeNull();
    expect(region.rotated).toBe(false);
    expect(region.sourceX).toStrictEqual(0);
    expect(region.sourceY).toStrictEqual(0);
    expect(region.trimmed).toBe(false);
    expect(region.width).toStrictEqual(0);
    expect(region.height).toStrictEqual(0);
  });

  it('initializes trim and rotation fields', () => {
    const trimmed = createTextureAtlasRegion({
      trimmed: true,
      rotated: true,
      sourceX: 4,
      sourceY: 8,
      originalWidth: 64,
      originalHeight: 32,
    });
    expect(trimmed.trimmed).toBe(true);
    expect(trimmed.rotated).toBe(true);
    expect(trimmed.sourceX).toBe(4);
    expect(trimmed.sourceY).toBe(8);
    expect(trimmed.originalWidth).toBe(64);
    expect(trimmed.originalHeight).toBe(32);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createTextureAtlasRegion(base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('getTextureAtlasRegionById', () => {
  it('returns null for an empty atlas', () => {
    const atlas = createTextureAtlas();
    expect(getTextureAtlasRegionById(atlas, 0)).toBeNull();
  });

  it('returns null when no region matches the id', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10);
    expect(getTextureAtlasRegionById(atlas, 99)).toBeNull();
  });

  it('returns the region with the matching id', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10);
    addTextureAtlasRegion(atlas, 10, 0, 10, 10);
    const region = getTextureAtlasRegionById(atlas, 1);
    expect(region).not.toBeNull();
    expect(region?.x).toBe(10);
    expect(region?.id).toBe(1);
  });
});

describe('getTextureAtlasRegionByName', () => {
  it('returns null for an empty atlas', () => {
    const atlas = createTextureAtlas();
    expect(getTextureAtlasRegionByName(atlas, 'hero')).toBeNull();
  });

  it('returns null when no region matches the name', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10, undefined, undefined, 'hero');
    expect(getTextureAtlasRegionByName(atlas, 'villain')).toBeNull();
  });

  it('returns null for regions with null name', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10);
    expect(getTextureAtlasRegionByName(atlas, '')).toBeNull();
  });

  it('returns the region with the matching name', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10, undefined, undefined, 'hero_idle_0');
    addTextureAtlasRegion(atlas, 10, 0, 10, 10, undefined, undefined, 'hero_walk_0');
    const region = getTextureAtlasRegionByName(atlas, 'hero_walk_0');
    expect(region).not.toBeNull();
    expect(region?.x).toBe(10);
    expect(region?.name).toBe('hero_walk_0');
  });

  it('is case-sensitive', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10, undefined, undefined, 'Hero');
    expect(getTextureAtlasRegionByName(atlas, 'hero')).toBeNull();
    expect(getTextureAtlasRegionByName(atlas, 'Hero')).not.toBeNull();
  });
});

describe('getTextureAtlasRegionSequence', () => {
  it('returns an empty array when the atlas has no regions', () => {
    const atlas = createTextureAtlas();
    expect(getTextureAtlasRegionSequence(atlas, 'walk')).toEqual([]);
  });

  it('returns regions whose names start with the given prefix', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10, undefined, undefined, 'walk_01');
    addTextureAtlasRegion(atlas, 10, 0, 10, 10, undefined, undefined, 'walk_02');
    addTextureAtlasRegion(atlas, 20, 0, 10, 10, undefined, undefined, 'idle_01');
    const seq = getTextureAtlasRegionSequence(atlas, 'walk');
    expect(seq).toHaveLength(2);
    expect(seq[0].name).toBe('walk_01');
    expect(seq[1].name).toBe('walk_02');
  });

  it('skips regions with null names', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10);
    addTextureAtlasRegion(atlas, 10, 0, 10, 10, undefined, undefined, 'walk_01');
    const seq = getTextureAtlasRegionSequence(atlas, 'walk');
    expect(seq).toHaveLength(1);
    expect(seq[0].name).toBe('walk_01');
  });

  it('returns regions in insertion order', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10, undefined, undefined, 'run_03');
    addTextureAtlasRegion(atlas, 10, 0, 10, 10, undefined, undefined, 'run_01');
    addTextureAtlasRegion(atlas, 20, 0, 10, 10, undefined, undefined, 'run_02');
    const seq = getTextureAtlasRegionSequence(atlas, 'run');
    expect(seq.map((r) => r.name)).toEqual(['run_03', 'run_01', 'run_02']);
  });

  it('returns an empty array when no region names match the prefix', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegion(atlas, 0, 0, 10, 10, undefined, undefined, 'idle_01');
    expect(getTextureAtlasRegionSequence(atlas, 'walk')).toEqual([]);
  });
});

describe('getTextureAtlasRegionUv', () => {
  it('returns zero rect when imageWidth is zero', () => {
    const region = createTextureAtlasRegion({ x: 10, y: 20, width: 30, height: 40 });
    const out = { x: 1, y: 1, width: 1, height: 1 };
    getTextureAtlasRegionUv(region, 0, 100, out);
    expect(out).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('returns zero rect when imageHeight is zero', () => {
    const region = createTextureAtlasRegion({ x: 10, y: 20, width: 30, height: 40 });
    const out = { x: 1, y: 1, width: 1, height: 1 };
    getTextureAtlasRegionUv(region, 100, 0, out);
    expect(out).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('computes normalized UV coordinates', () => {
    const region = createTextureAtlasRegion({ x: 0, y: 0, width: 128, height: 64 });
    const out = { x: 0, y: 0, width: 0, height: 0 };
    getTextureAtlasRegionUv(region, 256, 256, out);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(out.width).toBeCloseTo(0.5);
    expect(out.height).toBeCloseTo(0.25);
  });

  it('computes UVs for a region offset within the atlas', () => {
    const region = createTextureAtlasRegion({ x: 128, y: 64, width: 64, height: 64 });
    const out = { x: 0, y: 0, width: 0, height: 0 };
    getTextureAtlasRegionUv(region, 256, 256, out);
    expect(out.x).toBeCloseTo(0.5);
    expect(out.y).toBeCloseTo(0.25);
    expect(out.width).toBeCloseTo(0.25);
    expect(out.height).toBeCloseTo(0.25);
  });

  it('is alias-safe when out shares no fields with region', () => {
    const region = createTextureAtlasRegion({ x: 64, y: 64, width: 64, height: 64 });
    const out = { x: 0, y: 0, width: 0, height: 0 };
    const result = getTextureAtlasRegionUv(region, 256, 256, out);
    expect(result).toBe(out);
    expect(out.x).toBeCloseTo(0.25);
    expect(out.y).toBeCloseTo(0.25);
    expect(out.width).toBeCloseTo(0.25);
    expect(out.height).toBeCloseTo(0.25);
  });
});

describe('setTextureAtlasRegion', () => {
  it('defaults optional parameters to 0', () => {
    const region = createTextureAtlasRegion();
    setTextureAtlasRegion(region, 5);
    expect(region.x).toBe(5);
    expect(region.y).toBe(0);
    expect(region.width).toBe(0);
    expect(region.height).toBe(0);
  });

  it('is alias-safe when out is also an input reference', () => {
    const region = createTextureAtlasRegion({ x: 10, y: 20, width: 30, height: 40 });
    setTextureAtlasRegion(region, region.x, region.y, region.width, region.height);
    expect(region.x).toBe(10);
    expect(region.y).toBe(20);
    expect(region.width).toBe(30);
    expect(region.height).toBe(40);
  });

  it('reuses the existing region object', () => {
    const region = createTextureAtlasRegion();
    const target = region;
    setTextureAtlasRegion(region, 10, 20, 30, 40, 5, 6);
    expect(region).toBe(target);
    expect(region.x).toBe(10);
    expect(region.y).toBe(20);
    expect(region.width).toBe(30);
    expect(region.height).toBe(40);
    expect(region.pivotX).toBe(5);
    expect(region.pivotY).toBe(6);
  });

  it('sets all fields on an existing region', () => {
    const region = createTextureAtlasRegion();
    const result = setTextureAtlasRegion(region, 10, 20, 30, 40, 5, 6);
    expect(result).toBeUndefined();
    expect(region.x).toBe(10);
    expect(region.y).toBe(20);
    expect(region.width).toBe(30);
    expect(region.height).toBe(40);
    expect(region.pivotX).toBe(5);
    expect(region.pivotY).toBe(6);
  });
});
