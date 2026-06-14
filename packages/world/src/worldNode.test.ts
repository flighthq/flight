import { setMatrix4Identity } from '@flighthq/geometry';
import type { HasTransform3DRuntime, Matrix4, WorldTransform3DNode } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { initTransform3DRuntimeTrait, initTransform3DTrait } from './hasTransform3d';
import { addWorldChild, getWorldChildCount, getWorldParent, getWorldRoot, removeWorldChild } from './worldHierarchy';
import {
  createWorldNode,
  createWorldNodeRuntime,
  getWorldNodeRuntime,
  getWorldNodeSignals,
  invalidateNodeLocalTransform,
  invalidateNodeParentReference,
  WorldNodeKind,
  type WorldNodeRuntime,
} from './worldNode';
import { ensureWorldTransformMatrix, getWorldTransformMatrix } from './worldTransform';

function createTransformNode(): WorldTransform3DNode {
  const node = createWorldNode() as WorldTransform3DNode;
  initTransform3DTrait(node);
  initTransform3DRuntimeTrait(getWorldNodeRuntime(node) as WorldNodeRuntime & HasTransform3DRuntime);
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

  it('creates the full set of world node signals', () => {
    const runtime = createWorldNodeRuntime();
    expect(runtime.worldNodeSignals.onChildAdded).toBeDefined();
    expect(runtime.worldNodeSignals.onChildRemoved).toBeDefined();
    expect(runtime.worldNodeSignals.onChildrenChanged).toBeDefined();
    expect(runtime.worldNodeSignals.onChildrenOrderChanged).toBeDefined();
    expect(runtime.worldNodeSignals.onParentChanged).toBeDefined();
  });
});

describe('createWorldNodeSignals', () => {
  it('returns an object with all expected signal fields', () => {
    const node = createWorldNode();
    const signals = getWorldNodeSignals(node);
    expect(signals.onChildAdded).toBeDefined();
    expect(signals.onChildRemoved).toBeDefined();
    expect(signals.onChildrenChanged).toBeDefined();
    expect(signals.onChildrenOrderChanged).toBeDefined();
    expect(signals.onParentChanged).toBeDefined();
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
  it('returns the runtime signal bag for the node', () => {
    const node = createWorldNode();
    expect(getWorldNodeSignals(node)).toBe(getWorldNodeRuntime(node).worldNodeSignals);
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
    const node = createWorldNode() as WorldTransform3DNode;
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
  it('addWorldChild links parent and child', () => {
    const parent = createWorldNode();
    const child = createWorldNode();
    addWorldChild(parent, child);
    expect(getWorldParent(child)).toBe(parent);
    expect(getWorldChildCount(parent)).toBe(1);
  });

  it('reparents a child from one node to another', () => {
    const a = createWorldNode();
    const b = createWorldNode();
    const child = createWorldNode();
    addWorldChild(a, child);
    addWorldChild(b, child);
    expect(getWorldParent(child)).toBe(b);
    expect(getWorldChildCount(a)).toBe(0);
    expect(getWorldChildCount(b)).toBe(1);
  });

  it('removeWorldChild unlinks parent and child', () => {
    const parent = createWorldNode();
    const child = createWorldNode();
    addWorldChild(parent, child);
    removeWorldChild(parent, child);
    expect(getWorldParent(child)).toBe(null);
    expect(getWorldChildCount(parent)).toBe(0);
  });

  it('getWorldRoot traverses to the top ancestor', () => {
    const root = createWorldNode();
    const mid = createWorldNode();
    const leaf = createWorldNode();
    addWorldChild(root, mid);
    addWorldChild(mid, leaf);
    expect(getWorldRoot(leaf)).toBe(root);
    expect(getWorldRoot(mid)).toBe(root);
    expect(getWorldRoot(root)).toBe(root);
  });

  it('throws when adding a node as its own child', () => {
    const node = createWorldNode();
    expect(() => addWorldChild(node, node)).toThrow(TypeError);
  });
});

describe('WorldNodeRuntime', () => {
  it('starts with no parent, no children, and null worldMatrix', () => {
    const node = createTransformNode();
    const runtime = getWorldNodeRuntime(node);
    expect(runtime.parent).toBe(null);
    expect(runtime.children).toBe(null);
    expect((runtime as ReturnType<typeof getWorldNodeRuntime> & { worldMatrix: unknown }).worldMatrix).toBe(null);
  });
});

describe('worldTransform', () => {
  it('worldMatrix equals localMatrix for a root node', () => {
    const node = createTransformNode();
    node.localMatrix.m[12] = 10;
    node.localMatrix.m[13] = 20;
    node.localMatrix.m[14] = 30;
    invalidateNodeLocalTransform(node);

    const world = getWorldTransformMatrix(node);
    expect(world.m[12]).toBe(10);
    expect(world.m[13]).toBe(20);
    expect(world.m[14]).toBe(30);
  });

  it('world matrix is parent * local for a child node', () => {
    const parent = createTransformNode();
    const child = createTransformNode();
    addWorldChild(parent, child);

    parent.localMatrix.m[12] = 5;
    invalidateNodeLocalTransform(parent);

    child.localMatrix.m[12] = 3;
    invalidateNodeLocalTransform(child);

    const world = getWorldTransformMatrix(child);
    expect(world.m[12]).toBeCloseTo(8);
  });

  it('world matrix is recomputed after localMatrix changes', () => {
    const node = createTransformNode();
    invalidateNodeLocalTransform(node);
    ensureWorldTransformMatrix(node);
    const first = getWorldNodeRuntime(node).worldTransformID;

    node.localMatrix.m[12] = 99;
    invalidateNodeLocalTransform(node);

    ensureWorldTransformMatrix(node);
    const second = getWorldNodeRuntime(node).worldTransformID;

    expect(second).not.toBe(first);
  });

  it('world matrix is cached when nothing changes', () => {
    const node = createTransformNode();
    ensureWorldTransformMatrix(node);
    const id1 = getWorldNodeRuntime(node).worldTransformID;
    ensureWorldTransformMatrix(node);
    const id2 = getWorldNodeRuntime(node).worldTransformID;
    expect(id1).toBe(id2);
  });

  it('child world matrix updates when parent localMatrix changes', () => {
    const parent = createTransformNode();
    const child = createTransformNode();
    addWorldChild(parent, child);

    setMatrix4Identity(parent.localMatrix);
    setMatrix4Identity(child.localMatrix);
    invalidateNodeLocalTransform(parent);
    invalidateNodeLocalTransform(child);

    parent.localMatrix.m[12] = 7;
    invalidateNodeLocalTransform(parent);

    const world = getWorldTransformMatrix(child);
    expect(world.m[12]).toBeCloseTo(7);
  });
});
