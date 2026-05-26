import type { GraphNode, Rectangle, Sprite, TextureAtlas } from '@flighthq/types';
import { SpriteKind } from '@flighthq/types';
import { createRectangle } from '@flighthq/geometry';

import {
  computeSpriteLocalBoundsRect,
  createSprite,
  createSpriteData,
  createSpriteRuntime,
  getSpriteRuntime,
} from './sprite';

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

describe('computeSpriteLocalBoundsRect', () => {
  it('is a no-op that does not modify out', () => {
    const sprite = createSprite();
    const out = createRectangle(1, 2, 3, 4);
    computeSpriteLocalBoundsRect(out, sprite as unknown as GraphNode);
    expect(out.x).toBe(1);
    expect(out.y).toBe(2);
    expect(out.width).toBe(3);
    expect(out.height).toBe(4);
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

  it('uses computeSpriteLocalBoundsRect', () => {
    const runtime = createSpriteRuntime();
    expect(runtime.computeLocalBoundsRect).toStrictEqual(computeSpriteLocalBoundsRect);
  });
});

describe('getSpriteRuntime', () => {
  it('returns the runtime for a Sprite', () => {
    const sprite = createSprite();
    const runtime = getSpriteRuntime(sprite);
    expect(runtime).not.toBeNull();
  });
});
