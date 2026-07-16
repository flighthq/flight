import { setRectangle } from '@flighthq/geometry';
import { addNodeChild, getNodeLocalBoundsRectangle } from '@flighthq/node';
import { createQuadBatch, createSprite, createTilemap } from '@flighthq/sprite';

import {
  defaultQuadBatchHitTestHandler,
  defaultSpriteHitTestHandler,
  defaultTilemapHitTestHandler,
} from './spriteHitTests';

function makeSprite(boundsW = 100, boundsH = 100) {
  const parent = createSprite();
  const sprite = createSprite();
  addNodeChild(parent, sprite);
  setRectangle(getNodeLocalBoundsRectangle(sprite), 0, 0, boundsW, boundsH);
  return sprite;
}

describe('defaultQuadBatchHitTestHandler', () => {
  it('returns true inside bounds', () => {
    const parent = createSprite();
    const qb = createQuadBatch();
    addNodeChild(parent, qb);
    setRectangle(getNodeLocalBoundsRectangle(qb), 0, 0, 100, 100);
    expect(defaultQuadBatchHitTestHandler(qb, 50, 50)).toBe(true);
  });

  it('returns false outside bounds', () => {
    const parent = createSprite();
    const qb = createQuadBatch();
    addNodeChild(parent, qb);
    setRectangle(getNodeLocalBoundsRectangle(qb), 0, 0, 100, 100);
    expect(defaultQuadBatchHitTestHandler(qb, 200, 200)).toBe(false);
  });
});

describe('defaultSpriteHitTestHandler', () => {
  it('returns true when point is inside local bounds', () => {
    const sprite = makeSprite();
    expect(defaultSpriteHitTestHandler(sprite, 50, 50)).toBe(true);
  });

  it('returns false when point is outside local bounds', () => {
    const sprite = makeSprite();
    expect(defaultSpriteHitTestHandler(sprite, 200, 200)).toBe(false);
  });

  it('returns false for a zero-size sprite', () => {
    const sprite = makeSprite(0, 0);
    expect(defaultSpriteHitTestHandler(sprite, 0, 0)).toBe(false);
  });

  it('ignores shapeFlag', () => {
    const sprite = makeSprite();
    expect(defaultSpriteHitTestHandler(sprite, 10, 10)).toBe(true);
    expect(defaultSpriteHitTestHandler(sprite, 200, 200)).toBe(false);
  });
});

describe('defaultTilemapHitTestHandler', () => {
  it('returns true inside bounds', () => {
    const parent = createSprite();
    const tilemap = createTilemap();
    addNodeChild(parent, tilemap);
    setRectangle(getNodeLocalBoundsRectangle(tilemap), 0, 0, 100, 100);
    expect(defaultTilemapHitTestHandler(tilemap, 10, 10)).toBe(true);
  });

  it('returns false outside bounds', () => {
    const parent = createSprite();
    const tilemap = createTilemap();
    addNodeChild(parent, tilemap);
    setRectangle(getNodeLocalBoundsRectangle(tilemap), 0, 0, 100, 100);
    expect(defaultTilemapHitTestHandler(tilemap, 999, 999)).toBe(false);
  });
});
