import { createRectangle, createVector2 } from '@flighthq/geometry';
import type { TextureAtlasRegion } from '@flighthq/types';

import { createTextureAtlas } from './textureAtlas';
import {
  addTextureAtlasRegion,
  addTextureAtlasRegionRectangle,
  addTextureAtlasRegionRectangleXY,
  addTextureAtlasRegionVector2,
  createTextureAtlasRegion,
  initTextureAtlasRegion,
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
});

describe('addTextureAtlasRegionRectangle', () => {
  it('adds a region from a Rectangle', () => {
    const atlas = createTextureAtlas();
    const rect = createRectangle(10, 20, 30, 40);
    addTextureAtlasRegionRectangle(atlas, rect);
    expect(atlas.regions[0].x).toBe(10);
    expect(atlas.regions[0].width).toBe(30);
  });

  it('sets pivot from optional Vector2', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegionRectangle(atlas, createRectangle(0, 0, 10, 10), createVector2(3, 4));
    expect(atlas.regions[0].pivotX).toBe(3);
    expect(atlas.regions[0].pivotY).toBe(4);
  });

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
});

describe('addTextureAtlasRegionVector2', () => {
  it('computes region from two Vector2 corner points', () => {
    const atlas = createTextureAtlas();
    addTextureAtlasRegionVector2(atlas, createVector2(5, 10), createVector2(25, 30));
    expect(atlas.regions[0].x).toBe(5);
    expect(atlas.regions[0].y).toBe(10);
    expect(atlas.regions[0].width).toBe(20);
    expect(atlas.regions[0].height).toBe(20);
  });

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
});

describe('createTextureAtlasRegion', () => {
  let region: TextureAtlasRegion;

  beforeEach(() => {
    region = createTextureAtlasRegion();
  });

  it('initializes default values', () => {
    expect(region.x).toStrictEqual(0);
    expect(region.y).toStrictEqual(0);
    expect(region.id).toStrictEqual(-1);
    expect(region.pivotX).toStrictEqual(0);
    expect(region.pivotY).toStrictEqual(0);
    expect(region.width).toStrictEqual(0);
    expect(region.height).toStrictEqual(0);
  });

  it('allows pre-defined values', () => {
    const base = {
      x: 1,
      y: 2,
      width: 3,
      height: 4,
      id: 5,
      pivotX: 6,
      pivotY: 7,
    };
    const obj = createTextureAtlasRegion(base);
    expect(obj.x).toStrictEqual(base.x);
    expect(obj.y).toStrictEqual(base.y);
    expect(obj.width).toStrictEqual(base.width);
    expect(obj.height).toStrictEqual(base.height);
    expect(obj.id).toStrictEqual(base.id);
    expect(obj.pivotX).toStrictEqual(base.pivotX);
    expect(obj.pivotY).toStrictEqual(base.pivotY);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createTextureAtlasRegion(base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('initTextureAtlasRegion', () => {
  it('sets all fields on an existing region', () => {
    const region = createTextureAtlasRegion();
    const result = initTextureAtlasRegion(region, 10, 20, 30, 40, 5, 6);
    expect(result).toBeUndefined();
    expect(region.x).toBe(10);
    expect(region.y).toBe(20);
    expect(region.width).toBe(30);
    expect(region.height).toBe(40);
    expect(region.pivotX).toBe(5);
    expect(region.pivotY).toBe(6);
  });

  it('reuses the existing region object', () => {
    const region = createTextureAtlasRegion();
    const target = region;
    initTextureAtlasRegion(region, 10, 20, 30, 40, 5, 6);
    expect(region).toBe(target);
    expect(region.x).toBe(10);
    expect(region.y).toBe(20);
    expect(region.width).toBe(30);
    expect(region.height).toBe(40);
    expect(region.pivotX).toBe(5);
    expect(region.pivotY).toBe(6);
  });

  it('defaults optional parameters to 0', () => {
    const region = createTextureAtlasRegion();
    initTextureAtlasRegion(region, 5);
    expect(region.x).toBe(5);
    expect(region.y).toBe(0);
    expect(region.width).toBe(0);
    expect(region.height).toBe(0);
  });
});
