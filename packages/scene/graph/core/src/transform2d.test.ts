import { getNodeRuntime } from '@flighthq/core';
import { matrix3x2, vector2 } from '@flighthq/geometry';
import { addChild, createGraphNode } from '@flighthq/scene-graph-core';
import type { GraphNode, HasTransform2D, HasTransform2DRuntime, Matrix3x2 } from '@flighthq/types';

import { initHasTransform2D, initHasTransform2DRuntime } from './hasTransform2d';
import { invalidateLocalTransform } from './revision';
import {
  ensureLocalTransform2D,
  ensureWorldTransform2D,
  getLocalTransform2D,
  getWorldTransform2D,
  globalToLocal2D,
  localToGlobal2D,
} from './transform2d';

function createTestNode(): TestNode {
  const node = createGraphNode(TestGraph, TestKind) as TestNode;
  const runtime = getNodeRuntime(node);
  initHasTransform2D(node);
  initHasTransform2DRuntime(runtime as HasTransform2DRuntime<typeof TestGraph>);
  return node;
}

let node: TestNode;
beforeEach(() => {
  node = createTestNode();
});

describe('ensureLocalTransform2D', () => {
  it('computes local transform the first time', () => {
    const runtime = getNodeRuntime(node) as HasTransform2DRuntime<typeof TestGraph>;
    expect(runtime.localTransform2D).toBeNull();
    ensureLocalTransform2D(node);
    expect(runtime.localTransform2D).not.toBeNull();
  });

  it('recomputes if the local transform ID has changed', () => {
    const runtime = getNodeRuntime(node) as HasTransform2DRuntime<typeof TestGraph>;
    ensureLocalTransform2D(node);
    const cache = cloneAndInvalidateMatrix(runtime.localTransform2D);
    runtime.localTransformID++;
    ensureLocalTransform2D(node);
    expect(runtime.localTransform2D).toEqual(cache);
  });
});

describe('ensureWorldTransform2D', () => {
  it('computes world transform the first time', () => {
    const runtime = getNodeRuntime(node) as HasTransform2DRuntime<typeof TestGraph>;
    expect(runtime.worldTransform2D).toBeNull();
    ensureWorldTransform2D(node);
    expect(runtime.worldTransform2D).not.toBeNull();
  });

  it('computes world transform for a parent for the first time', () => {
    const parent = createTestNode();
    addChild(parent, node);
    const parentState = getNodeRuntime(node) as HasTransform2DRuntime<typeof TestGraph>;
    expect(parentState.worldTransform2D).toBeNull();
    ensureWorldTransform2D(node);
    expect(parentState.worldTransform2D).not.toBeNull();
  });

  it('recomputes if the local transform ID has changed', () => {
    const runtime = getNodeRuntime(node) as HasTransform2DRuntime<typeof TestGraph>;
    ensureWorldTransform2D(node);
    const cache = cloneAndInvalidateMatrix(runtime.worldTransform2D);
    runtime.localTransformID++;
    ensureWorldTransform2D(node);
    expect(runtime.worldTransform2D).toEqual(cache);
  });

  it('recomputes if the parent transform ID has changed', () => {
    const parent = createTestNode();
    addChild(parent, node);
    const runtime = getNodeRuntime(node) as HasTransform2DRuntime<typeof TestGraph>;
    const parentState = getNodeRuntime(parent) as HasTransform2DRuntime<typeof TestGraph>;
    ensureWorldTransform2D(node);
    const cache = cloneAndInvalidateMatrix(runtime.worldTransform2D);
    parentState.worldTransformID++;
    ensureWorldTransform2D(node);
    expect(runtime.worldTransform2D).toEqual(cache);
  });
});

describe('getLocalTransform2D', () => {
  it('ensures local transform', () => {
    const runtime = getNodeRuntime(node) as HasTransform2DRuntime<typeof TestGraph>;
    expect(runtime.localTransform2D).toBeNull();
    getLocalTransform2D(node);
    expect(runtime.localTransform2D).not.toBeNull();
  });

  it('returns local transform', () => {
    const transform = getLocalTransform2D(node);
    expect(transform).equals((getNodeRuntime(node) as HasTransform2DRuntime<typeof TestGraph>).localTransform2D);
  });
});

describe('getWorldTransform2D', () => {
  it('ensures world transform', () => {
    const runtime = getNodeRuntime(node) as HasTransform2DRuntime<typeof TestGraph>;
    expect(runtime.worldTransform2D).toBeNull();
    getWorldTransform2D(node);
    expect(runtime.worldTransform2D).not.toBeNull();
  });

  it('returns local transform', () => {
    const transform = getWorldTransform2D(node);
    expect(transform).equals((getNodeRuntime(node) as HasTransform2DRuntime<typeof TestGraph>).worldTransform2D);
  });
});

describe('globalToLocal2D', () => {
  let obj: TestNode;

  beforeEach(() => {
    obj = createTestNode();
    addChild(createTestNode(), obj);
    obj.x = 10;
    obj.y = 20;
    obj.scaleX = 2;
    obj.scaleY = 2;
    obj.rotation = 0;
    invalidateLocalTransform(obj);
  });

  it('writes into the provided output Vector2', () => {
    const out = vector2.create();
    const world = vector2.create(14, 24);

    globalToLocal2D(out, obj, world);

    expect(out.x).toBeCloseTo(2);
    expect(out.y).toBeCloseTo(2);
  });

  it('reuses the output object', () => {
    const out = vector2.create(999, 999);
    globalToLocal2D(out, obj, vector2.create(10, 20));

    expect(out).toEqual(expect.objectContaining({ x: 0, y: 0 }));
  });

  it('updates the world transform before conversion', () => {
    // const spy = vi.spyOn(obj, updateWorldTransform);
    // globalToLocal(vector2.create(), obj, vector2.create());
    // expect(spy).toHaveBeenCalled();
    // spy.mockRestore();
  });

  it('allows vector-like objects', () => {
    const out = { x: 0, y: 0 };
    const world = { x: 14, y: 24 };

    globalToLocal2D(out, obj, world);

    expect(out.x).toBeCloseTo(2);
    expect(out.y).toBeCloseTo(2);
  });
});

describe('localToGlobal2D', () => {
  let obj: TestNode;

  beforeEach(() => {
    obj = createTestNode();
  });

  it('writes to out parameter', () => {
    const local = vector2.create(5, 5);
    const out = vector2.create();

    localToGlobal2D(out, obj, local);

    expect(out.x).toBe(5);
    expect(out.y).toBe(5);
    expect(out).not.toBe(local); // out is a separate object
  });

  it('respects world transform', () => {
    obj.x = 50;
    obj.y = 30;
    invalidateLocalTransform(obj);

    const local = vector2.create(10, 20);
    const out = vector2.create();

    localToGlobal2D(out, obj, local);

    expect(out.x).toBe(60); // 50 + 10
    expect(out.y).toBe(50); // 30 + 20
  });

  it('produces independent results from multiple points', () => {
    obj.x = 1;
    obj.y = 2;
    invalidateLocalTransform(obj);

    const p1 = vector2.create(1, 1);
    const p2 = vector2.create(2, 2);

    const g1 = vector2.create();
    localToGlobal2D(g1, obj, p1);
    const g2 = vector2.create();
    localToGlobal2D(g2, obj, p2);

    expect(g1.x).toBe(2);
    expect(g1.y).toBe(3);
    expect(g2.x).toBe(3);
    expect(g2.y).toBe(4);
  });

  it('allows vector-like objects', () => {
    const local = { x: 5, y: 5 };
    const out = { x: 0, y: 0 };

    localToGlobal2D(out, obj, local);

    expect(out.x).toBe(5);
    expect(out.y).toBe(5);
    expect(out).not.toBe(local); // out is a separate object
  });
});

function cloneAndInvalidateMatrix(matrix: Matrix3x2 | null): Matrix3x2 | null {
  if (matrix === null) return null;
  const clone = matrix3x2.clone(matrix);
  matrix3x2.setTo(matrix, -1, -1, -1, -1, -1, -1);
  return clone;
}

type TestNode = GraphNode<typeof TestKind> & HasTransform2D<typeof TestKind>;

const TestGraph: unique symbol = Symbol('TestGraph');

const TestKind: unique symbol = Symbol('Test');
