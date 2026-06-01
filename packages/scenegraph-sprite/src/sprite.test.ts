import { createRectangle } from '@flighthq/geometry';
import type { GraphNode, Rectangle, Sprite, TextureAtlas, TextureAtlasRegion } from '@flighthq/types';
import { SpriteKind } from '@flighthq/types';

import {
  computeSpriteLocalBoundsRectangle,
  createSprite,
  createSpriteData,
  createSpriteRuntime,
  getSpriteRuntime,
} from './sprite';

describe('computeSpriteLocalBoundsRectangle', () => {
  it('does not modify out when no atlas or rect is set', () => {
    const sprite = createSprite();
    const out = createRectangle(0, 0, 0, 0);
    computeSpriteLocalBoundsRectangle(out, sprite as unknown as GraphNode);
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
  });

  it('uses rect dimensions when rect is set', () => {
    const sprite = createSprite({ data: { rect: createRectangle(0, 0, 64, 48) } });
    const out = createRectangle();
    computeSpriteLocalBoundsRectangle(out, sprite as unknown as GraphNode);
    expect(out.width).toBe(64);
    expect(out.height).toBe(48);
  });

  it('prefers rect over atlas when both are set', () => {
    const region: TextureAtlasRegion = {
      id: 1,
      x: 0,
      y: 0,
      width: 32,
      height: 32,
      pivotX: null,
      pivotY: null,
    } as TextureAtlasRegion;
    const atlas: TextureAtlas = { image: null, regions: [region] } as TextureAtlas;
    const sprite = createSprite({ data: { atlas, id: 1, rect: createRectangle(0, 0, 64, 48) } });
    const out = createRectangle();
    computeSpriteLocalBoundsRectangle(out, sprite as unknown as GraphNode);
    expect(out.width).toBe(64);
    expect(out.height).toBe(48);
  });

  it('uses atlas region dimensions when atlas is set', () => {
    const region: TextureAtlasRegion = {
      id: 3,
      x: 10,
      y: 20,
      width: 128,
      height: 96,
      pivotX: null,
      pivotY: null,
    } as TextureAtlasRegion;
    const atlas: TextureAtlas = { image: null, regions: [region] } as TextureAtlas;
    const sprite = createSprite({ data: { atlas, id: 3 } });
    const out = createRectangle();
    computeSpriteLocalBoundsRectangle(out, sprite as unknown as GraphNode);
    expect(out.width).toBe(128);
    expect(out.height).toBe(96);
  });

  it('does not modify out when atlas region id is not found', () => {
    const region: TextureAtlasRegion = {
      id: 5,
      x: 0,
      y: 0,
      width: 32,
      height: 32,
      pivotX: null,
      pivotY: null,
    } as TextureAtlasRegion;
    const atlas: TextureAtlas = { image: null, regions: [region] } as TextureAtlas;
    const sprite = createSprite({ data: { atlas, id: 99 } });
    const out = createRectangle(0, 0, 0, 0);
    computeSpriteLocalBoundsRectangle(out, sprite as unknown as GraphNode);
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
  });
});

describe('createSprite', () => {
  let sprite: Sprite;

  beforeEach(() => {
    sprite = createSprite();
  });

  it('initializes default values', () => {
    expect(sprite.data.atlas).toBeNull();
    expect(sprite.data.id).toBe(0);
    expect(sprite.data.rect).toBeNull();
    expect(sprite.kind).toBe(SpriteKind);
  });

  it('allows pre-defined values', () => {
    const base = {
      data: {
        atlas: {} as TextureAtlas,
        id: 1,
        rect: {} as Rectangle,
      },
    };
    const obj = createSprite(base);
    expect(obj.data.atlas).toStrictEqual(base.data.atlas);
    expect(obj.data.id).toStrictEqual(base.data.id);
    expect(obj.data.rect).toStrictEqual(base.data.rect);
  });

  it('returns a new object for better hidden-class performance', () => {
    const base = {};
    const obj = createSprite(base);
    expect(obj).not.toStrictEqual(base);
  });
});

describe('createSpriteData', () => {
  it('returns default values', () => {
    const data = createSpriteData();
    expect(data.atlas).toBeNull();
    expect(data.id).toBe(0);
    expect(data.rect).toBeNull();
  });

  it('allows pre-defined values', () => {
    const atlas = {} as TextureAtlas;
    const data = createSpriteData({ atlas, id: 5 });
    expect(data.atlas).toBe(atlas);
    expect(data.id).toBe(5);
  });
});

describe('createSpriteRuntime', () => {
  it('returns a non-null runtime', () => {
    const runtime = createSpriteRuntime();
    expect(runtime).not.toBeNull();
  });

  it('uses computeSpriteLocalBoundsRectangle', () => {
    const runtime = createSpriteRuntime();
    expect(runtime.computeLocalBoundsRect).toStrictEqual(computeSpriteLocalBoundsRectangle);
  });
});

describe('getSpriteRuntime', () => {
  it('returns the runtime for a Sprite', () => {
    const sprite = createSprite();
    const runtime = getSpriteRuntime(sprite);
    expect(runtime).not.toBeNull();
  });
});
