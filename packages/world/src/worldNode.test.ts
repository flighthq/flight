import { setMatrix4Identity } from '@flighthq/geometry';
import {
  addNodeChild,
  ensureNodeWorldTransformMatrix4,
  getNodeChildCount,
  getNodeParent,
  getNodeRoot,
  getNodeWorldTransformMatrix4,
  initTransform3DRuntimeTrait,
  initTransform3DTrait,
  invalidateNodeLocalTransform,
  invalidateNodeParentReference,
  removeNodeChild,
} from '@flighthq/node';
import type { Matrix4, WorldNode } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import {
  createWorldNode,
  createWorldNodeRuntime,
  enableWorldNodeSignals,
  getWorldNodeRuntime,
  getWorldNodeSignals,
  WorldNodeKind,
  type WorldNodeRuntime,
} from './worldNode';

function createTransformNode(): WorldNode {
  const node = createWorldNode();
  initTransform3DTrait(node);
  initTransform3DRuntimeTrait(getWorldNodeRuntime(node));
  return node;
}

describe('createWorldNode', () => {
  it('uses WorldNodeKind by default', () => {
    const node = createWorldNode();
    expect(node.kind).toBe(WorldNodeKind);
  });

  it('accepts a custom kind', () => {
    const MyKind: unique symbol = Symbol('MyKind');
    const node = createWorldNode(MyKind);
    expect(node.kind).toBe(MyKind);
  });

  it('defaults enabled to true and name to null', () => {
    const node = createWorldNode();
    expect(node.enabled).toBe(true);
    expect(node.name).toBe(null);
  });

  it('accepts partial initial values', () => {
    const node = createWorldNode(WorldNodeKind, { enabled: false, name: 'root' });
    expect(node.enabled).toBe(false);
    expect(node.name).toBe('root');
  });
});

describe('createWorldNodeRuntime', () => {
  it('initializes transform bookkeeping ids', () => {
    const runtime = createWorldNodeRuntime();
    expect(runtime.localTransformID).toBe(0);
    expect(runtime.worldTransformID).toBe(0);
    expect(runtime.worldTransformUsingLocalTransformID).toBe(-1);
    expect(runtime.worldTransformUsingParentTransformID).toBe(-1);
  });

  it('initializes worldMatrix to null', () => {
    const runtime = createWorldNodeRuntime();
    expect(runtime.worldMatrix).toBeNull();
  });
});

describe('enableWorldNodeSignals', () => {
  it('creates and returns the signal bag on first call', () => {
    const node = createWorldNode();
    const signals = enableWorldNodeSignals(node);
    expect(signals.onChildAdded).toBeDefined();
    expect(signals.onParentChanged).toBeDefined();
  });

  it('returns the same object on subsequent calls', () => {
    const node = createWorldNode();
    expect(enableWorldNodeSignals(node)).toBe(enableWorldNodeSignals(node));
  });

  it('stores the signals on the runtime nodeSignals slot', () => {
    const node = createWorldNode();
    const signals = enableWorldNodeSignals(node);
    expect(getWorldNodeRuntime(node).nodeSignals).toBe(signals);
  });
});

describe('getWorldNodeRuntime', () => {
  it('returns a runtime with the expected initial state', () => {
    const node = createWorldNode();
    const runtime = getWorldNodeRuntime(node);
    expect(runtime.children).toBeNull();
    expect(runtime.parent).toBeNull();
  });
});

describe('getWorldNodeSignals', () => {
  it('returns null before signals are enabled', () => {
    const node = createWorldNode();
    expect(getWorldNodeSignals(node)).toBeNull();
  });

  it('returns the runtime nodeSignals after enableWorldNodeSignals', () => {
    const node = createWorldNode();
    const signals = enableWorldNodeSignals(node);
    expect(getWorldNodeSignals(node)).toBe(signals);
    expect(getWorldNodeSignals(node)).toBe(getWorldNodeRuntime(node).nodeSignals);
  });
});

describe('initTransform3DTrait', () => {
  it('sets an identity localMatrix by default', () => {
    const node = createTransformNode();
    const m = node.localMatrix.m;
    expect(m[0]).toBe(1);
    expect(m[5]).toBe(1);
    expect(m[10]).toBe(1);
    expect(m[15]).toBe(1);
    expect(m[12]).toBe(0);
    expect(m[13]).toBe(0);
    expect(m[14]).toBe(0);
  });

  it('accepts an existing matrix', () => {
    const node = createWorldNode();
    const existing = { m: new Float32Array(16) } as unknown as Matrix4;
    existing.m[12] = 42;
    initTransform3DTrait(node, { localMatrix: existing });
    expect(node.localMatrix.m[12]).toBe(42);
  });
});

describe('invalidateNodeLocalTransform', () => {
  it('increments the local transform id', () => {
    const node = createWorldNode();
    const before = getWorldNodeRuntime(node).localTransformID;
    invalidateNodeLocalTransform(node);
    expect(getWorldNodeRuntime(node).localTransformID).toBe(before + 1);
  });
});

describe('invalidateNodeParentReference', () => {
  it('resets the cached parent transform id so the world matrix recomputes', () => {
    const node = createWorldNode();
    getWorldNodeRuntime(node).worldTransformUsingParentTransformID = 5;
    invalidateNodeParentReference(node);
    expect(getWorldNodeRuntime(node).worldTransformUsingParentTransformID).toBe(-1);
  });
});

describe('worldHierarchy', () => {
  it('addNodeChild links parent and child', () => {
    const parent = createWorldNode();
    const child = createWorldNode();
    addNodeChild(parent, child);
    expect(getNodeParent(child)).toBe(parent);
    expect(getNodeChildCount(parent)).toBe(1);
  });

  it('reparents a child from one node to another', () => {
    const a = createWorldNode();
    const b = createWorldNode();
    const child = createWorldNode();
    addNodeChild(a, child);
    addNodeChild(b, child);
    expect(getNodeParent(child)).toBe(b);
    expect(getNodeChildCount(a)).toBe(0);
    expect(getNodeChildCount(b)).toBe(1);
  });

  it('removeNodeChild unlinks parent and child', () => {
    const parent = createWorldNode();
    const child = createWorldNode();
    addNodeChild(parent, child);
    removeNodeChild(parent, child);
    expect(getNodeParent(child)).toBe(null);
    expect(getNodeChildCount(parent)).toBe(0);
  });

  it('getNodeRoot traverses to the top ancestor', () => {
    const root = createWorldNode();
    const mid = createWorldNode();
    const leaf = createWorldNode();
    addNodeChild(root, mid);
    addNodeChild(mid, leaf);
    expect(getNodeRoot(leaf)).toBe(root);
    expect(getNodeRoot(mid)).toBe(root);
    expect(getNodeRoot(root)).toBe(root);
  });

  it('throws when adding a node as its own child', () => {
    const node = createWorldNode();
    expect(() => addNodeChild(node, node)).toThrow(TypeError);
  });
});

describe('WorldNodeRuntime', () => {
  it('starts with no parent, no children, and null worldMatrix', () => {
    const node = createTransformNode();
    const runtime = getWorldNodeRuntime(node) as WorldNodeRuntime;
    expect(runtime.parent).toBe(null);
    expect(runtime.children).toBe(null);
    expect(runtime.worldMatrix).toBe(null);
  });
});

describe('worldTransform', () => {
  it('worldMatrix equals localMatrix for a root node', () => {
    const node = createTransformNode();
    node.localMatrix.m[12] = 10;
    node.localMatrix.m[13] = 20;
    node.localMatrix.m[14] = 30;
    invalidateNodeLocalTransform(node);

    const world = getNodeWorldTransformMatrix4(node);
    expect(world.m[12]).toBe(10);
    expect(world.m[13]).toBe(20);
    expect(world.m[14]).toBe(30);
  });

  it('world matrix is parent * local for a child node', () => {
    const parent = createTransformNode();
    const child = createTransformNode();
    addNodeChild(parent, child);

    parent.localMatrix.m[12] = 5;
    invalidateNodeLocalTransform(parent);

    child.localMatrix.m[12] = 3;
    invalidateNodeLocalTransform(child);

    const world = getNodeWorldTransformMatrix4(child);
    expect(world.m[12]).toBeCloseTo(8);
  });

  it('world matrix is recomputed after localMatrix changes', () => {
    const node = createTransformNode();
    invalidateNodeLocalTransform(node);
    ensureNodeWorldTransformMatrix4(node);
    const first = getWorldNodeRuntime(node).worldTransformID;

    node.localMatrix.m[12] = 99;
    invalidateNodeLocalTransform(node);

    ensureNodeWorldTransformMatrix4(node);
    const second = getWorldNodeRuntime(node).worldTransformID;

    expect(second).not.toBe(first);
  });

  it('world matrix is cached when nothing changes', () => {
    const node = createTransformNode();
    ensureNodeWorldTransformMatrix4(node);
    const id1 = getWorldNodeRuntime(node).worldTransformID;
    ensureNodeWorldTransformMatrix4(node);
    const id2 = getWorldNodeRuntime(node).worldTransformID;
    expect(id1).toBe(id2);
  });

  it('child world matrix updates when parent localMatrix changes', () => {
    const parent = createTransformNode();
    const child = createTransformNode();
    addNodeChild(parent, child);

    setMatrix4Identity(parent.localMatrix);
    setMatrix4Identity(child.localMatrix);
    invalidateNodeLocalTransform(parent);
    invalidateNodeLocalTransform(child);

    parent.localMatrix.m[12] = 7;
    invalidateNodeLocalTransform(parent);

    const world = getNodeWorldTransformMatrix4(child);
    expect(world.m[12]).toBeCloseTo(7);
  });
});
