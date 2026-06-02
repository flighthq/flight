import { createRenderState } from '@flighthq/render';
import { createDisplayObject } from '@flighthq/scene-display';
import { createSprite } from '@flighthq/scene-sprite';

import {
  createDisplayObjectRenderNode,
  createRenderNode2D,
  createSpriteRenderNode,
  getOrCreateDefaultDisplayObjectRenderNode,
  getOrCreateDisplayObjectRenderNode,
  getOrCreateSpriteRenderNode,
} from './renderTreeNode2d';

describe('createDisplayObjectRenderNode', () => {
  it('initializes isMaskFrameID, maskDepth, scrollRectDepth', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const node = createDisplayObjectRenderNode(state, source);
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
    expect(node.presentationTransform2D).toBeNull();
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

describe('getOrCreateDefaultDisplayObjectRenderNode', () => {
  it('returns the source-keyed default display object render node', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const first = getOrCreateDefaultDisplayObjectRenderNode(state, source);
    const second = getOrCreateDefaultDisplayObjectRenderNode(state, source);
    expect(first).toBe(second);
    expect(state.renderNodeMap.get(source)).toBe(first);
  });
});

describe('getOrCreateDisplayObjectRenderNode', () => {
  it('creates and caches the render node on the state', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const first = getOrCreateDisplayObjectRenderNode(state, source);
    const second = getOrCreateDisplayObjectRenderNode(state, source);
    expect(first).toBe(second);
    expect(state.renderNodeMap.has(source)).toBe(true);
  });
});

describe('getOrCreateSpriteRenderNode', () => {
  it('creates and caches the sprite render node', () => {
    const state = createRenderState();
    const sprite = createSprite();
    const first = getOrCreateSpriteRenderNode(state, sprite);
    const second = getOrCreateSpriteRenderNode(state, sprite);
    expect(first).toBe(second);
    expect(first.source).toBe(sprite);
  });
});
