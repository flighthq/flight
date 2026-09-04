import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createMatrix, createRectangle } from '@flighthq/geometry/contract';
import {
  addNodeChild,
  addNodeChildAt,
  getNodeAppearanceRevision,
  getNodeChildrenRevision,
  getNodeLocalContentRevision,
  getNodeLocalTransformRevision,
  getNodeParentReferenceRevision,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  removeNodeChild,
} from '@flighthq/node/contract';
import { createDisplayObject, setNode2DClip } from '@flighthq/scene2d/contract';
import { createSprite } from '@flighthq/scene2d/contract';
import type { ClipRegion, Node, RenderProxy, RenderProxy2D, RenderState } from '@flighthq/types/contract';
import { RegistryEntryState } from '@flighthq/types/contract';

import { registerRenderer } from './renderer';
import {
  createRenderProxy,
  createRenderProxy2D,
  disposeRenderProxy,
  disposeScene2DRender,
  getOrCreateRenderProxy2D,
  getRenderProxy2D,
  initializeRenderProxy,
  installRenderAdaptHook,
  isRenderProxyDirty,
  isRenderProxyVisible,
  prepareScene2DRender,
  updateNodeClip,
  updateRenderProxy2D,
  updateRenderProxyRenderer,
  walkNode,
} from './renderProxy';
import { createRenderState, getRenderStateRuntime } from './renderState';

const DisplayObjectKind = 'DisplayObject';

function makeSource() {
  return { kind: DisplayObjectKind } as any;
}

function makeRenderer() {
  return { createData: () => ({ tag: 'data' }), submit: vi.fn() };
}

function makeClipRegion(): ClipRegion {
  const out = allocateEntity<ClipRegion>();
  out.contours = null;
  out.rect = createRectangle(0, 0, 10, 10);
  out.winding = 'nonZero';
  out.version = 0;
  return finishEntity(out);
}

function markRenderProxyClean<Traits extends object>(data: RenderProxy, source: Node<Traits>): void {
  data.lastAppearanceId = getNodeAppearanceRevision(source);
  data.lastChildrenId = getNodeChildrenRevision(source);
  data.lastLocalContentId = getNodeLocalContentRevision(source);
  data.lastLocalTransformId = getNodeLocalTransformRevision(source);
  data.lastParentReferenceId = getNodeParentReferenceRevision(source);
}

describe('createRenderProxy', () => {
  it('initializes default values', () => {
    const state = createRenderState();
    const source = makeSource();
    const node = createRenderProxy(state, source);
    expect(node.source).toBe(source);
    expect(node.kind).toBe(source.kind);
    expect(node.next).toBeNull();
    expect(node.alpha).toBe(1);
    expect(node.appearanceFrameId).toBe(-1);
    expect(node.lastAppearanceId).toBe(-1);
    expect(node.lastChildrenId).toBe(-1);
    expect(node.lastLocalTransformId).toBe(-1);
    expect(node.lastParentReferenceId).toBe(-1);
    expect(node.transformFrameId).toBe(-1);
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
      expect(node.clipDepth).toBe(0);
      expect(node.traverseChildren).toBe(true);
    }
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

describe('disposeScene2DRender', () => {
  it('disposes the root and all descendants', () => {
    const state = createRenderState();
    const root = createDisplayObject();
    const child = createDisplayObject();
    const grandchild = createDisplayObject();
    addNodeChild(root, child);
    addNodeChild(child, grandchild);
    prepareScene2DRender(state, root);

    disposeScene2DRender(state, root);

    expect(getRenderProxy2D(state, root)).toBeUndefined();
    expect(getRenderProxy2D(state, child)).toBeUndefined();
    expect(getRenderProxy2D(state, grandchild)).toBeUndefined();
  });

  it('disposes a sprite subtree the same way', () => {
    const state = createRenderState();
    const root = createSprite();
    const child = createSprite();
    const grandchild = createSprite();
    addNodeChild(root, child);
    addNodeChild(child, grandchild);
    prepareScene2DRender(state, root);

    disposeScene2DRender(state, root);

    expect(getRenderProxy2D(state, root)).toBeUndefined();
    expect(getRenderProxy2D(state, child)).toBeUndefined();
    expect(getRenderProxy2D(state, grandchild)).toBeUndefined();
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

    disposeScene2DRender(state, root);

    expect(destroyData).toHaveBeenCalledTimes(2);
  });

  it('visits disabled nodes that were never prepared', () => {
    const state = createRenderState();
    const root = createDisplayObject();
    const child = createDisplayObject();
    addNodeChild(root, child);
    child.enabled = false;
    prepareScene2DRender(state, root);
    // prepareScene2DRender skips disabled nodes, but disposeScene2DRender should not
    getOrCreateRenderProxy2D(state, child);

    disposeScene2DRender(state, root);

    expect(getRenderProxy2D(state, child)).toBeUndefined();
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

  it('invalidates and syncs an existing proxy when the renderer table is replaced', () => {
    const state = createRenderState();
    const source = createSprite();
    const node = getOrCreateRenderProxy2D(state, source);
    expect(node.renderer).toBeNull();

    const renderer = makeRenderer();
    const runtime = getRenderStateRuntime(state);
    const tableBeforeRegistration = runtime.registries.renderers;
    const idBeforeRegistration = runtime.rendererMapId;
    registerRenderer(state, source.kind, renderer as any);
    expect(runtime.registries.renderers).not.toBe(tableBeforeRegistration);
    expect(runtime.rendererMapId).toBe(idBeforeRegistration + 1);
    getOrCreateRenderProxy2D(state, source);

    expect(node.renderer).toBe(renderer);
    expect(node.rendererMapId).toBe(runtime.rendererMapId);
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

describe('initializeRenderProxy', () => {
  it('is the construction initializer of createRenderProxy', () => {
    expect(typeof initializeRenderProxy).toBe('function');
  });
});

describe('installRenderAdaptHook', () => {
  it('does not throw when installing a hook', () => {
    const state = createRenderState();
    expect(() => installRenderAdaptHook(state, vi.fn())).not.toThrow();
  });

  it('writes the hook to the render state runtime', () => {
    const state = createRenderState();
    const hook = vi.fn();
    installRenderAdaptHook(state, hook);
    expect(getRenderStateRuntime(state).renderAdaptHook).toBe(hook);
  });
});

describe('isRenderProxyDirty', () => {
  it('returns false when source and parent are clean', () => {
    const state = createRenderState({ sceneGraphSyncPolicy: 'requiresInvalidation' });
    const source = createDisplayObject();
    const data = createRenderProxy2D(state, source);
    markRenderProxyClean(data, source);

    expect(isRenderProxyDirty(state, source, data)).toBe(false);
  });

  it('returns true when appearance changes', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createRenderProxy2D(state, source);
    markRenderProxyClean(data, source);
    invalidateNodeAppearance(source);

    expect(isRenderProxyDirty(state, source, data)).toBe(true);
  });

  it('returns true when parent was updated this frame', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createRenderProxy2D(state, source);
    markRenderProxyClean(data, source);
    const parentData = createRenderProxy2D(state, createDisplayObject());
    parentData.transformFrameId = getRenderStateRuntime(state).currentFrameId;

    expect(isRenderProxyDirty(state, source, data, parentData)).toBe(true);
  });

  it('returns true when transform changes', () => {
    const state = createRenderState();
    const source = createDisplayObject();
    const data = createRenderProxy2D(state, source);
    data.transform2D = createMatrix();
    markRenderProxyClean(data, source);
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

describe('prepareScene2DRender', () => {
  it('dirties a warm proxy when it is reattached after another prepared child', () => {
    const state = createRenderState({ sceneGraphSyncPolicy: 'requiresInvalidation' });
    const root = createDisplayObject();
    const childA = createDisplayObject();
    const childB = createDisplayObject();
    addNodeChild(root, childA);
    expect(prepareScene2DRender(state, root)).toBe(true);
    expect(prepareScene2DRender(state, root)).toBe(false);

    removeNodeChild(root, childA);
    addNodeChild(root, childB);
    expect(prepareScene2DRender(state, root)).toBe(true);
    expect(prepareScene2DRender(state, root)).toBe(false);

    removeNodeChild(root, childB);
    addNodeChild(root, childA);
    expect(prepareScene2DRender(state, root)).toBe(true);
    expect(prepareScene2DRender(state, root)).toBe(false);
  });

  it('dirties the tree when a prepared child is removed', () => {
    const state = createRenderState({ sceneGraphSyncPolicy: 'requiresInvalidation' });
    const root = createDisplayObject();
    const child = createDisplayObject();
    addNodeChild(root, child);
    prepareScene2DRender(state, root);
    expect(prepareScene2DRender(state, root)).toBe(false);

    removeNodeChild(root, child);

    expect(prepareScene2DRender(state, root)).toBe(true);
    expect(prepareScene2DRender(state, root)).toBe(false);
  });

  it('dirties the tree when prepared siblings are reordered', () => {
    const state = createRenderState({ sceneGraphSyncPolicy: 'requiresInvalidation' });
    const root = createDisplayObject();
    const childA = createDisplayObject();
    const childB = createDisplayObject();
    addNodeChild(root, childA);
    addNodeChild(root, childB);
    prepareScene2DRender(state, root);
    expect(prepareScene2DRender(state, root)).toBe(false);

    addNodeChildAt(root, childA, 1);

    expect(prepareScene2DRender(state, root)).toBe(true);
    expect(prepareScene2DRender(state, root)).toBe(false);
  });

  it('recomputes inherited transform and appearance when a warm child changes parent', () => {
    const state = createRenderState({ sceneGraphSyncPolicy: 'requiresInvalidation' });
    const root = createDisplayObject();
    const parentA = createDisplayObject();
    const parentB = createDisplayObject();
    const child = createDisplayObject();
    parentA.x = 10;
    parentA.alpha = 0.5;
    parentB.x = 100;
    parentB.alpha = 0.25;
    child.x = 3;
    child.alpha = 0.5;
    invalidateNodeLocalTransform(parentA);
    invalidateNodeAppearance(parentA);
    invalidateNodeLocalTransform(parentB);
    invalidateNodeAppearance(parentB);
    invalidateNodeLocalTransform(child);
    invalidateNodeAppearance(child);
    addNodeChild(root, parentA);
    addNodeChild(root, parentB);
    addNodeChild(parentA, child);
    prepareScene2DRender(state, root);
    expect(getOrCreateRenderProxy2D(state, child).transform2D.tx).toBe(13);
    expect(getOrCreateRenderProxy2D(state, child).alpha).toBe(0.25);

    addNodeChild(parentB, child);

    expect(prepareScene2DRender(state, root)).toBe(true);
    expect(getOrCreateRenderProxy2D(state, child).transform2D.tx).toBe(103);
    expect(getOrCreateRenderProxy2D(state, child).alpha).toBe(0.125);
    expect(prepareScene2DRender(state, root)).toBe(false);
  });

  it('creates render nodes for all enabled nodes in the tree', () => {
    const state = createRenderState();
    const root = createDisplayObject();
    const child = createDisplayObject();
    addNodeChild(root, child);

    prepareScene2DRender(state, root);

    expect(getRenderStateRuntime(state).renderProxyMap.get(root)).toBeDefined();
    expect(getRenderStateRuntime(state).renderProxyMap.get(child)).toBeDefined();
  });

  it('prepares a sprite tree the same way', () => {
    const state = createRenderState();
    const root = createSprite();
    const child = createSprite();
    addNodeChild(root, child);

    prepareScene2DRender(state, root);

    expect(getRenderStateRuntime(state).renderProxyMap.get(root)).toBeDefined();
    expect(getRenderStateRuntime(state).renderProxyMap.get(child)).toBeDefined();
  });

  it('skips disabled nodes', () => {
    const state = createRenderState();
    const root = createDisplayObject();
    const child = createDisplayObject();
    addNodeChild(root, child);
    child.enabled = false;

    prepareScene2DRender(state, root);

    expect(getRenderStateRuntime(state).renderProxyMap.get(root)).toBeDefined();
    expect(getRenderStateRuntime(state).renderProxyMap.get(child)).toBeUndefined();
  });

  it('returns true when tree is dirty', () => {
    const state = createRenderState();
    const root = createDisplayObject();

    expect(prepareScene2DRender(state, root)).toBe(true);
  });

  it('returns false when tree is clean', () => {
    const state = createRenderState({ sceneGraphSyncPolicy: 'requiresInvalidation' });
    const root = createDisplayObject();
    prepareScene2DRender(state, root);

    expect(prepareScene2DRender(state, root)).toBe(false);
  });

  it('returns true when the registered renderer reports an identity-tier change', () => {
    const state = createRenderState({ sceneGraphSyncPolicy: 'requiresInvalidation' });
    const root = createDisplayObject();
    let rendererDirty = false;
    registerRenderer(state, root.kind, {
      createData: () => null,
      isDirty: () => rendererDirty,
      submit: vi.fn(),
    });
    prepareScene2DRender(state, root);
    expect(prepareScene2DRender(state, root)).toBe(false);

    rendererDirty = true;

    expect(prepareScene2DRender(state, root)).toBe(true);
  });

  it('accumulates clip depth down a clipped subtree', () => {
    const state = createRenderState();
    const root = createDisplayObject();
    const child = createDisplayObject();
    const grandchild = createDisplayObject();
    addNodeChild(root, child);
    addNodeChild(child, grandchild);
    setNode2DClip(root, makeClipRegion());
    setNode2DClip(child, makeClipRegion());

    prepareScene2DRender(state, root);

    expect(getOrCreateRenderProxy2D(state, root).clipDepth).toBe(1);
    expect(getOrCreateRenderProxy2D(state, child).clipDepth).toBe(2);
    expect(getOrCreateRenderProxy2D(state, grandchild).clipDepth).toBe(2);
  });
});

describe('updateNodeClip', () => {
  it('adds one to the parent depth when the node has a clip', () => {
    const state = createRenderState();
    const node = createDisplayObject();
    setNode2DClip(node, makeClipRegion());
    const data = getOrCreateRenderProxy2D(state, node);
    updateNodeClip(state, node, data, undefined);
    expect(data.clipDepth).toBe(1);
  });

  it('inherits the parent depth when the node has no clip', () => {
    const state = createRenderState();
    const node = createDisplayObject();
    const data = getOrCreateRenderProxy2D(state, node);
    const parentData = getOrCreateRenderProxy2D(state, createDisplayObject());
    parentData.clipDepth = 2;
    updateNodeClip(state, node, data, parentData);
    expect(data.clipDepth).toBe(2);
  });

  it('contributes no depth for a sprite node that lacks the clip trait', () => {
    const state = createRenderState();
    const sprite = createSprite();
    const data = getOrCreateRenderProxy2D(state, sprite);
    updateNodeClip(state, sprite, data, undefined);
    expect(data.clipDepth).toBe(0);
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

  it('sets clip depth from the parent through the same visitor', () => {
    const state = createRenderState();
    const root = createDisplayObject();
    setNode2DClip(root, makeClipRegion());
    const data = getOrCreateRenderProxy2D(state, root);
    updateRenderProxy2D(state, root, data, undefined);
    expect(data.clipDepth).toBe(1);
  });

  it('runs the optional color resolver after material and before clip and revision bookkeeping', () => {
    const state = createRenderState();
    const root = createDisplayObject();
    const material = { kind: 'TestMaterial' } as never;
    root.material = material;
    setNode2DClip(root, makeClipRegion());
    const data = getOrCreateRenderProxy2D(state, root);
    const resolver = vi.fn((_state: RenderState, resolvedData: RenderProxy) => {
      expect(resolvedData.material).toBe(material);
      expect((resolvedData as RenderProxy2D).clipDepth).toBe(0);
      expect(resolvedData.lastChildrenId).toBe(-1);
    });
    const runtime = getRenderStateRuntime(state);
    runtime.registries.colorAdjustments = {
      entry: { state: RegistryEntryState.Bound, value: resolver },
      onMiss: 'Disabled',
      registry: 'ColorAdjustments',
      shape: 'slot',
    };

    updateRenderProxy2D(state, root, data, undefined);

    expect(resolver).toHaveBeenCalledWith(state, data, undefined);
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(data.clipDepth).toBe(1);
    expect(data.lastChildrenId).toBe(getNodeChildrenRevision(root));
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

  it('updates rendererMapId to current state value', () => {
    const state = createRenderState();
    const source = makeSource();
    const node = createRenderProxy(state, source);
    node.rendererMapId = -1;
    updateRenderProxyRenderer(state, node);
    expect(node.rendererMapId).toBe(getRenderStateRuntime(state).rendererMapId);
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
    expect(getRenderStateRuntime(state).renderProxyMap.get(child)).toBeUndefined();
  });
});
