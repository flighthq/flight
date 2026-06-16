import { setMatrix4Identity } from '@flighthq/geometry';
import type { HasTransform3D, HasTransform3DRuntime, NodeRuntime, Transform3DNode, Vector3Like } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { initTransform3DRuntimeTrait, initTransform3DTrait } from './hasTransform3d';
import { addNodeChild } from './hierarchy';
import { createNode, getNodeRuntime } from './node';
import { invalidateNodeLocalTransform } from './revision';
import {
  convertNodeVector3GlobalToLocal,
  convertNodeVector3LocalToGlobal,
  ensureNodeWorldTransformMatrix4,
  getNodeWorldTransformMatrix4,
} from './transform3d';

const TestNodeKind: unique symbol = Symbol('TestNode');

interface TestTraits extends HasTransform3D {}
type TestNode = Transform3DNode<TestTraits>;

function createTestNode(): TestNode {
  const node = createNode<TestTraits>(TestNodeKind);
  initTransform3DTrait(node);
  initTransform3DRuntimeTrait(getNodeRuntime(node) as NodeRuntime<TestTraits> & HasTransform3DRuntime);
  return node as TestNode;
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
    node.localMatrix.m[12] = 10;
    node.localMatrix.m[13] = 20;
    node.localMatrix.m[14] = 30;
    invalidateNodeLocalTransform(node);

    const out = vec();
    convertNodeVector3GlobalToLocal(out, node, { x: 11, y: 21, z: 31 } as Vector3Like);
    expect(out.x).toBeCloseTo(1);
    expect(out.y).toBeCloseTo(1);
    expect(out.z).toBeCloseTo(1);
  });

  it('round-trips with convertNodeVector3LocalToGlobal', () => {
    const parent = createTestNode();
    const child = createTestNode();
    addNodeChild(parent, child);

    parent.localMatrix.m[12] = 7;
    parent.localMatrix.m[13] = -2;
    invalidateNodeLocalTransform(parent);
    child.localMatrix.m[14] = 4;
    invalidateNodeLocalTransform(child);

    const local = { x: 1.5, y: 2.5, z: 3.5 } as Vector3Like;
    const world = vec();
    convertNodeVector3LocalToGlobal(world, child, local);

    const back = vec();
    convertNodeVector3GlobalToLocal(back, child, world);
    expect(back.x).toBeCloseTo(local.x);
    expect(back.y).toBeCloseTo(local.y);
    expect(back.z).toBeCloseTo(local.z);
  });
});

describe('convertNodeVector3LocalToGlobal', () => {
  it('returns the point unchanged for an identity root node', () => {
    const node = createTestNode();
    const out = vec();
    convertNodeVector3LocalToGlobal(out, node, { x: 1, y: 2, z: 3 } as Vector3Like);
    expect(out.x).toBeCloseTo(1);
    expect(out.y).toBeCloseTo(2);
    expect(out.z).toBeCloseTo(3);
  });

  it('applies the node translation to a local point', () => {
    const node = createTestNode();
    node.localMatrix.m[12] = 10;
    node.localMatrix.m[13] = 20;
    node.localMatrix.m[14] = 30;
    invalidateNodeLocalTransform(node);

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

    parent.localMatrix.m[12] = 5;
    invalidateNodeLocalTransform(parent);
    child.localMatrix.m[12] = 3;
    invalidateNodeLocalTransform(child);

    const out = vec();
    convertNodeVector3LocalToGlobal(out, child, { x: 0, y: 0, z: 0 } as Vector3Like);
    expect(out.x).toBeCloseTo(8);
  });
});

describe('ensureNodeWorldTransformMatrix4', () => {
  it('computes the world matrix for a root node', () => {
    const node = createTestNode();
    node.localMatrix.m[12] = 5;
    invalidateNodeLocalTransform(node);
    ensureNodeWorldTransformMatrix4(node);
    const runtime = getNodeRuntime(node) as NodeRuntime<TestTraits> & HasTransform3DRuntime;
    expect(runtime.worldMatrix).not.toBeNull();
    expect(runtime.worldMatrix!.m[12]).toBeCloseTo(5);
  });

  it('reuses a cached world matrix when no invalidation has occurred', () => {
    const node = createTestNode();
    ensureNodeWorldTransformMatrix4(node);
    const runtime = getNodeRuntime(node) as NodeRuntime<TestTraits> & HasTransform3DRuntime;
    const first = runtime.worldMatrix;
    ensureNodeWorldTransformMatrix4(node);
    expect(runtime.worldMatrix).toBe(first);
  });
});

describe('getNodeWorldTransformMatrix4', () => {
  it('returns the world matrix for a node', () => {
    const node = createTestNode();
    node.localMatrix.m[12] = 3;
    invalidateNodeLocalTransform(node);
    const m = getNodeWorldTransformMatrix4(node);
    expect(m.m[12]).toBeCloseTo(3);
  });

  it('composes parent and child local matrices', () => {
    const parent = createTestNode();
    const child = createTestNode();
    addNodeChild(parent, child);
    parent.localMatrix.m[12] = 10;
    invalidateNodeLocalTransform(parent);
    child.localMatrix.m[12] = 5;
    invalidateNodeLocalTransform(child);
    const m = getNodeWorldTransformMatrix4(child);
    expect(m.m[12]).toBeCloseTo(15);
  });

  it('world matrix is recomputed after localMatrix changes', () => {
    const node = createTestNode();
    invalidateNodeLocalTransform(node);
    ensureNodeWorldTransformMatrix4(node);
    const runtime = getNodeRuntime(node) as NodeRuntime<TestTraits> & HasTransform3DRuntime;
    const first = runtime.worldTransformID;

    node.localMatrix.m[12] = 99;
    invalidateNodeLocalTransform(node);
    ensureNodeWorldTransformMatrix4(node);
    const second = runtime.worldTransformID;

    expect(second).not.toBe(first);
  });

  it('world matrix is cached when nothing changes', () => {
    const node = createTestNode();
    ensureNodeWorldTransformMatrix4(node);
    const runtime = getNodeRuntime(node) as NodeRuntime<TestTraits> & HasTransform3DRuntime;
    const id1 = runtime.worldTransformID;
    ensureNodeWorldTransformMatrix4(node);
    const id2 = runtime.worldTransformID;
    expect(id1).toBe(id2);
  });

  it('child world matrix updates when parent localMatrix changes', () => {
    const parent = createTestNode();
    const child = createTestNode();
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
