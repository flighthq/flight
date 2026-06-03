import { createDisplayObject } from '@flighthq/scene-display';
import { createSprite } from '@flighthq/scene-sprite';

import {
  createDisplayObjectRenderNode,
  createRenderNode2D,
  createSpriteRenderNode,
  getOrCreateDefaultDisplayObjectRenderNode,
  getOrCreateDisplayObjectRenderNode,
  getOrCreateSpriteRenderNode,
} from './renderNode2d';
import { createRenderState } from './renderState';

describe('createDisplayObjectRenderNode', () => {
  it('initializes display-object-specific fields', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const node = createDisplayObjectRenderNode(state, obj);
    expect(node.isMaskFrameID).toBe(-1);
    expect(node.maskDepth).toBe(0);
    expect(node.scrollRectangleDepth).toBe(0);
    expect(node.updateChildren).toBe(true);
  });

  it('includes a transform2D matrix', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const node = createDisplayObjectRenderNode(state, obj);
    expect(node.transform2D).toBeDefined();
  });
});

describe('createRenderNode2D', () => {
  it('includes a transform2D matrix', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const node = createRenderNode2D(state, obj);
    expect(node.transform2D).toBeDefined();
    expect(typeof node.transform2D.a).toBe('number');
  });

  it('sets source to the provided object', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const node = createRenderNode2D(state, obj);
    expect(node.source).toBe(obj);
  });
});

describe('createSpriteRenderNode', () => {
  it('initializes updateChildren to true', () => {
    const state = createRenderState();
    const sprite = createSprite();
    const node = createSpriteRenderNode(state, sprite);
    expect(node.updateChildren).toBe(true);
  });

  it('includes a transform2D matrix', () => {
    const state = createRenderState();
    const sprite = createSprite();
    const node = createSpriteRenderNode(state, sprite);
    expect(node.transform2D).toBeDefined();
  });
});

describe('getOrCreateDefaultDisplayObjectRenderNode', () => {
  it('creates a node on first call', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const node = getOrCreateDefaultDisplayObjectRenderNode(state, obj);
    expect(node.source).toBe(obj);
  });

  it('returns the same node on subsequent calls', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const a = getOrCreateDefaultDisplayObjectRenderNode(state, obj);
    const b = getOrCreateDefaultDisplayObjectRenderNode(state, obj);
    expect(a).toBe(b);
  });
});

describe('getOrCreateDisplayObjectRenderNode', () => {
  it('delegates to the default implementation', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const a = getOrCreateDisplayObjectRenderNode(state, obj);
    const b = getOrCreateDefaultDisplayObjectRenderNode(state, obj);
    expect(a).toBe(b);
  });
});

describe('getOrCreateSpriteRenderNode', () => {
  it('creates a sprite render node on first call', () => {
    const state = createRenderState();
    const sprite = createSprite();
    const node = getOrCreateSpriteRenderNode(state, sprite);
    expect(node.source).toBe(sprite);
    expect(node.updateChildren).toBe(true);
  });

  it('returns the same node on subsequent calls', () => {
    const state = createRenderState();
    const sprite = createSprite();
    const a = getOrCreateSpriteRenderNode(state, sprite);
    const b = getOrCreateSpriteRenderNode(state, sprite);
    expect(a).toBe(b);
  });
});
