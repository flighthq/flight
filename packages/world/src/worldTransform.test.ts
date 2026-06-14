import type { HasTransform3DRuntime, Vector3Like, WorldTransform3DNode } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { initTransform3DRuntimeTrait, initTransform3DTrait } from './hasTransform3d';
import { addWorldChild } from './worldHierarchy';
import { createWorldNode, getWorldNodeRuntime, invalidateNodeLocalTransform, type WorldNodeRuntime } from './worldNode';
import {
  ensureWorldTransformMatrix,
  getWorldTransformMatrix,
  worldGlobalToLocalVector3,
  worldLocalToGlobalVector3,
} from './worldTransform';

function createTransformNode(): WorldTransform3DNode {
  const node = createWorldNode() as WorldTransform3DNode;
  initTransform3DTrait(node);
  initTransform3DRuntimeTrait(getWorldNodeRuntime(node) as WorldNodeRuntime & HasTransform3DRuntime);
  return node;
}

function vec(): Vector3Like {
  return { x: 0, y: 0, z: 0 } as Vector3Like;
}

describe('ensureWorldTransformMatrix', () => {
  it('computes the world matrix for a root node', () => {
    const node = createTransformNode();
    node.localMatrix.m[12] = 5;
    invalidateNodeLocalTransform(node);
    ensureWorldTransformMatrix(node);
    const runtime = getWorldNodeRuntime(node) as WorldNodeRuntime & HasTransform3DRuntime;
    expect(runtime.worldMatrix).not.toBeNull();
    expect(runtime.worldMatrix!.m[12]).toBeCloseTo(5);
  });

  it('reuses a cached world matrix when no invalidation has occurred', () => {
    const node = createTransformNode();
    ensureWorldTransformMatrix(node);
    const runtime = getWorldNodeRuntime(node) as WorldNodeRuntime & HasTransform3DRuntime;
    const first = runtime.worldMatrix;
    ensureWorldTransformMatrix(node);
    expect(runtime.worldMatrix).toBe(first);
  });
});

describe('getWorldTransformMatrix', () => {
  it('returns the world matrix for a node', () => {
    const node = createTransformNode();
    node.localMatrix.m[12] = 3;
    invalidateNodeLocalTransform(node);
    const m = getWorldTransformMatrix(node);
    expect(m.m[12]).toBeCloseTo(3);
  });

  it('composes parent and child local matrices', () => {
    const parent = createTransformNode();
    const child = createTransformNode();
    addWorldChild(parent, child);
    parent.localMatrix.m[12] = 10;
    invalidateNodeLocalTransform(parent);
    child.localMatrix.m[12] = 5;
    invalidateNodeLocalTransform(child);
    const m = getWorldTransformMatrix(child);
    expect(m.m[12]).toBeCloseTo(15);
  });
});

describe('worldGlobalToLocalVector3', () => {
  it('returns the point unchanged for an identity root node', () => {
    const node = createTransformNode();
    const out = vec();
    worldGlobalToLocalVector3(out, node, { x: 4, y: 5, z: 6 } as Vector3Like);
    expect(out.x).toBeCloseTo(4);
    expect(out.y).toBeCloseTo(5);
    expect(out.z).toBeCloseTo(6);
  });

  it('inverts the node translation', () => {
    const node = createTransformNode();
    node.localMatrix.m[12] = 10;
    node.localMatrix.m[13] = 20;
    node.localMatrix.m[14] = 30;
    invalidateNodeLocalTransform(node);

    const out = vec();
    worldGlobalToLocalVector3(out, node, { x: 11, y: 21, z: 31 } as Vector3Like);
    expect(out.x).toBeCloseTo(1);
    expect(out.y).toBeCloseTo(1);
    expect(out.z).toBeCloseTo(1);
  });

  it('round-trips with worldLocalToGlobalVector3', () => {
    const parent = createTransformNode();
    const child = createTransformNode();
    addWorldChild(parent, child);

    parent.localMatrix.m[12] = 7;
    parent.localMatrix.m[13] = -2;
    invalidateNodeLocalTransform(parent);
    child.localMatrix.m[14] = 4;
    invalidateNodeLocalTransform(child);

    const local = { x: 1.5, y: 2.5, z: 3.5 } as Vector3Like;
    const world = vec();
    worldLocalToGlobalVector3(world, child, local);

    const back = vec();
    worldGlobalToLocalVector3(back, child, world);
    expect(back.x).toBeCloseTo(local.x);
    expect(back.y).toBeCloseTo(local.y);
    expect(back.z).toBeCloseTo(local.z);
  });
});

describe('worldLocalToGlobalVector3', () => {
  it('returns the point unchanged for an identity root node', () => {
    const node = createTransformNode();
    const out = vec();
    worldLocalToGlobalVector3(out, node, { x: 1, y: 2, z: 3 } as Vector3Like);
    expect(out.x).toBeCloseTo(1);
    expect(out.y).toBeCloseTo(2);
    expect(out.z).toBeCloseTo(3);
  });

  it('applies the node translation to a local point', () => {
    const node = createTransformNode();
    node.localMatrix.m[12] = 10;
    node.localMatrix.m[13] = 20;
    node.localMatrix.m[14] = 30;
    invalidateNodeLocalTransform(node);

    const out = vec();
    worldLocalToGlobalVector3(out, node, { x: 1, y: 1, z: 1 } as Vector3Like);
    expect(out.x).toBeCloseTo(11);
    expect(out.y).toBeCloseTo(21);
    expect(out.z).toBeCloseTo(31);
  });

  it('composes parent and child translations', () => {
    const parent = createTransformNode();
    const child = createTransformNode();
    addWorldChild(parent, child);

    parent.localMatrix.m[12] = 5;
    invalidateNodeLocalTransform(parent);
    child.localMatrix.m[12] = 3;
    invalidateNodeLocalTransform(child);

    const out = vec();
    worldLocalToGlobalVector3(out, child, { x: 0, y: 0, z: 0 } as Vector3Like);
    expect(out.x).toBeCloseTo(8);
  });
});
