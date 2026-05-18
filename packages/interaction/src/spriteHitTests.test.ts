import { rectangle } from '@flighthq/geometry';
import { addChild, getLocalBoundsRect } from '@flighthq/scene-graph-core';
import { createDisplayObject } from '@flighthq/scene-graph-display';
import { createQuadBatch, createSprite } from '@flighthq/scene-graph-sprite';

import { defaultQuadBatchHitTestPoint, defaultSpriteHitTestPoint, defaultTilemapHitTestPoint } from './spriteHitTests';

function makeSprite(boundsW = 100, boundsH = 100) {
  const parent = createDisplayObject();
  const sprite = createSprite();
  addChild(parent, sprite);
  rectangle.setTo(getLocalBoundsRect(sprite), 0, 0, boundsW, boundsH);
  return sprite;
}

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

describe('defaultQuadBatchHitTestPoint', () => {
  it('delegates to defaultSpriteHitTestPoint — returns true inside bounds', () => {
    const parent = createDisplayObject();
    const qb = createQuadBatch();
    addChild(parent, qb);
    rectangle.setTo(getLocalBoundsRect(qb), 0, 0, 100, 100);
    expect(defaultQuadBatchHitTestPoint(qb, 50, 50, false)).toBe(true);
  });

  it('delegates to defaultSpriteHitTestPoint — returns false outside bounds', () => {
    const parent = createDisplayObject();
    const qb = createQuadBatch();
    addChild(parent, qb);
    rectangle.setTo(getLocalBoundsRect(qb), 0, 0, 100, 100);
    expect(defaultQuadBatchHitTestPoint(qb, 200, 200, false)).toBe(false);
  });
});

describe('defaultTilemapHitTestPoint', () => {
  it('delegates to defaultSpriteHitTestPoint — returns true inside bounds', () => {
    const sprite = makeSprite();
    expect(defaultTilemapHitTestPoint(sprite, 10, 10, false)).toBe(true);
  });

  it('delegates to defaultSpriteHitTestPoint — returns false outside bounds', () => {
    const sprite = makeSprite();
    expect(defaultTilemapHitTestPoint(sprite, 999, 999, false)).toBe(false);
  });
});
