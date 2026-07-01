import { setRectangle } from '@flighthq/geometry';
import { addNodeChild, getNodeLocalBoundsRectangle } from '@flighthq/node';
import { createQuadBatch, createSprite, createTilemap } from '@flighthq/sprite';

import {
  defaultQuadBatchHitTestPointHandler,
  defaultSpriteHitTestPointHandler,
  defaultTilemapHitTestPointHandler,
} from './spriteHitTests';

function makeSprite(boundsW = 100, boundsH = 100) {
  const parent = createSprite();
  const sprite = createSprite();
  addNodeChild(parent, sprite);
  setRectangle(getNodeLocalBoundsRectangle(sprite), 0, 0, boundsW, boundsH);
  return sprite;
}

describe('defaultQuadBatchHitTestPointHandler', () => {
  it('returns true inside bounds', () => {
    const parent = createSprite();
    const qb = createQuadBatch();
    addNodeChild(parent, qb);
    setRectangle(getNodeLocalBoundsRectangle(qb), 0, 0, 100, 100);
    expect(defaultQuadBatchHitTestPointHandler(qb, 50, 50, false)).toBe(true);
  });

  it('returns false outside bounds', () => {
    const parent = createSprite();
    const qb = createQuadBatch();
    addNodeChild(parent, qb);
    setRectangle(getNodeLocalBoundsRectangle(qb), 0, 0, 100, 100);
    expect(defaultQuadBatchHitTestPointHandler(qb, 200, 200, false)).toBe(false);
  });
});

describe('defaultSpriteHitTestPointHandler', () => {
  it('returns true when point is inside local bounds', () => {
    const sprite = makeSprite();
    expect(defaultSpriteHitTestPointHandler(sprite, 50, 50, false)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const sprite = makeSprite();
    expect(defaultSpriteHitTestPointHandler(sprite, 200, 200, false)).toBe(false);
  });

  it('returns false for a zero-size sprite', () => {
    const sprite = makeSprite(0, 0);
    expect(defaultSpriteHitTestPointHandler(sprite, 0, 0, false)).toBe(false);
  });

  it('ignores shapeFlag', () => {
    const sprite = makeSprite();
    expect(defaultSpriteHitTestPointHandler(sprite, 10, 10, true)).toBe(true);
    expect(defaultSpriteHitTestPointHandler(sprite, 200, 200, true)).toBe(false);
  });
});

describe('defaultTilemapHitTestPointHandler', () => {
  it('returns true inside bounds', () => {
    const parent = createSprite();
    const tilemap = createTilemap();
    addNodeChild(parent, tilemap);
    setRectangle(getNodeLocalBoundsRectangle(tilemap), 0, 0, 100, 100);
    expect(defaultTilemapHitTestPointHandler(tilemap, 10, 10, false)).toBe(true);
  });

  it('returns false outside bounds', () => {
    const parent = createSprite();
    const tilemap = createTilemap();
    addNodeChild(parent, tilemap);
    setRectangle(getNodeLocalBoundsRectangle(tilemap), 0, 0, 100, 100);
    expect(defaultTilemapHitTestPointHandler(tilemap, 999, 999, false)).toBe(false);
  });
});
