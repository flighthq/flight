import { createDisplayObject, createMaskGroup, setMaskGroupMask } from '@flighthq/displayobject';
import { createMatrix } from '@flighthq/geometry';
import {
  addNodeChild,
  getNodeAppearanceRevision,
  getNodeLocalContentRevision,
  getNodeLocalTransformRevision,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
} from '@flighthq/node';
import { createSprite } from '@flighthq/sprite';

import { registerRenderer } from './renderer';
import {
  beginRenderProxyUpdate,
  createRenderProxy,
  createRenderProxy2D,
  disposeDisplayObjectSubtree,
  disposeRenderProxy,
  enableDisplayObjectMaskPass,
  getDisplayObjectMask,
  getOrCreateRenderProxy2D,
  getRenderProxy2D,
  installRenderAdaptHook,
  isRenderProxyDirty,
  isRenderProxyVisible,
  prepareDisplayObjectRender,
  prepareMasks,
  prepareSpriteRender,
  updateNodeClipRectangle,
  updateRenderProxy2D,
  updateRenderProxyRenderer,
  walkNode,
} from './renderProxy';
import { createRenderState } from './renderState';

const DisplayObjectKind = Symbol('DisplayObject');

function makeSource() {
  return { kind: DisplayObjectKind } as any;
}

function makeRenderer() {
  return { createData: () => ({ tag: 'data' }), submit: vi.fn() };
}

describe('beginRenderProxyUpdate', () => {
  it('is a no-op and does not throw', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createRenderProxy2D(state, source);
    expect(() => beginRenderProxyUpdate(source, data)).not.toThrow();
  });
});

describe('createRenderProxy', () => {
  it('initializes default values', () => {
    const state = createRenderState();
    const source = makeSource();
    const node = createRenderProxy(state, source);
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
    const node = createRenderProxy(state, source);
    expect(node.renderer).toBe(renderer);
    expect(node.rendererData).toEqual({ tag: 'data' });
  });

  it('uses null renderer when kind has no registration', () => {
    const state = createRenderState();
    const source = makeSource();
    const node = createRenderProxy(state, source);
    expect(node.renderer).toBeNull();
  });
});

describe('createRenderProxy2D', () => {
  it('includes a transform2D matrix', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const node = createRenderProxy2D(state, obj);
    expect(node.transform2D).toBeDefined();
    expect(typeof node.transform2D.a).toBe('number');
  });

  it('sets source to the provided object', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const node = createRenderProxy2D(state, obj);
    expect(node.source).toBe(obj);
  });

  it('initializes the 2D render-node fields the same way for sprites and display objects', () => {
    const state = createRenderState();
    const objNode = createRenderProxy2D(state, createDisplayObject());
    const spriteNode = createRenderProxy2D(state, createSprite());
    for (const node of [objNode, spriteNode]) {
      expect(node.isMaskFrameID).toBe(-1);
      expect(node.maskDepth).toBe(0);
      expect(node.clipRectangleDepth).toBe(0);
      expect(node.traverseChildren).toBe(true);
    }
  });
});

describe('disposeDisplayObjectSubtree', () => {
  it('disposes the root and all descendants', () => {
    const state = createRenderState();
    const root = createDisplayObject();
    const child = createDisplayObject();
    const grandchild = createDisplayObject();
    addNodeChild(root, child);
    addNodeChild(child, grandchild);
    prepareDisplayObjectRender(state, root);

    disposeDisplayObjectSubtree(state, root);

    expect(getRenderProxy2D(state, root)).toBeUndefined();
    expect(getRenderProxy2D(state, child)).toBeUndefined();
    expect(getRenderProxy2D(state, grandchild)).toBeUndefined();
  });

  it('disposes the mask proxy on each node', () => {
    const state = createRenderState();
    const root = createMaskGroup();
    const mask = createDisplayObject();
    setMaskGroupMask(root, mask);
    prepareDisplayObjectRender(state, root);
    getOrCreateRenderProxy2D(state, mask);

    disposeDisplayObjectSubtree(state, root);

    expect(getRenderProxy2D(state, root)).toBeUndefined();
    expect(getRenderProxy2D(state, mask)).toBeUndefined();
  });

  it('calls destroyData on renderer data for each disposed node', () => {
    const state = createRenderState();
    const root = createDisplayObject();
    const child = createDisplayObject();
    addNodeChild(root, child);
    const destroyData = vi.fn();
    registerRenderer(state, root.kind, { createData: () => ({ tag: 'data' }), destroyData, submit: vi.fn() } as any);
    getOrCreateRenderProxy2D(state, root);
    getOrCreateRenderProxy2D(state, child);

    disposeDisplayObjectSubtree(state, root);

    expect(destroyData).toHaveBeenCalledTimes(2);
  });

  it('visits disabled nodes that were never prepared', () => {
    const state = createRenderState();
    const root = createDisplayObject();
    const child = createDisplayObject();
    addNodeChild(root, child);
    child.enabled = false;
    prepareDisplayObjectRender(state, root);
    // prepareDisplayObjectRender skips disabled nodes, but disposeDisplayObjectSubtree should not
    getOrCreateRenderProxy2D(state, child);

    disposeDisplayObjectSubtree(state, root);

    expect(getRenderProxy2D(state, child)).toBeUndefined();
  });
});

describe('disposeRenderProxy', () => {
  it('cascades to the renderer destroyData and removes the proxy', () => {
    const state = createRenderState();
    const source = createSprite();
    const destroyData = vi.fn();
    registerRenderer(state, source.kind, { createData: () => ({ tag: 'data' }), destroyData, submit: vi.fn() } as any);
    const node = getOrCreateRenderProxy2D(state, source);
    const data = node.rendererData;

    disposeRenderProxy(state, source);

    expect(destroyData).toHaveBeenCalledWith(state, data);
    expect(getRenderProxy2D(state, source)).toBeUndefined();
  });

  it('is a no-op when no proxy exists', () => {
    const state = createRenderState();
    expect(() => disposeRenderProxy(state, createSprite())).not.toThrow();
  });
});

describe('enableDisplayObjectMaskPass', () => {
  it('installs prepareMasks as the mask pass', () => {
    const state = createRenderState();
    expect(state.displayObjectMaskPass).toBeNull();
    enableDisplayObjectMaskPass(state);
    expect(state.displayObjectMaskPass).toBe(prepareMasks);
  });
});

describe('getDisplayObjectMask', () => {
  it('returns the mask for a MaskGroup and null for other display objects', () => {
    const plain = createDisplayObject();
    expect(getDisplayObjectMask(plain)).toBeNull();

    const group = createMaskGroup();
    const mask = createDisplayObject();
    setMaskGroupMask(group, mask);
    expect(getDisplayObjectMask(group)).toBe(mask);
  });
});

describe('getOrCreateRenderProxy2D', () => {
  it('creates a node on first call', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const node = getOrCreateRenderProxy2D(state, obj);
    expect(node.source).toBe(obj);
    expect(node.traverseChildren).toBe(true);
  });

  it('returns the same node on subsequent calls', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const a = getOrCreateRenderProxy2D(state, obj);
    const b = getOrCreateRenderProxy2D(state, obj);
    expect(a).toBe(b);
  });

  it('syncs renderer when rendererMapID has changed', () => {
    const state = createRenderState();
    const source = createSprite();
    const node = getOrCreateRenderProxy2D(state, source);
    expect(node.renderer).toBeNull();

    const renderer = makeRenderer();
    registerRenderer(state, source.kind, renderer as any);
    getOrCreateRenderProxy2D(state, source);

    expect(node.renderer).toBe(renderer);
  });
});

describe('getRenderProxy2D', () => {
  it('returns undefined when no node has been created', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    expect(getRenderProxy2D(state, obj)).toBeUndefined();
  });

  it('returns the node after getOrCreateRenderProxy2D', () => {
    const state = createRenderState();
    const obj = createDisplayObject();
    const created = getOrCreateRenderProxy2D(state, obj);
    expect(getRenderProxy2D(state, obj)).toBe(created);
  });
});

describe('installRenderAdaptHook', () => {
  it('does not throw when installing a hook', () => {
    expect(() => installRenderAdaptHook(vi.fn())).not.toThrow();
  });
});

describe('isRenderProxyDirty', () => {
  it('returns false when source and parent are clean', () => {
    const state = createRenderState({ sceneGraphSyncPolicy: 'requiresInvalidation' });
    const source = createDisplayObject();
    const data = createRenderProxy2D(state, source);
    data.lastAppearanceID = getNodeAppearanceRevision(source);
    data.lastLocalContentID = getNodeLocalContentRevision(source);
    data.lastLocalTransformID = getNodeLocalTransformRevision(source);

    expect(isRenderProxyDirty(state, source, data)).toBe(false);
  });

  it('returns true when appearance changes', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createRenderProxy2D(state, source);
    data.lastAppearanceID = getNodeAppearanceRevision(source);
    data.lastLocalTransformID = getNodeLocalTransformRevision(source);
    invalidateNodeAppearance(source);

    expect(isRenderProxyDirty(state, source, data)).toBe(true);
  });

  it('returns true when parent was updated this frame', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createRenderProxy2D(state, source);
    data.lastAppearanceID = getNodeAppearanceRevision(source);
    data.lastLocalTransformID = getNodeLocalTransformRevision(source);
    const parentData = createRenderProxy2D(state, createDisplayObject());
    parentData.transformFrameID = state.currentFrameID;

    expect(isRenderProxyDirty(state, source, data, parentData)).toBe(true);
  });

  it('returns true when transform changes', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createRenderProxy2D(state, source);
    data.transform2D = createMatrix();
    data.lastAppearanceID = getNodeAppearanceRevision(source);
    data.lastLocalTransformID = getNodeLocalTransformRevision(source);
    source.x = 10;
    invalidateNodeLocalTransform(source);

    expect(isRenderProxyDirty(state, source, data)).toBe(true);
  });
});

describe('isRenderProxyVisible', () => {
  it('returns false when alpha is zero', () => {
    const state = createRenderState();
    const node = createRenderProxy2D(state, createDisplayObject());
    node.alpha = 0;

    expect(isRenderProxyVisible(node)).toBe(false);
  });

  it('returns false when the node is hidden', () => {
    const state = createRenderState();
    const node = createRenderProxy2D(state, createDisplayObject());
    node.visible = false;

    expect(isRenderProxyVisible(node)).toBe(false);
  });

  it('returns false when the transform collapses both axes', () => {
    const state = createRenderState();
    const node = createRenderProxy2D(state, createDisplayObject());
    node.transform2D.a = 0;
    node.transform2D.d = 0;

    expect(isRenderProxyVisible(node)).toBe(false);
  });

  it('returns true for a visible node with positive alpha and non-collapsed transform', () => {
    const state = createRenderState();
    const node = createRenderProxy2D(state, createDisplayObject());

    expect(isRenderProxyVisible(node)).toBe(true);
  });
});

describe('prepareDisplayObjectRender', () => {
  it('creates render nodes for all enabled nodes in the tree', () => {
    const state = createRenderState();
    const root = createDisplayObject();
    const child = createDisplayObject();
    addNodeChild(root, child);

    prepareDisplayObjectRender(state, root);

    expect(state.renderProxyMap.get(root)).toBeDefined();
    expect(state.renderProxyMap.get(child)).toBeDefined();
  });

  it('skips disabled nodes', () => {
    const state = createRenderState();
    const root = createDisplayObject();
    const child = createDisplayObject();
    addNodeChild(root, child);
    child.enabled = false;

    prepareDisplayObjectRender(state, root);

    expect(state.renderProxyMap.get(root)).toBeDefined();
    expect(state.renderProxyMap.get(child)).toBeUndefined();
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
    state.displayObjectMaskPass = prepareMasks;
    const root = createMaskGroup();
    const mask = createDisplayObject();
    setMaskGroupMask(root, mask);

    prepareDisplayObjectRender(state, root);

    const maskNode = state.renderProxyMap.get(mask) as any;
    expect(maskNode).toBeDefined();
    expect(maskNode.isMaskFrameID).toBe(state.currentFrameID);
  });
});

describe('prepareMasks', () => {
  it('marks mask nodes for the current frame and sets mask depth on the masked node', () => {
    const state = createRenderState();
    state.displayObjectMaskPass = prepareMasks;
    const root = createMaskGroup();
    const maskObj = createDisplayObject();
    setMaskGroupMask(root, maskObj);
    prepareDisplayObjectRender(state, root);
    const maskData = getOrCreateRenderProxy2D(state, maskObj);
    expect(maskData.isMaskFrameID).toBe(state.currentFrameID);
    expect(getOrCreateRenderProxy2D(state, root).maskDepth).toBe(1);
  });
});

describe('prepareSpriteRender', () => {
  it('creates render nodes for all enabled nodes in the tree', () => {
    const state = createRenderState();
    const root = createSprite();
    const child = createSprite();
    addNodeChild(root, child);

    prepareSpriteRender(state, root);

    expect(state.renderProxyMap.get(root)).toBeDefined();
    expect(state.renderProxyMap.get(child)).toBeDefined();
  });

  it('skips disabled nodes', () => {
    const state = createRenderState();
    const root = createSprite();
    const child = createSprite();
    addNodeChild(root, child);
    child.enabled = false;

    prepareSpriteRender(state, root);

    expect(state.renderProxyMap.get(root)).toBeDefined();
    expect(state.renderProxyMap.get(child)).toBeUndefined();
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
    const data = getOrCreateRenderProxy2D(state, node);
    updateNodeClipRectangle(state, node, data, undefined);
    expect(data.clipRectangleDepth).toBe(1);
  });

  it('inherits the parent depth when the node has no clip rectangle', () => {
    const state = createRenderState();
    const node = createDisplayObject();
    const data = getOrCreateRenderProxy2D(state, node);
    const parentData = getOrCreateRenderProxy2D(state, createDisplayObject());
    parentData.clipRectangleDepth = 2;
    updateNodeClipRectangle(state, node, data, parentData);
    expect(data.clipRectangleDepth).toBe(2);
  });

  it('contributes no depth for a sprite node that lacks the clip-rectangle trait', () => {
    const state = createRenderState();
    const sprite = createSprite();
    const data = getOrCreateRenderProxy2D(state, sprite);
    updateNodeClipRectangle(state, sprite, data, undefined);
    expect(data.clipRectangleDepth).toBe(0);
  });
});

describe('updateRenderProxy2D', () => {
  it('updates appearance on a display-object render node', () => {
    const state = createRenderState();
    const root = createDisplayObject();
    const data = getOrCreateRenderProxy2D(state, root);
    updateRenderProxy2D(state, root, data, undefined);
    expect(data.alpha).toBe(1);
  });

  it('updates appearance on a sprite render node through the same visitor', () => {
    const state = createRenderState();
    const root = createSprite();
    const data = getOrCreateRenderProxy2D(state, root);
    updateRenderProxy2D(state, root, data, undefined);
    expect(data.alpha).toBe(1);
  });
});

describe('updateRenderProxyRenderer', () => {
  it('sets renderer from the map matching the node kind', () => {
    const state = createRenderState();
    const source = makeSource();
    const renderer = makeRenderer();
    registerRenderer(state, source.kind, renderer as any);
    const node = createRenderProxy(state, source);
    node.renderer = null;
    updateRenderProxyRenderer(state, node);
    expect(node.renderer).toBe(renderer);
  });

  it('sets renderer to null when no registration matches', () => {
    const state = createRenderState();
    const source = makeSource();
    const node = createRenderProxy(state, source);
    node.renderer = { createData: vi.fn(), submit: vi.fn() } as any;
    updateRenderProxyRenderer(state, node);
    expect(node.renderer).toBeNull();
  });

  it('updates rendererMapID to current state value', () => {
    const state = createRenderState();
    const source = makeSource();
    const node = createRenderProxy(state, source);
    node.rendererMapID = -1;
    updateRenderProxyRenderer(state, node);
    expect(node.rendererMapID).toBe(state.rendererMapID);
  });

  it('updates rendererData when source changes', () => {
    const state = createRenderState();
    const source = makeSource();
    const renderer = makeRenderer();
    registerRenderer(state, source.kind, renderer as any);
    const node = createRenderProxy(state, source);
    const newSource = makeSource();
    node.source = newSource;
    updateRenderProxyRenderer(state, node);
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
    getOrCreateRenderProxy2D(state, root).traverseChildren = false;
    const visit = vi.fn();
    walkNode(state, root, visit);
    expect(state.renderProxyMap.get(child)).toBeUndefined();
  });
});
