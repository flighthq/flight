import {
  addNodeChild,
  ensureNodeWorldMatrix4,
  getNodeChildCount,
  getNodeLocalMatrix4,
  getNodeParent,
  getNodeRoot,
  getNodeWorldMatrix4,
  initTransform3DRuntimeTrait,
  initTransform3DTrait,
  invalidateNodeLocalTransform,
  invalidateNodeParentReference,
  removeNodeChild,
  setNodeLocalMatrix4,
} from '@flighthq/node/contract';
import type { Matrix4, Node3D } from '@flighthq/types/contract';
import type { Node3DRuntime } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  createNode3D,
  createNode3DRuntime,
  enableNode3DSignals,
  getNode3DRuntime,
  getNode3DSignals,
  Node3DKind,
} from './sceneNode';

function createTransformNode(): Node3D {
  const node = createNode3D();
  initTransform3DTrait(node);
  initTransform3DRuntimeTrait(getNode3DRuntime(node));
  return node;
}

describe('createNode3D', () => {
  it('uses Node3DKind by default', () => {
    const node = createNode3D();
    expect(node.kind).toBe(Node3DKind);
  });

  it('accepts a custom kind', () => {
    const MyKind = 'MyKind';
    const node = createNode3D(MyKind);
    expect(node.kind).toBe(MyKind);
  });

  it('defaults enabled to true and name to null', () => {
    const node = createNode3D();
    expect(node.enabled).toBe(true);
    expect(node.name).toBe(null);
  });

  it('accepts partial initial values', () => {
    const node = createNode3D(Node3DKind, { enabled: false, name: 'root' });
    expect(node.enabled).toBe(false);
    expect(node.name).toBe('root');
  });

  it('defaults alpha to 1 (fully opaque)', () => {
    expect(createNode3D().alpha).toBe(1);
  });

  it('accepts an initial alpha', () => {
    expect(createNode3D(Node3DKind, { alpha: 0.4 }).alpha).toBeCloseTo(0.4);
  });
});

describe('createNode3DRuntime', () => {
  it('initializes transform bookkeeping ids', () => {
    const runtime = createNode3DRuntime();
    expect(runtime.localTransformId).toBe(0);
    expect(runtime.worldTransformId).toBe(0);
    expect(runtime.worldTransformUsingLocalTransformId).toBe(-1);
    expect(runtime.worldTransformUsingParentTransformId).toBe(-1);
  });

  it('initializes worldMatrix to null', () => {
    const runtime = createNode3DRuntime();
    expect(runtime.worldMatrix4).toBeNull();
  });

  it('initializes worldAlpha to null (unresolved until prepared)', () => {
    expect(createNode3DRuntime().worldAlpha).toBeNull();
  });
});

describe('enableNode3DSignals', () => {
  it('creates and returns the signal bag on first call', () => {
    const node = createNode3D();
    const signals = enableNode3DSignals(node);
    expect(signals.onChildAdded).toBeDefined();
    expect(signals.onParentChanged).toBeDefined();
  });

  it('returns the same object on subsequent calls', () => {
    const node = createNode3D();
    expect(enableNode3DSignals(node)).toBe(enableNode3DSignals(node));
  });

  it('stores the signals on the runtime nodeSignals slot', () => {
    const node = createNode3D();
    const signals = enableNode3DSignals(node);
    expect(getNode3DRuntime(node).nodeSignals).toBe(signals);
  });
});

describe('getNode3DRuntime', () => {
  it('returns a runtime with the expected initial state', () => {
    const node = createNode3D();
    const runtime = getNode3DRuntime(node);
    expect(runtime.children).toBeNull();
    expect(runtime.parent).toBeNull();
  });
});

describe('getNode3DSignals', () => {
  it('returns null before signals are enabled', () => {
    const node = createNode3D();
    expect(getNode3DSignals(node)).toBeNull();
  });

  it('returns the runtime nodeSignals after enableNode3DSignals', () => {
    const node = createNode3D();
    const signals = enableNode3DSignals(node);
    expect(getNode3DSignals(node)).toBe(signals);
    expect(getNode3DSignals(node)).toBe(getNode3DRuntime(node).nodeSignals);
  });
});

describe('initTransform3DTrait', () => {
  it('sets an identity localMatrix by default', () => {
    const node = createTransformNode();
    const m = getNodeLocalMatrix4(node).m;
    expect(m[0]).toBe(1);
    expect(m[5]).toBe(1);
    expect(m[10]).toBe(1);
    expect(m[15]).toBe(1);
    expect(m[12]).toBe(0);
    expect(m[13]).toBe(0);
    expect(m[14]).toBe(0);
  });

  it('accepts an existing matrix', () => {
    const node = createNode3D();
    const existing = { m: new Float32Array(16) } as unknown as Matrix4;
    existing.m[12] = 42;
    setNodeLocalMatrix4(node, existing);
    expect(getNodeLocalMatrix4(node).m[12]).toBe(42);
  });
});

describe('invalidateNodeLocalTransform', () => {
  it('increments the local transform id', () => {
    const node = createNode3D();
    const before = getNode3DRuntime(node).localTransformId;
    invalidateNodeLocalTransform(node);
    expect(getNode3DRuntime(node).localTransformId).toBe(before + 1);
  });
});

describe('invalidateNodeParentReference', () => {
  it('resets the cached parent transform id so the world matrix recomputes', () => {
    const node = createNode3D();
    getNode3DRuntime(node).worldTransformUsingParentTransformId = 5;
    invalidateNodeParentReference(node);
    expect(getNode3DRuntime(node).worldTransformUsingParentTransformId).toBe(-1);
  });
});

describe('Node3DRuntime', () => {
  it('starts with no parent, no children, and null worldMatrix', () => {
    const node = createTransformNode();
    const runtime = getNode3DRuntime(node) as Node3DRuntime;
    expect(runtime.parent).toBe(null);
    expect(runtime.children).toBe(null);
    expect(runtime.worldMatrix4).toBe(null);
  });
});

describe('worldHierarchy', () => {
  it('addNodeChild links parent and child', () => {
    const parent = createNode3D();
    const child = createNode3D();
    addNodeChild(parent, child);
    expect(getNodeParent(child)).toBe(parent);
    expect(getNodeChildCount(parent)).toBe(1);
  });

  it('reparents a child from one node to another', () => {
    const a = createNode3D();
    const b = createNode3D();
    const child = createNode3D();
    addNodeChild(a, child);
    addNodeChild(b, child);
    expect(getNodeParent(child)).toBe(b);
    expect(getNodeChildCount(a)).toBe(0);
    expect(getNodeChildCount(b)).toBe(1);
  });

  it('removeNodeChild unlinks parent and child', () => {
    const parent = createNode3D();
    const child = createNode3D();
    addNodeChild(parent, child);
    removeNodeChild(parent, child);
    expect(getNodeParent(child)).toBe(null);
    expect(getNodeChildCount(parent)).toBe(0);
  });

  it('getNodeRoot traverses to the top ancestor', () => {
    const root = createNode3D();
    const mid = createNode3D();
    const leaf = createNode3D();
    addNodeChild(root, mid);
    addNodeChild(mid, leaf);
    expect(getNodeRoot(leaf)).toBe(root);
    expect(getNodeRoot(mid)).toBe(root);
    expect(getNodeRoot(root)).toBe(root);
  });

  it('throws when adding a node as its own child', () => {
    const node = createNode3D();
    expect(() => addNodeChild(node, node)).toThrow(TypeError);
  });
});

describe('worldTransform', () => {
  it('worldMatrix equals localMatrix for a root node', () => {
    const node = createTransformNode();
    node.position.x = 10;
    node.position.y = 20;
    node.position.z = 30;
    invalidateNodeLocalTransform(node);

    const world = getNodeWorldMatrix4(node);
    expect(world.m[12]).toBe(10);
    expect(world.m[13]).toBe(20);
    expect(world.m[14]).toBe(30);
  });

  it('world matrix is parent * local for a child node', () => {
    const parent = createTransformNode();
    const child = createTransformNode();
    addNodeChild(parent, child);

    parent.position.x = 5;
    invalidateNodeLocalTransform(parent);

    child.position.x = 3;
    invalidateNodeLocalTransform(child);

    const world = getNodeWorldMatrix4(child);
    expect(world.m[12]).toBeCloseTo(8);
  });

  it('world matrix is recomputed after localMatrix changes', () => {
    const node = createTransformNode();
    invalidateNodeLocalTransform(node);
    ensureNodeWorldMatrix4(node);
    const first = getNode3DRuntime(node).worldTransformId;

    node.position.x = 99;
    invalidateNodeLocalTransform(node);

    ensureNodeWorldMatrix4(node);
    const second = getNode3DRuntime(node).worldTransformId;

    expect(second).not.toBe(first);
  });

  it('world matrix is cached when nothing changes', () => {
    const node = createTransformNode();
    ensureNodeWorldMatrix4(node);
    const id1 = getNode3DRuntime(node).worldTransformId;
    ensureNodeWorldMatrix4(node);
    const id2 = getNode3DRuntime(node).worldTransformId;
    expect(id1).toBe(id2);
  });

  it('child world matrix updates when parent localMatrix changes', () => {
    const parent = createTransformNode();
    const child = createTransformNode();
    addNodeChild(parent, child);

    parent.position.x = 7;
    invalidateNodeLocalTransform(parent);

    const world = getNodeWorldMatrix4(child);
    expect(world.m[12]).toBeCloseTo(7);
  });
});
