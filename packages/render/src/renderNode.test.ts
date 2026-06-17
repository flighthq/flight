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
  createRenderNode,
  createRenderNode2D,
  getOrCreateRenderNode2D,
  getRenderNode2D,
  installRenderAdaptHook,
  isRenderNodeDirty,
  isRenderNodeVisible,
  prepareDisplayObjectRender,
  prepareMasks,
  prepareSpriteRender,
  updateNodeClipRectangle,
  updateRenderNode2D,
  updateRenderNodeRenderer,
  walkNode,
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
    const data = createRenderNode2D(state, source);
    expect(() => beginRenderNodeUpdate(source, data)).not.toThrow();
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

  it('initializes the 2D render-node fields the same way for sprites and display objects', () => {
    const state = createRenderState();
    const objNode = createRenderNode2D(state, createDisplayObject());
    const spriteNode = createRenderNode2D(state, createSprite());
    for (const node of [objNode, spriteNode]) {
      expect(node.isMaskFrameID).toBe(-1);
      expect(node.maskDepth).toBe(0);
      expect(node.clipRectangleDepth).toBe(0);
      expect(node.traverseChildren).toBe(true);
    }
  });
});

describe('getOrCreateRenderNode2D', () => {
  it('creates a node on first call', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const node = getOrCreateRenderNode2D(state, obj);
    expect(node.source).toBe(obj);
    expect(node.traverseChildren).toBe(true);
  });

  it('returns the same node on subsequent calls', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const a = getOrCreateRenderNode2D(state, obj);
    const b = getOrCreateRenderNode2D(state, obj);
    expect(a).toBe(b);
  });

  it('syncs renderer when rendererMapID has changed', () => {
    const state = createRenderState();
    const source = createSprite();
    const node = getOrCreateRenderNode2D(state, source);
    expect(node.renderer).toBeNull();

    const renderer = makeRenderer();
    registerRenderer(state, source.kind, renderer as any);
    getOrCreateRenderNode2D(state, source);

    expect(node.renderer).toBe(renderer);
  });
});

describe('getRenderNode2D', () => {
  it('returns undefined when no node has been created', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    expect(getRenderNode2D(state, obj)).toBeUndefined();
  });

  it('returns the node after getOrCreateRenderNode2D', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const created = getOrCreateRenderNode2D(state, obj);
    expect(getRenderNode2D(state, obj)).toBe(created);
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
    const data = createRenderNode2D(state, source);
    data.lastAppearanceID = getNodeAppearanceRevision(source);
    data.lastLocalTransformID = getNodeLocalTransformRevision(source);

    expect(isRenderNodeDirty(state, source, data)).toBe(false);
  });

  it('returns true when appearance changes', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createRenderNode2D(state, source);
    data.lastAppearanceID = getNodeAppearanceRevision(source);
    data.lastLocalTransformID = getNodeLocalTransformRevision(source);
    invalidateNodeAppearance(source);

    expect(isRenderNodeDirty(state, source, data)).toBe(true);
  });

  it('returns true when parent was updated this frame', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createRenderNode2D(state, source);
    data.lastAppearanceID = getNodeAppearanceRevision(source);
    data.lastLocalTransformID = getNodeLocalTransformRevision(source);
    const parentData = createRenderNode2D(state, createDisplayObject());
    parentData.transformFrameID = state.currentFrameID;

    expect(isRenderNodeDirty(state, source, data, parentData)).toBe(true);
  });

  it('returns true when transform changes', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createRenderNode2D(state, source);
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
    const node = createRenderNode2D(state, createDisplayObject());
    node.alpha = 0;

    expect(isRenderNodeVisible(node)).toBe(false);
  });

  it('returns false when the node is hidden', () => {
    const state = createRenderState();
    const node = createRenderNode2D(state, createDisplayObject());
    node.visible = false;

    expect(isRenderNodeVisible(node)).toBe(false);
  });

  it('returns false when the transform collapses both axes', () => {
    const state = createRenderState();
    const node = createRenderNode2D(state, createDisplayObject());
    node.transform2D.a = 0;
    node.transform2D.d = 0;

    expect(isRenderNodeVisible(node)).toBe(false);
  });

  it('returns true for a visible node with positive alpha and non-collapsed transform', () => {
    const state = createRenderState();
    const node = createRenderNode2D(state, createDisplayObject());

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

describe('prepareMasks', () => {
  it('marks mask nodes for the current frame and sets mask depth on the masked node', () => {
    const state = createRenderState();
    const root = createDisplayObject();
    const maskObj = createDisplayObject();
    root.mask = maskObj;
    prepareDisplayObjectRender(state, root);
    const maskData = getOrCreateRenderNode2D(state, maskObj);
    expect(maskData.isMaskFrameID).toBe(state.currentFrameID);
    expect(getOrCreateRenderNode2D(state, root).maskDepth).toBe(1);
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

describe('updateNodeClipRectangle', () => {
  it('adds one to the parent depth when the node has a clip rectangle', () => {
    const state = createRenderState();
    const node = createDisplayObject();
    node.clipRectangle = {} as any;
    const data = getOrCreateRenderNode2D(state, node);
    updateNodeClipRectangle(state, node, data, undefined);
    expect(data.clipRectangleDepth).toBe(1);
  });

  it('inherits the parent depth when the node has no clip rectangle', () => {
    const state = createRenderState();
    const node = createDisplayObject();
    const data = getOrCreateRenderNode2D(state, node);
    const parentData = getOrCreateRenderNode2D(state, createDisplayObject());
    parentData.clipRectangleDepth = 2;
    updateNodeClipRectangle(state, node, data, parentData);
    expect(data.clipRectangleDepth).toBe(2);
  });

  it('contributes no depth for a sprite node that lacks the clip-rectangle trait', () => {
    const state = createRenderState();
    const sprite = createSprite();
    const data = getOrCreateRenderNode2D(state, sprite);
    updateNodeClipRectangle(state, sprite, data, undefined);
    expect(data.clipRectangleDepth).toBe(0);
  });
});

describe('updateRenderNode2D', () => {
  it('updates appearance on a display-object render node', () => {
    const state = createRenderState();
    const root = createDisplayObject();
    const data = getOrCreateRenderNode2D(state, root);
    updateRenderNode2D(state, root, data, undefined);
    expect(data.alpha).toBe(1);
  });

  it('updates appearance on a sprite render node through the same visitor', () => {
    const state = createRenderState();
    const root = createSprite();
    const data = getOrCreateRenderNode2D(state, root);
    updateRenderNode2D(state, root, data, undefined);
    expect(data.alpha).toBe(1);
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

describe('walkNode', () => {
  it('calls the visitor for each enabled node and reports dirty', () => {
    const state = createRenderState();
    const root = createSprite();
    const child = createSprite();
    addNodeChild(root, child);
    const visit = vi.fn();
    const dirty = walkNode(state, root, visit);
    expect(visit).toHaveBeenCalledTimes(2);
    expect(dirty).toBe(true);
  });

  it('skips a node whose render node has traverseChildren false', () => {
    const state = createRenderState();
    const root = createSprite();
    const child = createSprite();
    addNodeChild(root, child);
    getOrCreateRenderNode2D(state, root).traverseChildren = false;
    const visit = vi.fn();
    walkNode(state, root, visit);
    expect(state.renderNodeMap.get(child)).toBeUndefined();
  });
});
