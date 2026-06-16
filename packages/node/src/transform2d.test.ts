import { getEntityRuntime } from '@flighthq/entity';
import { cloneMatrix, createVector2, equalsMatrix, setMatrix } from '@flighthq/geometry';
import { addNodeChild, createNode } from '@flighthq/node';
import type { HasTransform2D, HasTransform2DRuntime, Matrix, Node, NodeRuntime } from '@flighthq/types';

import { initTransform2DRuntimeTrait, initTransform2DTrait } from './hasTransform2d';
import { invalidateNodeLocalTransform } from './revision';
import {
  convertNodeVector2GlobalToLocal,
  convertNodeVector2LocalToGlobal,
  ensureNodeLocalTransformMatrix,
  ensureNodeWorldTransformMatrix,
  getNodeLocalTransformMatrix,
  getNodeWorldTransformMatrix,
} from './transform2d';

function createTestNode(): TestNode {
  const node = createNode(TestKind) as TestNode;
  const runtime = getEntityRuntime(node);
  initTransform2DTrait(node);
  initTransform2DRuntimeTrait(runtime as HasTransform2DRuntime);
  return node;
}

let node: TestNode;
beforeEach(() => {
  node = createTestNode();
});

describe('convertNodeVector2GlobalToLocal', () => {
  let obj: TestNode;

  beforeEach(() => {
    obj = createTestNode();
    addNodeChild(createTestNode(), obj);
    obj.x = 10;
    obj.y = 20;
    obj.scaleX = 2;
    obj.scaleY = 2;
    obj.rotation = 0;
    invalidateNodeLocalTransform(obj);
  });

  it('writes into the provided output Vector2', () => {
    const out = createVector2();
    const world = createVector2(14, 24);

    convertNodeVector2GlobalToLocal(out, obj, world);

    expect(out.x).toBeCloseTo(2);
    expect(out.y).toBeCloseTo(2);
  });

  it('reuses the output object', () => {
    const out = createVector2(999, 999);
    convertNodeVector2GlobalToLocal(out, obj, createVector2(10, 20));

    expect(out).toEqual(expect.objectContaining({ x: 0, y: 0 }));
  });

  it('updates the world transform before conversion', () => {
    // const spy = vi.spyOn(obj, updateWorldTransform);
    // globalToLocal(createVector2(), obj, createVector2());
    // expect(spy).toHaveBeenCalled();
    // spy.mockRestore();
  });

  it('allows vector-like objects', () => {
    const out = { x: 0, y: 0 };
    const world = { x: 14, y: 24 };

    convertNodeVector2GlobalToLocal(out, obj, world);

    expect(out.x).toBeCloseTo(2);
    expect(out.y).toBeCloseTo(2);
  });
});

describe('convertNodeVector2LocalToGlobal', () => {
  let obj: TestNode;

  beforeEach(() => {
    obj = createTestNode();
  });

  it('writes to out parameter', () => {
    const local = createVector2(5, 5);
    const out = createVector2();

    convertNodeVector2LocalToGlobal(out, obj, local);

    expect(out.x).toBe(5);
    expect(out.y).toBe(5);
    expect(out).not.toBe(local); // out is a separate object
  });

  it('respects world transform', () => {
    obj.x = 50;
    obj.y = 30;
    invalidateNodeLocalTransform(obj);

    const local = createVector2(10, 20);
    const out = createVector2();

    convertNodeVector2LocalToGlobal(out, obj, local);

    expect(out.x).toBe(60); // 50 + 10
    expect(out.y).toBe(50); // 30 + 20
  });

  it('produces independent results from multiple points', () => {
    obj.x = 1;
    obj.y = 2;
    invalidateNodeLocalTransform(obj);

    const p1 = createVector2(1, 1);
    const p2 = createVector2(2, 2);

    const g1 = createVector2();
    convertNodeVector2LocalToGlobal(g1, obj, p1);
    const g2 = createVector2();
    convertNodeVector2LocalToGlobal(g2, obj, p2);

    expect(g1.x).toBe(2);
    expect(g1.y).toBe(3);
    expect(g2.x).toBe(3);
    expect(g2.y).toBe(4);
  });

  it('allows vector-like objects', () => {
    const local = { x: 5, y: 5 };
    const out = { x: 0, y: 0 };

    convertNodeVector2LocalToGlobal(out, obj, local);

    expect(out.x).toBe(5);
    expect(out.y).toBe(5);
    expect(out).not.toBe(local); // out is a separate object
  });
});

describe('ensureNodeLocalTransformMatrix', () => {
  it('computes local transform the first time', () => {
    const runtime = getEntityRuntime(node) as HasTransform2DRuntime;
    expect(runtime.localTransform2D).toBeNull();
    ensureNodeLocalTransformMatrix(node);
    expect(runtime.localTransform2D).not.toBeNull();
  });

  it('recomputes if the local transform ID has changed', () => {
    const runtime = getEntityRuntime(node) as NodeRuntime<HasTransform2D> & HasTransform2DRuntime;
    ensureNodeLocalTransformMatrix(node);
    const cache = cloneAndInvalidateMatrix(runtime.localTransform2D);
    runtime.localTransformID++;
    ensureNodeLocalTransformMatrix(node);
    expect(equalsMatrix(runtime.localTransform2D, cache)).toBe(true);
  });
});

describe('ensureNodeWorldTransformMatrix', () => {
  it('computes world transform the first time', () => {
    const runtime = getEntityRuntime(node) as NodeRuntime<HasTransform2D> & HasTransform2DRuntime;
    expect(runtime.worldTransform2D).toBeNull();
    ensureNodeWorldTransformMatrix(node);
    expect(runtime.worldTransform2D).not.toBeNull();
  });

  it('computes world transform for a parent for the first time', () => {
    const parent = createTestNode();
    addNodeChild(parent, node);
    const parentState = getEntityRuntime(node) as HasTransform2DRuntime;
    expect(parentState.worldTransform2D).toBeNull();
    ensureNodeWorldTransformMatrix(node);
    expect(parentState.worldTransform2D).not.toBeNull();
  });

  it('recomputes if the local transform ID has changed', () => {
    const runtime = getEntityRuntime(node) as NodeRuntime<HasTransform2D> & HasTransform2DRuntime;
    ensureNodeWorldTransformMatrix(node);
    const cache = cloneAndInvalidateMatrix(runtime.worldTransform2D);
    runtime.localTransformID++;
    ensureNodeWorldTransformMatrix(node);
    expect(equalsMatrix(runtime.worldTransform2D, cache)).toBe(true);
  });

  it('recomputes if the parent transform ID has changed', () => {
    const parent = createTestNode();
    addNodeChild(parent, node);
    const runtime = getEntityRuntime(node) as HasTransform2DRuntime;
    const parentState = getEntityRuntime(parent) as NodeRuntime<HasTransform2D> & HasTransform2DRuntime;
    ensureNodeWorldTransformMatrix(node);
    const cache = cloneAndInvalidateMatrix(runtime.worldTransform2D);
    parentState.worldTransformID++;
    ensureNodeWorldTransformMatrix(node);
    expect(equalsMatrix(runtime.worldTransform2D, cache)).toBe(true);
  });
});

describe('getNodeLocalTransformMatrix', () => {
  it('ensures local transform', () => {
    const runtime = getEntityRuntime(node) as HasTransform2DRuntime;
    expect(runtime.localTransform2D).toBeNull();
    getNodeLocalTransformMatrix(node);
    expect(runtime.localTransform2D).not.toBeNull();
  });

  it('returns local transform', () => {
    const transform = getNodeLocalTransformMatrix(node);
    expect(transform).equals((getEntityRuntime(node) as HasTransform2DRuntime).localTransform2D);
  });
});

describe('getNodeWorldTransformMatrix', () => {
  it('ensures world transform', () => {
    const runtime = getEntityRuntime(node) as HasTransform2DRuntime;
    expect(runtime.worldTransform2D).toBeNull();
    getNodeWorldTransformMatrix(node);
    expect(runtime.worldTransform2D).not.toBeNull();
  });

  it('returns local transform', () => {
    const transform = getNodeWorldTransformMatrix(node);
    expect(transform).equals((getEntityRuntime(node) as HasTransform2DRuntime).worldTransform2D);
  });
});

function cloneAndInvalidateMatrix(matrix: Matrix | null): Matrix | null {
  if (matrix === null) return null;
  const clone = cloneMatrix(matrix);
  setMatrix(matrix, -1, -1, -1, -1, -1, -1);
  return clone;
}

type TestNode = Node<HasTransform2D> & HasTransform2D;

const TestKind: unique symbol = Symbol('Test');
