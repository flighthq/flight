import { rectangle } from '@flighthq/geometry';
import { addChild, getLocalBoundsRect } from '@flighthq/scenegraph-core';
import { createQuadBatch, createSprite, createTilemap } from '@flighthq/scenegraph-sprite';

import { defaultQuadBatchHitTestPoint, defaultSpriteHitTestPoint, defaultTilemapHitTestPoint } from './spriteHitTests';

function makeSprite(boundsW = 100, boundsH = 100) {
  const parent = createSprite();
  const sprite = createSprite();
  addChild(parent, sprite);
  rectangle.setTo(getLocalBoundsRect(sprite), 0, 0, boundsW, boundsH);
  return sprite;
}

describe('defaultQuadBatchHitTestPoint', () => {
  it('returns true inside bounds', () => {
    const parent = createSprite();
    const qb = createQuadBatch();
    addChild(parent, qb);
    rectangle.setTo(getLocalBoundsRect(qb), 0, 0, 100, 100);
    expect(defaultQuadBatchHitTestPoint(qb, 50, 50, false)).toBe(true);
  });

  it('returns false outside bounds', () => {
    const parent = createSprite();
    const qb = createQuadBatch();
    addChild(parent, qb);
    rectangle.setTo(getLocalBoundsRect(qb), 0, 0, 100, 100);
    expect(defaultQuadBatchHitTestPoint(qb, 200, 200, false)).toBe(false);
  });
});

describe('defaultSpriteHitTestPoint', () => {
  it('returns true when point is inside local bounds', () => {
    const sprite = makeSprite();
    expect(defaultSpriteHitTestPoint(sprite, 50, 50, false)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const sprite = makeSprite();
    expect(defaultSpriteHitTestPoint(sprite, 200, 200, false)).toBe(false);
  });

  it('returns false for a zero-size sprite', () => {
    const sprite = makeSprite(0, 0);
    expect(defaultSpriteHitTestPoint(sprite, 0, 0, false)).toBe(false);
  });

  it('ignores shapeFlag', () => {
    const sprite = makeSprite();
    expect(defaultSpriteHitTestPoint(sprite, 10, 10, true)).toBe(true);
    expect(defaultSpriteHitTestPoint(sprite, 200, 200, true)).toBe(false);
  });
});

describe('defaultTilemapHitTestPoint', () => {
  it('returns true inside bounds', () => {
    const parent = createSprite();
    const tilemap = createTilemap();
    addChild(parent, tilemap);
    rectangle.setTo(getLocalBoundsRect(tilemap), 0, 0, 100, 100);
    expect(defaultTilemapHitTestPoint(tilemap, 10, 10, false)).toBe(true);
  });

  it('returns false outside bounds', () => {
    const parent = createSprite();
    const tilemap = createTilemap();
    addChild(parent, tilemap);
    rectangle.setTo(getLocalBoundsRect(tilemap), 0, 0, 100, 100);
    expect(defaultTilemapHitTestPoint(tilemap, 999, 999, false)).toBe(false);
  });
});
