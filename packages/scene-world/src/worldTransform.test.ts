import type { HasTransform3DRuntime, Vector3Like, WorldTransform3DNode } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { initTransform3DRuntimeTrait, initTransform3DTrait } from './hasTransform3d';
import { addWorldChild } from './worldHierarchy';
import { createWorldNode, getWorldNodeRuntime, invalidateLocalTransform, type WorldNodeRuntime } from './worldNode';
import { worldGlobalToLocal, worldLocalToGlobal } from './worldTransform';

function createTransformNode(): WorldTransform3DNode {
  const node = createWorldNode() as WorldTransform3DNode;
  initTransform3DTrait(node);
  initTransform3DRuntimeTrait(getWorldNodeRuntime(node) as WorldNodeRuntime & HasTransform3DRuntime);
  return node;
}

function vec(): Vector3Like {
  return { x: 0, y: 0, z: 0 } as Vector3Like;
}

describe('worldGlobalToLocal', () => {
  it('returns the point unchanged for an identity root node', () => {
    const node = createTransformNode();
    const out = vec();
    worldGlobalToLocal(out, node, { x: 4, y: 5, z: 6 } as Vector3Like);
    expect(out.x).toBeCloseTo(4);
    expect(out.y).toBeCloseTo(5);
    expect(out.z).toBeCloseTo(6);
  });

  it('inverts the node translation', () => {
    const node = createTransformNode();
    node.localMatrix.m[12] = 10;
    node.localMatrix.m[13] = 20;
    node.localMatrix.m[14] = 30;
    invalidateLocalTransform(node);

    const out = vec();
    worldGlobalToLocal(out, node, { x: 11, y: 21, z: 31 } as Vector3Like);
    expect(out.x).toBeCloseTo(1);
    expect(out.y).toBeCloseTo(1);
    expect(out.z).toBeCloseTo(1);
  });

  it('round-trips with worldLocalToGlobal', () => {
    const parent = createTransformNode();
    const child = createTransformNode();
    addWorldChild(parent, child);

    parent.localMatrix.m[12] = 7;
    parent.localMatrix.m[13] = -2;
    invalidateLocalTransform(parent);
    child.localMatrix.m[14] = 4;
    invalidateLocalTransform(child);

    const local = { x: 1.5, y: 2.5, z: 3.5 } as Vector3Like;
    const world = vec();
    worldLocalToGlobal(world, child, local);

    const back = vec();
    worldGlobalToLocal(back, child, world);
    expect(back.x).toBeCloseTo(local.x);
    expect(back.y).toBeCloseTo(local.y);
    expect(back.z).toBeCloseTo(local.z);
  });
});

describe('worldLocalToGlobal', () => {
  it('returns the point unchanged for an identity root node', () => {
    const node = createTransformNode();
    const out = vec();
    worldLocalToGlobal(out, node, { x: 1, y: 2, z: 3 } as Vector3Like);
    expect(out.x).toBeCloseTo(1);
    expect(out.y).toBeCloseTo(2);
    expect(out.z).toBeCloseTo(3);
  });

  it('applies the node translation to a local point', () => {
    const node = createTransformNode();
    node.localMatrix.m[12] = 10;
    node.localMatrix.m[13] = 20;
    node.localMatrix.m[14] = 30;
    invalidateLocalTransform(node);

    const out = vec();
    worldLocalToGlobal(out, node, { x: 1, y: 1, z: 1 } as Vector3Like);
    expect(out.x).toBeCloseTo(11);
    expect(out.y).toBeCloseTo(21);
    expect(out.z).toBeCloseTo(31);
  });

  it('composes parent and child translations', () => {
    const parent = createTransformNode();
    const child = createTransformNode();
    addWorldChild(parent, child);

    parent.localMatrix.m[12] = 5;
    invalidateLocalTransform(parent);
    child.localMatrix.m[12] = 3;
    invalidateLocalTransform(child);

    const out = vec();
    worldLocalToGlobal(out, child, { x: 0, y: 0, z: 0 } as Vector3Like);
    expect(out.x).toBeCloseTo(8);
  });
});
