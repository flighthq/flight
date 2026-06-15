import { createDisplayObject } from '@flighthq/displayobject';
import { createMatrix } from '@flighthq/geometry';
import {
  addNodeChild,
  getNodeAppearanceRevision,
  getNodeLocalTransformRevision,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
} from '@flighthq/node';
import { createSprite } from '@flighthq/sprite';
import { RenderFeatures } from '@flighthq/types';

import { enableRenderFeatures, registerRenderer } from './renderer';
import {
  beginRenderNodeUpdate,
  createDisplayObjectRenderNode,
  createRenderNode,
  createRenderNode2D,
  createSpriteRenderNode,
  getDisplayObjectRenderNode,
  getOrCreateDisplayObjectRenderNode,
  getOrCreateRenderNode,
  getOrCreateSpriteRenderNode,
  getSpriteRenderNode,
  installRenderAdaptHook,
  isRenderNodeDirty,
  isRenderNodeVisible,
  prepareDisplayObjectRender,
  prepareSpriteRender,
  updateRenderNodeRenderer,
} from './renderNode';
import { createRenderState } from './renderState';

const DisplayObjectKind = Symbol('DisplayObject');

function makeSource() {
  return { kind: DisplayObjectKind } as any;
}

function makeRenderer() {
  return { createData: () => ({ tag: 'data' }), submit: vi.fn() };
}

describe('beginRenderNodeUpdate', () => {
  it('is a no-op and does not throw', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, source);
    expect(() => beginRenderNodeUpdate(source, data)).not.toThrow();
  });
});

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
    expect(node.clipRectangleDepth).toBe(0);
    expect(node.traverseChildren).toBe(true);
  });
});

describe('createRenderNode', () => {
  it('initializes default values', () => {
    const state = createRenderState();
    const source = makeSource();
    const node = createRenderNode(state, source);
    expect(node.source).toBe(source);
    expect(node.kind).toBe(source.kind);
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

  it('initializes traverseChildren to true', () => {
    const state = createRenderState();
    const sprite = createSprite();
    const node = createSpriteRenderNode(state, sprite);
    expect(node.traverseChildren).toBe(true);
  });
});

describe('getDisplayObjectRenderNode', () => {
  it('returns undefined when no node has been created', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    expect(getDisplayObjectRenderNode(state, obj)).toBeUndefined();
  });

  it('returns the node after getOrCreateDisplayObjectRenderNode', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const created = getOrCreateDisplayObjectRenderNode(state, obj);
    expect(getDisplayObjectRenderNode(state, obj)).toBe(created);
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
    expect(node.traverseChildren).toBe(true);
  });

  it('returns the same node on subsequent calls', () => {
    const state = createRenderState();
    const sprite = createSprite();
    const a = getOrCreateSpriteRenderNode(state, sprite);
    const b = getOrCreateSpriteRenderNode(state, sprite);
    expect(a).toBe(b);
  });
});

describe('getSpriteRenderNode', () => {
  it('returns undefined when no node has been created', () => {
    const state = createRenderState();
    const sprite = createSprite();
    expect(getSpriteRenderNode(state, sprite)).toBeUndefined();
  });

  it('returns the node after getOrCreateSpriteRenderNode', () => {
    const state = createRenderState();
    const sprite = createSprite();
    const created = getOrCreateSpriteRenderNode(state, sprite);
    expect(getSpriteRenderNode(state, sprite)).toBe(created);
  });
});

describe('installRenderAdaptHook', () => {
  it('does not throw when installing a hook', () => {
    expect(() => installRenderAdaptHook(vi.fn())).not.toThrow();
  });
});

describe('isRenderNodeDirty', () => {
  it('returns false when source and parent are clean', () => {
    const state = createRenderState({ sceneGraphSyncPolicy: 'requiresInvalidation' });
    const source = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, source);
    data.lastAppearanceID = getNodeAppearanceRevision(source);
    data.lastLocalTransformID = getNodeLocalTransformRevision(source);

    expect(isRenderNodeDirty(state, source, data)).toBe(false);
  });

  it('returns true when appearance changes', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, source);
    data.lastAppearanceID = getNodeAppearanceRevision(source);
    data.lastLocalTransformID = getNodeLocalTransformRevision(source);
    invalidateNodeAppearance(source);

    expect(isRenderNodeDirty(state, source, data)).toBe(true);
  });

  it('returns true when parent was updated this frame', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, source);
    data.lastAppearanceID = getNodeAppearanceRevision(source);
    data.lastLocalTransformID = getNodeLocalTransformRevision(source);
    const parentData = createDisplayObjectRenderNode(state, createDisplayObject());
    parentData.transformFrameID = state.currentFrameID;

    expect(isRenderNodeDirty(state, source, data, parentData)).toBe(true);
  });

  it('returns true when transform changes', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createDisplayObjectRenderNode(state, source);
    data.transform2D = createMatrix();
    data.lastAppearanceID = getNodeAppearanceRevision(source);
    data.lastLocalTransformID = getNodeLocalTransformRevision(source);
    source.x = 10;
    invalidateNodeLocalTransform(source);

    expect(isRenderNodeDirty(state, source, data)).toBe(true);
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

describe('prepareDisplayObjectRender', () => {
  it('creates render nodes for all enabled nodes in the tree', () => {
    const state = createRenderState();
    const root = createDisplayObject();
    const child = createDisplayObject();
    addNodeChild(root, child);

    prepareDisplayObjectRender(state, root);

    expect(state.renderNodeMap.get(root)).toBeDefined();
    expect(state.renderNodeMap.get(child)).toBeDefined();
  });

  it('skips disabled nodes', () => {
    const state = createRenderState();
    const root = createDisplayObject();
    const child = createDisplayObject();
    addNodeChild(root, child);
    child.enabled = false;

    prepareDisplayObjectRender(state, root);

    expect(state.renderNodeMap.get(root)).toBeDefined();
    expect(state.renderNodeMap.get(child)).toBeUndefined();
  });

  it('returns true when tree is dirty', () => {
    const state = createRenderState();
    const root = createDisplayObject();

    expect(prepareDisplayObjectRender(state, root)).toBe(true);
  });

  it('returns false when tree is clean', () => {
    const state = createRenderState({ sceneGraphSyncPolicy: 'requiresInvalidation' });
    const root = createDisplayObject();
    prepareDisplayObjectRender(state, root);

    expect(prepareDisplayObjectRender(state, root)).toBe(false);
  });

  it('marks mask nodes with the current frame id', () => {
    const state = createRenderState();
    enableRenderFeatures(state, RenderFeatures.Masks);
    const root = createDisplayObject();
    const mask = createDisplayObject();
    root.mask = mask;

    prepareDisplayObjectRender(state, root);

    const maskNode = state.renderNodeMap.get(mask) as any;
    expect(maskNode).toBeDefined();
    expect(maskNode.isMaskFrameID).toBe(state.currentFrameID);
  });
});

describe('prepareSpriteRender', () => {
  it('creates render nodes for all enabled nodes in the tree', () => {
    const state = createRenderState();
    const root = createSprite();
    const child = createSprite();
    addNodeChild(root, child);

    prepareSpriteRender(state, root);

    expect(state.renderNodeMap.get(root)).toBeDefined();
    expect(state.renderNodeMap.get(child)).toBeDefined();
  });

  it('skips disabled nodes', () => {
    const state = createRenderState();
    const root = createSprite();
    const child = createSprite();
    addNodeChild(root, child);
    child.enabled = false;

    prepareSpriteRender(state, root);

    expect(state.renderNodeMap.get(root)).toBeDefined();
    expect(state.renderNodeMap.get(child)).toBeUndefined();
  });

  it('returns true when tree is dirty', () => {
    const state = createRenderState();
    const root = createSprite();

    expect(prepareSpriteRender(state, root)).toBe(true);
  });

  it('returns false when tree is clean', () => {
    const state = createRenderState({ sceneGraphSyncPolicy: 'requiresInvalidation' });
    const root = createSprite();
    prepareSpriteRender(state, root);

    expect(prepareSpriteRender(state, root)).toBe(false);
  });
});

describe('updateRenderNodeRenderer', () => {
  it('sets renderer from the map matching the node kind', () => {
    const state = createRenderState();
    const source = makeSource();
    const renderer = makeRenderer();
    registerRenderer(state, source.kind, renderer as any);
    const node = createRenderNode(state, source);
    node.renderer = null;
    updateRenderNodeRenderer(state, node);
    expect(node.renderer).toBe(renderer);
  });

  it('sets renderer to null when no registration matches', () => {
    const state = createRenderState();
    const source = makeSource();
    const node = createRenderNode(state, source);
    node.renderer = { createData: vi.fn(), submit: vi.fn() } as any;
    updateRenderNodeRenderer(state, node);
    expect(node.renderer).toBeNull();
  });

  it('updates rendererMapID to current state value', () => {
    const state = createRenderState();
    const source = makeSource();
    const node = createRenderNode(state, source);
    node.rendererMapID = -1;
    updateRenderNodeRenderer(state, node);
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
    updateRenderNodeRenderer(state, node);
    expect(node.rendererDataSource).toBe(newSource);
  });
});
