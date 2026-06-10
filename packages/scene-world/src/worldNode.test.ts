import { identityMatrix4 } from '@flighthq/geometry';
import type { HasTransform3DRuntime, Matrix4, WorldTransform3DNode } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { initTransform3DRuntimeTrait, initTransform3DTrait } from './hasTransform3d';
import { addWorldChild, getWorldNumChildren, getWorldParent, getWorldRoot, removeWorldChild } from './worldHierarchy';
import {
  createWorldNode,
  getWorldNodeRuntime,
  invalidateLocalTransform,
  WorldNodeKind,
  type WorldNodeRuntime,
} from './worldNode';
import { ensureWorldMatrix, getWorldMatrix } from './worldTransform';

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

describe('worldHierarchy', () => {
  it('addWorldChild links parent and child', () => {
    const parent = createWorldNode();
    const child = createWorldNode();
    addWorldChild(parent, child);
    expect(getWorldParent(child)).toBe(parent);
    expect(getWorldNumChildren(parent)).toBe(1);
  });

  it('reparents a child from one node to another', () => {
    const a = createWorldNode();
    const b = createWorldNode();
    const child = createWorldNode();
    addWorldChild(a, child);
    addWorldChild(b, child);
    expect(getWorldParent(child)).toBe(b);
    expect(getWorldNumChildren(a)).toBe(0);
    expect(getWorldNumChildren(b)).toBe(1);
  });

  it('removeWorldChild unlinks parent and child', () => {
    const parent = createWorldNode();
    const child = createWorldNode();
    addWorldChild(parent, child);
    removeWorldChild(parent, child);
    expect(getWorldParent(child)).toBe(null);
    expect(getWorldNumChildren(parent)).toBe(0);
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
    invalidateLocalTransform(node);

    const world = getWorldMatrix(node);
    expect(world.m[12]).toBe(10);
    expect(world.m[13]).toBe(20);
    expect(world.m[14]).toBe(30);
  });

  it('world matrix is parent * local for a child node', () => {
    const parent = createTransformNode();
    const child = createTransformNode();
    addWorldChild(parent, child);

    parent.localMatrix.m[12] = 5;
    invalidateLocalTransform(parent);

    child.localMatrix.m[12] = 3;
    invalidateLocalTransform(child);

    const world = getWorldMatrix(child);
    expect(world.m[12]).toBeCloseTo(8);
  });

  it('world matrix is recomputed after localMatrix changes', () => {
    const node = createTransformNode();
    invalidateLocalTransform(node);
    ensureWorldMatrix(node);
    const first = getWorldNodeRuntime(node).worldTransformID;

    node.localMatrix.m[12] = 99;
    invalidateLocalTransform(node);

    ensureWorldMatrix(node);
    const second = getWorldNodeRuntime(node).worldTransformID;

    expect(second).not.toBe(first);
  });

  it('world matrix is cached when nothing changes', () => {
    const node = createTransformNode();
    ensureWorldMatrix(node);
    const id1 = getWorldNodeRuntime(node).worldTransformID;
    ensureWorldMatrix(node);
    const id2 = getWorldNodeRuntime(node).worldTransformID;
    expect(id1).toBe(id2);
  });

  it('child world matrix updates when parent localMatrix changes', () => {
    const parent = createTransformNode();
    const child = createTransformNode();
    addWorldChild(parent, child);

    identityMatrix4(parent.localMatrix);
    identityMatrix4(child.localMatrix);
    invalidateLocalTransform(parent);
    invalidateLocalTransform(child);

    parent.localMatrix.m[12] = 7;
    invalidateLocalTransform(parent);

    const world = getWorldMatrix(child);
    expect(world.m[12]).toBeCloseTo(7);
  });
});
