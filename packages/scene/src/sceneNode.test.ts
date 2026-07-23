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
} from '@flighthq/node';
import type { Matrix4, SceneNode } from '@flighthq/types';
import type { SceneNodeRuntime } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import {
  createSceneNode,
  createSceneNodeRuntime,
  enableSceneNodeSignals,
  getSceneNodeRuntime,
  getSceneNodeSignals,
  SceneNodeKind,
} from './sceneNode';

function createTransformNode(): SceneNode {
  const node = createSceneNode();
  initTransform3DTrait(node);
  initTransform3DRuntimeTrait(getSceneNodeRuntime(node));
  return node;
}

describe('createSceneNode', () => {
  it('uses SceneNodeKind by default', () => {
    const node = createSceneNode();
    expect(node.kind).toBe(SceneNodeKind);
  });

  it('accepts a custom kind', () => {
    const MyKind = 'MyKind';
    const node = createSceneNode(MyKind);
    expect(node.kind).toBe(MyKind);
  });

  it('defaults enabled to true and name to null', () => {
    const node = createSceneNode();
    expect(node.enabled).toBe(true);
    expect(node.name).toBe(null);
  });

  it('accepts partial initial values', () => {
    const node = createSceneNode(SceneNodeKind, { enabled: false, name: 'root' });
    expect(node.enabled).toBe(false);
    expect(node.name).toBe('root');
  });

  it('defaults alpha to 1 (fully opaque)', () => {
    expect(createSceneNode().alpha).toBe(1);
  });

  it('accepts an initial alpha', () => {
    expect(createSceneNode(SceneNodeKind, { alpha: 0.4 }).alpha).toBeCloseTo(0.4);
  });
});

describe('createSceneNodeRuntime', () => {
  it('initializes transform bookkeeping ids', () => {
    const runtime = createSceneNodeRuntime();
    expect(runtime.localTransformId).toBe(0);
    expect(runtime.worldTransformId).toBe(0);
    expect(runtime.worldTransformUsingLocalTransformId).toBe(-1);
    expect(runtime.worldTransformUsingParentTransformId).toBe(-1);
  });

  it('initializes worldMatrix to null', () => {
    const runtime = createSceneNodeRuntime();
    expect(runtime.worldMatrix4).toBeNull();
  });

  it('initializes worldAlpha to null (unresolved until prepared)', () => {
    expect(createSceneNodeRuntime().worldAlpha).toBeNull();
  });
});

describe('enableSceneNodeSignals', () => {
  it('creates and returns the signal bag on first call', () => {
    const node = createSceneNode();
    const signals = enableSceneNodeSignals(node);
    expect(signals.onChildAdded).toBeDefined();
    expect(signals.onParentChanged).toBeDefined();
  });

  it('returns the same object on subsequent calls', () => {
    const node = createSceneNode();
    expect(enableSceneNodeSignals(node)).toBe(enableSceneNodeSignals(node));
  });

  it('stores the signals on the runtime nodeSignals slot', () => {
    const node = createSceneNode();
    const signals = enableSceneNodeSignals(node);
    expect(getSceneNodeRuntime(node).nodeSignals).toBe(signals);
  });
});

describe('getSceneNodeRuntime', () => {
  it('returns a runtime with the expected initial state', () => {
    const node = createSceneNode();
    const runtime = getSceneNodeRuntime(node);
    expect(runtime.children).toBeNull();
    expect(runtime.parent).toBeNull();
  });
});

describe('getSceneNodeSignals', () => {
  it('returns null before signals are enabled', () => {
    const node = createSceneNode();
    expect(getSceneNodeSignals(node)).toBeNull();
  });

  it('returns the runtime nodeSignals after enableSceneNodeSignals', () => {
    const node = createSceneNode();
    const signals = enableSceneNodeSignals(node);
    expect(getSceneNodeSignals(node)).toBe(signals);
    expect(getSceneNodeSignals(node)).toBe(getSceneNodeRuntime(node).nodeSignals);
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
    const node = createSceneNode();
    const existing = { m: new Float32Array(16) } as unknown as Matrix4;
    existing.m[12] = 42;
    setNodeLocalMatrix4(node, existing);
    expect(getNodeLocalMatrix4(node).m[12]).toBe(42);
  });
});

describe('invalidateNodeLocalTransform', () => {
  it('increments the local transform id', () => {
    const node = createSceneNode();
    const before = getSceneNodeRuntime(node).localTransformId;
    invalidateNodeLocalTransform(node);
    expect(getSceneNodeRuntime(node).localTransformId).toBe(before + 1);
  });
});

describe('invalidateNodeParentReference', () => {
  it('resets the cached parent transform id so the world matrix recomputes', () => {
    const node = createSceneNode();
    getSceneNodeRuntime(node).worldTransformUsingParentTransformId = 5;
    invalidateNodeParentReference(node);
    expect(getSceneNodeRuntime(node).worldTransformUsingParentTransformId).toBe(-1);
  });
});

describe('SceneNodeRuntime', () => {
  it('starts with no parent, no children, and null worldMatrix', () => {
    const node = createTransformNode();
    const runtime = getSceneNodeRuntime(node) as SceneNodeRuntime;
    expect(runtime.parent).toBe(null);
    expect(runtime.children).toBe(null);
    expect(runtime.worldMatrix4).toBe(null);
  });
});

describe('worldHierarchy', () => {
  it('addNodeChild links parent and child', () => {
    const parent = createSceneNode();
    const child = createSceneNode();
    addNodeChild(parent, child);
    expect(getNodeParent(child)).toBe(parent);
    expect(getNodeChildCount(parent)).toBe(1);
  });

  it('reparents a child from one node to another', () => {
    const a = createSceneNode();
    const b = createSceneNode();
    const child = createSceneNode();
    addNodeChild(a, child);
    addNodeChild(b, child);
    expect(getNodeParent(child)).toBe(b);
    expect(getNodeChildCount(a)).toBe(0);
    expect(getNodeChildCount(b)).toBe(1);
  });

  it('removeNodeChild unlinks parent and child', () => {
    const parent = createSceneNode();
    const child = createSceneNode();
    addNodeChild(parent, child);
    removeNodeChild(parent, child);
    expect(getNodeParent(child)).toBe(null);
    expect(getNodeChildCount(parent)).toBe(0);
  });

  it('getNodeRoot traverses to the top ancestor', () => {
    const root = createSceneNode();
    const mid = createSceneNode();
    const leaf = createSceneNode();
    addNodeChild(root, mid);
    addNodeChild(mid, leaf);
    expect(getNodeRoot(leaf)).toBe(root);
    expect(getNodeRoot(mid)).toBe(root);
    expect(getNodeRoot(root)).toBe(root);
  });

  it('throws when adding a node as its own child', () => {
    const node = createSceneNode();
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
    const first = getSceneNodeRuntime(node).worldTransformId;

    node.position.x = 99;
    invalidateNodeLocalTransform(node);

    ensureNodeWorldMatrix4(node);
    const second = getSceneNodeRuntime(node).worldTransformId;

    expect(second).not.toBe(first);
  });

  it('world matrix is cached when nothing changes', () => {
    const node = createTransformNode();
    ensureNodeWorldMatrix4(node);
    const id1 = getSceneNodeRuntime(node).worldTransformId;
    ensureNodeWorldMatrix4(node);
    const id2 = getSceneNodeRuntime(node).worldTransformId;
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
