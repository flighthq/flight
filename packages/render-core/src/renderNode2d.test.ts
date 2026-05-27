import { createDisplayObject } from '@flighthq/scenegraph-display';
import { createSprite } from '@flighthq/scenegraph-sprite';

import {
  createDisplayObjectRenderNode,
  createRenderNode2D,
  createSpriteRenderNode,
  getDisplayObjectRenderNode,
  getSpriteRenderNode,
} from './renderNode2d';
import { createRenderState } from './renderState';

describe('createDisplayObjectRenderNode', () => {
  it('initializes cacheAsBitmap, isMaskFrameID, maskDepth, scrollRectDepth', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const node = createDisplayObjectRenderNode(state, source);
    expect(node.cacheAsBitmap).toBe(false);
    expect(node.cacheBitmap).toBeNull();
    expect(node.isMaskFrameID).toBe(-1);
    expect(node.maskDepth).toBe(0);
    expect(node.scrollRectDepth).toBe(0);
  });
});

describe('createRenderNode2D', () => {
  it('returns a node with a transform2D matrix', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const node = createRenderNode2D(state, source);
    expect(node.transform2D).toBeDefined();
    expect(node.source).toBe(source);
  });
});

describe('createSpriteRenderNode', () => {
  it('returns a non-null node referencing the source sprite', () => {
    const state = createRenderState();
    const sprite = createSprite();
    const node = createSpriteRenderNode(state, sprite);
    expect(node).not.toBeNull();
    expect(node.source).toBe(sprite);
  });
});

describe('getDisplayObjectRenderNode', () => {
  it('creates and caches the render node on the state', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const first = getDisplayObjectRenderNode(state, source);
    const second = getDisplayObjectRenderNode(state, source);
    expect(first).toBe(second);
    expect(state.renderNodeMap.has(source)).toBe(true);
  });
});

describe('getSpriteRenderNode', () => {
  it('creates and caches the sprite render node', () => {
    const state = createRenderState();
    const sprite = createSprite();
    const first = getSpriteRenderNode(state, sprite);
    const second = getSpriteRenderNode(state, sprite);
    expect(first).toBe(second);
    expect(first.source).toBe(sprite);
  });
});
