import {
  composeMatrix4,
  createMatrix4,
  createQuaternion,
  createTransform3D,
  createVector3,
  multiplyMatrix4,
  setQuaternionFromAxisAngle,
} from '@flighthq/geometry';
import type { HasTransform3D, HasTransform3DRuntime, NodeRuntime, Transform3DNode, Vector3Like } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { initTransform3DRuntimeTrait, initTransform3DTrait } from './hasTransform3d';
import { addNodeChild, removeNodeChild } from './hierarchy';
import { createNode, getNodeRuntime } from './node';
import { invalidateNodeLocalTransform } from './revision';
import {
  convertNodeVector3GlobalToLocal,
  convertNodeVector3LocalToGlobal,
  ensureNodeLocalMatrix4,
  ensureNodeWorldMatrix4,
  getNodeLocalMatrix4,
  getNodeTransform3D,
  getNodeWorldMatrix4,
  isNodeLocalMatrix4Detached,
  setNodeLocalMatrix4,
  setNodeTransform3D,
  syncNodeTransform3DFromMatrix4,
} from './transform3d';

const TestNodeKind = 'TestNode';

interface TestTraits extends HasTransform3D {}
type TestNode = Transform3DNode<TestTraits>;

function createTestNode(): TestNode {
  const node = createNode<TestTraits>(TestNodeKind);
  initTransform3DTrait(node);
  initTransform3DRuntimeTrait(getNodeRuntime(node) as NodeRuntime<TestTraits> & HasTransform3DRuntime);
  return node as TestNode;
}

function setNodeTranslation(node: TestNode, x: number, y: number, z: number): void {
  node.position.x = x;
  node.position.y = y;
  node.position.z = z;
  invalidateNodeLocalTransform(node);
}

// Rotate about +Z so a child offset along +X swings toward +Y — an order-sensitive case pure
// translation cannot expose.
function setNodeRotationZ(node: TestNode, radians: number): void {
  setQuaternionFromAxisAngle(node.rotation, _zAxis, radians);
  invalidateNodeLocalTransform(node);
}

function setNodeScale(node: TestNode, x: number, y: number, z: number): void {
  node.scale.x = x;
  node.scale.y = y;
  node.scale.z = z;
  invalidateNodeLocalTransform(node);
}

const _zAxis = { x: 0, y: 0, z: 1 } as Vector3Like;

function translationMatrix(x: number, y: number, z: number) {
  const m = createMatrix4();
  m.m[12] = x;
  m.m[13] = y;
  m.m[14] = z;
  return m;
}

function vec(): Vector3Like {
  return { x: 0, y: 0, z: 0 } as Vector3Like;
}

describe('convertNodeVector3GlobalToLocal', () => {
  it('returns the point unchanged for an identity root node', () => {
    const node = createTestNode();
    const out = vec();
    convertNodeVector3GlobalToLocal(out, node, { x: 4, y: 5, z: 6 } as Vector3Like);
    expect(out.x).toBeCloseTo(4);
    expect(out.y).toBeCloseTo(5);
    expect(out.z).toBeCloseTo(6);
  });

  it('inverts the node translation', () => {
    const node = createTestNode();
    setNodeTranslation(node, 10, 20, 30);
    const out = vec();
    convertNodeVector3GlobalToLocal(out, node, { x: 11, y: 21, z: 31 } as Vector3Like);
    expect(out.x).toBeCloseTo(1);
    expect(out.y).toBeCloseTo(1);
    expect(out.z).toBeCloseTo(1);
  });
});

describe('convertNodeVector3LocalToGlobal', () => {
  it('applies the node translation to a local point', () => {
    const node = createTestNode();
    setNodeTranslation(node, 10, 20, 30);
    const out = vec();
    convertNodeVector3LocalToGlobal(out, node, { x: 1, y: 1, z: 1 } as Vector3Like);
    expect(out.x).toBeCloseTo(11);
    expect(out.y).toBeCloseTo(21);
    expect(out.z).toBeCloseTo(31);
  });

  it('composes parent and child translations', () => {
    const parent = createTestNode();
    const child = createTestNode();
    addNodeChild(parent, child);
    setNodeTranslation(parent, 5, 0, 0);
    setNodeTranslation(child, 3, 0, 0);
    const out = vec();
    convertNodeVector3LocalToGlobal(out, child, { x: 0, y: 0, z: 0 } as Vector3Like);
    expect(out.x).toBeCloseTo(8);
  });
});

describe('ensureNodeLocalMatrix4', () => {
  it('composes the local matrix from translation/rotation/scale', () => {
    const node = createTestNode();
    setNodeTranslation(node, 2, 3, 4);
    node.scale.x = 5;
    invalidateNodeLocalTransform(node);
    ensureNodeLocalMatrix4(node);
    const m = getNodeLocalMatrix4(node);
    expect(m.m[0]).toBeCloseTo(5);
    expect(m.m[12]).toBeCloseTo(2);
    expect(m.m[13]).toBeCloseTo(3);
    expect(m.m[14]).toBeCloseTo(4);
  });
});

describe('ensureNodeWorldMatrix4', () => {
  it('computes the world matrix for a root node', () => {
    const node = createTestNode();
    setNodeTranslation(node, 5, 0, 0);
    ensureNodeWorldMatrix4(node);
    const runtime = getNodeRuntime(node) as NodeRuntime<TestTraits> & HasTransform3DRuntime;
    expect(runtime.worldMatrix4).not.toBeNull();
    expect(runtime.worldMatrix4!.m[12]).toBeCloseTo(5);
  });

  it('reuses a cached world matrix when no invalidation has occurred', () => {
    const node = createTestNode();
    ensureNodeWorldMatrix4(node);
    const runtime = getNodeRuntime(node) as NodeRuntime<TestTraits> & HasTransform3DRuntime;
    const first = runtime.worldMatrix4;
    ensureNodeWorldMatrix4(node);
    expect(runtime.worldMatrix4).toBe(first);
  });

  it('propagates a mid-chain parent change down to an already-cached grandchild', () => {
    const root = createTestNode();
    const parent = createTestNode();
    const child = createTestNode();
    addNodeChild(root, parent);
    addNodeChild(parent, child);
    setNodeTranslation(root, 1, 0, 0);
    setNodeTranslation(parent, 2, 0, 0);
    setNodeTranslation(child, 3, 0, 0);
    expect(getNodeWorldMatrix4(child).m[12]).toBeCloseTo(6);
    // Mutating the middle node must invalidate the grandchild's cached world through the chain.
    setNodeTranslation(parent, 20, 0, 0);
    expect(getNodeWorldMatrix4(child).m[12]).toBeCloseTo(24);
  });
});

describe('getNodeLocalMatrix4', () => {
  it('reflects the authored translation', () => {
    const node = createTestNode();
    setNodeTranslation(node, 3, 0, 0);
    expect(getNodeLocalMatrix4(node).m[12]).toBeCloseTo(3);
  });
});

describe('getNodeTransform3D', () => {
  it('reads the node TRS fields into a carrier', () => {
    const node = createTestNode();
    setNodeTranslation(node, 1, 2, 3);
    node.scale.y = 4;
    const out = createTransform3D();
    getNodeTransform3D(out, node);
    expect(out.position).toMatchObject({ x: 1, y: 2, z: 3 });
    expect(out.scale.y).toBeCloseTo(4);
  });
});

describe('getNodeWorldMatrix4', () => {
  it('composes parent and child local matrices', () => {
    const parent = createTestNode();
    const child = createTestNode();
    addNodeChild(parent, child);
    setNodeTranslation(parent, 10, 0, 0);
    setNodeTranslation(child, 5, 0, 0);
    expect(getNodeWorldMatrix4(child).m[12]).toBeCloseTo(15);
  });

  it('updates when the parent transform changes', () => {
    const parent = createTestNode();
    const child = createTestNode();
    addNodeChild(parent, child);
    getNodeWorldMatrix4(child);
    setNodeTranslation(parent, 7, 0, 0);
    expect(getNodeWorldMatrix4(child).m[12]).toBeCloseTo(7);
  });

  it('rotates a child offset by the parent rotation (world = parentWorld × local)', () => {
    const parent = createTestNode();
    const child = createTestNode();
    addNodeChild(parent, child);
    setNodeRotationZ(parent, Math.PI / 2); // +90° about +Z maps +X -> +Y
    setNodeTranslation(child, 1, 0, 0);
    // The child sits at local +X; under the parent's rotation its world position swings to +Y.
    // A reversed multiply order (local × parentWorld) would instead leave it at +X — this pins the order.
    const world = getNodeWorldMatrix4(child);
    expect(world.m[12]).toBeCloseTo(0);
    expect(world.m[13]).toBeCloseTo(1);
    expect(world.m[14]).toBeCloseTo(0);
  });

  it('composes parent translation after rotation onto a child offset', () => {
    const parent = createTestNode();
    const child = createTestNode();
    addNodeChild(parent, child);
    setNodeTranslation(parent, 10, 0, 0);
    setNodeRotationZ(parent, Math.PI / 2);
    setNodeTranslation(child, 1, 0, 0);
    // parentWorld = T(10)·R(90°); child offset (1,0,0) rotates to (0,1,0) then translates to (10,1,0).
    const world = getNodeWorldMatrix4(child);
    expect(world.m[12]).toBeCloseTo(10);
    expect(world.m[13]).toBeCloseTo(1);
    expect(world.m[14]).toBeCloseTo(0);
  });

  it('scales a child offset and scale by the parent scale', () => {
    const parent = createTestNode();
    const child = createTestNode();
    addNodeChild(parent, child);
    setNodeScale(parent, 2, 2, 2);
    setNodeTranslation(child, 3, 0, 0);
    const world = getNodeWorldMatrix4(child);
    expect(world.m[12]).toBeCloseTo(6); // parent scale multiplies the child's position
    expect(world.m[0]).toBeCloseTo(2); // and its scale
  });

  it('composes a three-level translation/rotation/scale chain', () => {
    const root = createTestNode();
    const parent = createTestNode();
    const child = createTestNode();
    addNodeChild(root, parent);
    addNodeChild(parent, child);

    setNodeTranslation(root, 1, 2, 3);
    setNodeRotationZ(root, Math.PI / 6);
    setNodeScale(root, 2, 2, 2);
    setNodeTranslation(parent, 4, 0, 0);
    setNodeRotationZ(parent, Math.PI / 4);
    setNodeTranslation(child, 0, 5, 0);
    setNodeScale(child, 3, 1, 1);

    // Oracle: world = local(root) × local(parent) × local(child), built from the same geometry
    // primitives the implementation composes, so the test pins the wiring and order, not the math.
    const localRoot = createMatrix4();
    composeMatrix4(localRoot, root.position, root.rotation, root.scale);
    const localParent = createMatrix4();
    composeMatrix4(localParent, parent.position, parent.rotation, parent.scale);
    const localChild = createMatrix4();
    composeMatrix4(localChild, child.position, child.rotation, child.scale);
    const rootTimesParent = createMatrix4();
    multiplyMatrix4(rootTimesParent, localRoot, localParent);
    const expected = createMatrix4();
    multiplyMatrix4(expected, rootTimesParent, localChild);

    const world = getNodeWorldMatrix4(child);
    for (let i = 0; i < 16; i++) {
      expect(world.m[i]).toBeCloseTo(expected.m[i]);
    }
  });

  it('propagates a grandparent change through an unchanged middle node to a grandchild', () => {
    const root = createTestNode();
    const mid = createTestNode();
    const leaf = createTestNode();
    addNodeChild(root, mid);
    addNodeChild(mid, leaf);
    setNodeTranslation(root, 1, 0, 0);
    setNodeTranslation(leaf, 2, 0, 0);
    // Prime the grandchild's cached world (root 1 + leaf 2 = 3), then move only the grandparent.
    expect(getNodeWorldMatrix4(leaf).m[12]).toBeCloseTo(3);
    setNodeTranslation(root, 100, 0, 0);
    // The middle node does not change locally, but its world moves — the grandchild must follow.
    expect(getNodeWorldMatrix4(leaf).m[12]).toBeCloseTo(102);
  });

  it('recomputes the world matrix after reparenting to a different parent', () => {
    const parentA = createTestNode();
    const parentB = createTestNode();
    const child = createTestNode();
    setNodeTranslation(parentA, 10, 0, 0);
    setNodeTranslation(parentB, 0, 20, 0);
    setNodeTranslation(child, 1, 0, 0);

    addNodeChild(parentA, child);
    expect(getNodeWorldMatrix4(child).m[12]).toBeCloseTo(11);
    expect(getNodeWorldMatrix4(child).m[13]).toBeCloseTo(0);

    // parentA and parentB carry the same local revision, so their composite worldTransformId
    // collides; correct reparenting relies on invalidateNodeParentReference, not the id compare.
    removeNodeChild(parentA, child);
    addNodeChild(parentB, child);
    const world = getNodeWorldMatrix4(child);
    expect(world.m[12]).toBeCloseTo(1);
    expect(world.m[13]).toBeCloseTo(20);
  });
});

describe('isNodeLocalMatrix4Detached', () => {
  it('is false for a TRS-authored node and true after a direct matrix set', () => {
    const node = createTestNode();
    setNodeTranslation(node, 1, 0, 0);
    getNodeLocalMatrix4(node);
    expect(isNodeLocalMatrix4Detached(node)).toBe(false);
    setNodeLocalMatrix4(node, translationMatrix(9, 0, 0));
    expect(isNodeLocalMatrix4Detached(node)).toBe(true);
  });
});

describe('setNodeLocalMatrix4', () => {
  it('sets the matrix directly and survives the local recompute', () => {
    const node = createTestNode();
    setNodeLocalMatrix4(node, translationMatrix(9, 8, 7));
    // ensure must NOT recompose from the (dormant) TRS fields.
    ensureNodeLocalMatrix4(node);
    const m = getNodeLocalMatrix4(node);
    expect(m.m[12]).toBeCloseTo(9);
    expect(m.m[13]).toBeCloseTo(8);
    expect(m.m[14]).toBeCloseTo(7);
  });

  it('propagates to the world matrix', () => {
    const parent = createTestNode();
    const child = createTestNode();
    addNodeChild(parent, child);
    setNodeLocalMatrix4(parent, translationMatrix(4, 0, 0));
    setNodeLocalMatrix4(child, translationMatrix(3, 0, 0));
    expect(getNodeWorldMatrix4(child).m[12]).toBeCloseTo(7);
  });

  it('is overridden when a TRS write reclaims authority (last writer wins)', () => {
    const node = createTestNode();
    setNodeLocalMatrix4(node, translationMatrix(9, 0, 0));
    setNodeTranslation(node, 2, 0, 0);
    expect(isNodeLocalMatrix4Detached(node)).toBe(false);
    expect(getNodeLocalMatrix4(node).m[12]).toBeCloseTo(2);
  });

  it('copies the source matrix rather than aliasing it', () => {
    const node = createTestNode();
    const source = translationMatrix(5, 0, 0);
    setNodeLocalMatrix4(node, source);
    source.m[12] = 999;
    expect(getNodeLocalMatrix4(node).m[12]).toBeCloseTo(5);
  });
});

describe('setNodeTransform3D', () => {
  it('copies carrier TRS and rebuilds the matrix', () => {
    const node = createTestNode();
    const t = createTransform3D();
    t.position = createVector3(6, 0, 0);
    t.scale = createVector3(2, 2, 2);
    setNodeTransform3D(node, t);
    const m = getNodeLocalMatrix4(node);
    expect(m.m[0]).toBeCloseTo(2);
    expect(m.m[12]).toBeCloseTo(6);
  });
});

describe('syncNodeTransform3DFromMatrix4', () => {
  it('decomposes a directly-set matrix back into the TRS fields and clears detached', () => {
    const node = createTestNode();
    setNodeLocalMatrix4(node, translationMatrix(3, 4, 5));
    syncNodeTransform3DFromMatrix4(node);
    expect(isNodeLocalMatrix4Detached(node)).toBe(false);
    expect(node.position.x).toBeCloseTo(3);
    expect(node.position.y).toBeCloseTo(4);
    expect(node.position.z).toBeCloseTo(5);
  });

  it('is non-destructive: the matrix cache is unchanged', () => {
    const node = createTestNode();
    node.rotation = createQuaternion();
    setNodeLocalMatrix4(node, translationMatrix(3, 4, 5));
    syncNodeTransform3DFromMatrix4(node);
    const m = getNodeLocalMatrix4(node);
    expect(m.m[12]).toBeCloseTo(3);
    expect(m.m[13]).toBeCloseTo(4);
    expect(m.m[14]).toBeCloseTo(5);
  });
});
