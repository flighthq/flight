import { createDisplayObject } from '@flighthq/scene-display';
import { createSprite } from '@flighthq/scene-sprite';

import { registerRenderer } from './renderer';
import {
  createDisplayObjectRenderNode,
  createRenderNode,
  createRenderNode2D,
  createSpriteRenderNode,
  getOrCreateDisplayObjectRenderNode,
  getOrCreateRenderNode,
  getOrCreateSpriteRenderNode,
  isRenderNodeVisible,
  syncRenderNodeRenderer,
} from './renderNode';
import { createRenderState } from './renderState';

const DisplayObjectKind = Symbol('DisplayObject');

function makeSource() {
  return { kind: DisplayObjectKind } as any;
}

function makeRenderer() {
  return { createData: () => ({ tag: 'data' }), draw: vi.fn() };
}

describe('createDisplayObjectRenderNode', () => {
  it('includes a transform2D matrix', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const node = createDisplayObjectRenderNode(state, obj);
    expect(node.transform2D).toBeDefined();
  });

  it('initializes display-object-specific fields', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const node = createDisplayObjectRenderNode(state, obj);
    expect(node.isMaskFrameID).toBe(-1);
    expect(node.maskDepth).toBe(0);
    expect(node.scrollRectangleDepth).toBe(0);
    expect(node.updateChildren).toBe(true);
  });
});

describe('createRenderNode', () => {
  it('initializes default values', () => {
    const state = createRenderState();
    const source = makeSource();
    const node = createRenderNode(state, source);
    expect(node.source).toBe(source);
    expect(node.kind).toBe(source.kind);
    expect(node.resolver).toBeNull();
    expect(node.next).toBeNull();
    expect(node.alpha).toBe(1);
    expect(node.appearanceFrameID).toBe(-1);
    expect(node.lastAppearanceID).toBe(-1);
    expect(node.lastLocalTransformID).toBe(-1);
    expect(node.transformFrameID).toBe(-1);
    expect(node.renderer).toBeNull();
    expect(node.rendererData).toBeNull();
    expect(node.rendererDataSource).toBe(source);
    expect(node.visible).toBe(true);
    expect(node.shader).toBeNull();
  });

  it('picks up a registered renderer', () => {
    const state = createRenderState();
    const source = makeSource();
    const renderer = makeRenderer();
    registerRenderer(state, source.kind, renderer as any);
    const node = createRenderNode(state, source);
    expect(node.renderer).toBe(renderer);
    expect(node.rendererData).toEqual({ tag: 'data' });
  });

  it('uses null renderer when kind has no registration', () => {
    const state = createRenderState();
    const source = makeSource();
    const node = createRenderNode(state, source);
    expect(node.renderer).toBeNull();
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
  it('includes a transform2D matrix', () => {
    const state = createRenderState();
    const sprite = createSprite();
    const node = createSpriteRenderNode(state, sprite);
    expect(node.transform2D).toBeDefined();
  });

  it('initializes updateChildren to true', () => {
    const state = createRenderState();
    const sprite = createSprite();
    const node = createSpriteRenderNode(state, sprite);
    expect(node.updateChildren).toBe(true);
  });
});

describe('getOrCreateDisplayObjectRenderNode', () => {
  it('creates a node on first call', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const node = getOrCreateDisplayObjectRenderNode(state, obj);
    expect(node.source).toBe(obj);
  });

  it('returns the same node on subsequent calls', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const a = getOrCreateDisplayObjectRenderNode(state, obj);
    const b = getOrCreateDisplayObjectRenderNode(state, obj);
    expect(a).toBe(b);
  });
});

describe('getOrCreateRenderNode', () => {
  it('creates a new node on first call', () => {
    const state = createRenderState();
    const source = makeSource();
    const node = getOrCreateRenderNode(state, source, createRenderNode);
    expect(node).toBeDefined();
    expect(node.source).toBe(source);
  });

  it('returns the same node on subsequent calls', () => {
    const state = createRenderState();
    const source = makeSource();
    const node1 = getOrCreateRenderNode(state, source, createRenderNode);
    const node2 = getOrCreateRenderNode(state, source, createRenderNode);
    expect(node1).toBe(node2);
  });

  it('syncs renderer when rendererMapID has changed', () => {
    const state = createRenderState();
    const source = makeSource();
    const node = getOrCreateRenderNode(state, source, createRenderNode);
    expect(node.renderer).toBeNull();

    const renderer = makeRenderer();
    registerRenderer(state, source.kind, renderer as any);
    getOrCreateRenderNode(state, source, createRenderNode);

    expect(node.renderer).toBe(renderer);
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

describe('isRenderNodeVisible', () => {
  it('returns false when alpha is zero', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const node = createDisplayObjectRenderNode(state, obj);
    node.alpha = 0;

    expect(isRenderNodeVisible(node)).toBe(false);
  });

  it('returns false when the node is hidden', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const node = createDisplayObjectRenderNode(state, obj);
    node.visible = false;

    expect(isRenderNodeVisible(node)).toBe(false);
  });

  it('returns false when the transform collapses both axes', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const node = createDisplayObjectRenderNode(state, obj);
    node.transform2D.a = 0;
    node.transform2D.d = 0;

    expect(isRenderNodeVisible(node)).toBe(false);
  });

  it('returns true for a visible node with positive alpha and non-collapsed transform', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const node = createDisplayObjectRenderNode(state, obj);

    expect(isRenderNodeVisible(node)).toBe(true);
  });
});

describe('syncRenderNodeRenderer', () => {
  it('sets renderer from the map matching the node kind', () => {
    const state = createRenderState();
    const source = makeSource();
    const renderer = makeRenderer();
    registerRenderer(state, source.kind, renderer as any);
    const node = createRenderNode(state, source);
    node.renderer = null;
    syncRenderNodeRenderer(state, node);
    expect(node.renderer).toBe(renderer);
  });

  it('sets renderer to null when no registration matches', () => {
    const state = createRenderState();
    const source = makeSource();
    const node = createRenderNode(state, source);
    node.renderer = { createData: vi.fn(), draw: vi.fn() } as any;
    syncRenderNodeRenderer(state, node);
    expect(node.renderer).toBeNull();
  });

  it('updates rendererMapID to current state value', () => {
    const state = createRenderState();
    const source = makeSource();
    const node = createRenderNode(state, source);
    node.rendererMapID = -1;
    syncRenderNodeRenderer(state, node);
    expect(node.rendererMapID).toBe(state.rendererMapID);
  });

  it('updates rendererData when source changes', () => {
    const state = createRenderState();
    const source = makeSource();
    const renderer = makeRenderer();
    registerRenderer(state, source.kind, renderer as any);
    const node = createRenderNode(state, source);
    const newSource = makeSource();
    node.source = newSource;
    syncRenderNodeRenderer(state, node);
    expect(node.rendererDataSource).toBe(newSource);
  });
});
