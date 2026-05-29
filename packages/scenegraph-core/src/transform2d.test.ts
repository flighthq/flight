import { getRuntime } from '@flighthq/entity';
import { cloneMatrix, createVector2, equalsMatrix, setMatrix } from '@flighthq/geometry';
import { addChild, createGraphNode } from '@flighthq/scenegraph-core';
import type { GraphNode, GraphNodeRuntime, HasTransform2D, HasTransform2DRuntime, Matrix } from '@flighthq/types';

import { initHasTransform2D, initHasTransform2DRuntime } from './hasTransform2d';
import { invalidateLocalTransform } from './revision';
import {
  ensureLocalTransform2D,
  ensureWorldTransform2D,
  getLocalTransform2D,
  getWorldTransform2D,
  globalToLocal2D,
  localToGlobal2D,
  setRotation,
  setScaleX,
  setScaleY,
  setX,
  setY,
} from './transform2d';

function createTestNode(): TestNode {
  const node = createGraphNode(TestKind, TestKind) as TestNode;
  const runtime = getRuntime(node);
  initHasTransform2D(node);
  initHasTransform2DRuntime(runtime as HasTransform2DRuntime);
  return node;
}

let node: TestNode;
beforeEach(() => {
  node = createTestNode();
});

describe('ensureLocalTransform2D', () => {
  it('computes local transform the first time', () => {
    const runtime = getRuntime(node) as HasTransform2DRuntime;
    expect(runtime.localTransform2D).toBeNull();
    ensureLocalTransform2D(node);
    expect(runtime.localTransform2D).not.toBeNull();
  });

  it('recomputes if the local transform ID has changed', () => {
    const runtime = getRuntime(node) as GraphNodeRuntime<typeof TestKind, HasTransform2D> & HasTransform2DRuntime;
    ensureLocalTransform2D(node);
    const cache = cloneAndInvalidateMatrix(runtime.localTransform2D);
    runtime.localTransformID++;
    ensureLocalTransform2D(node);
    expect(equalsMatrix(runtime.localTransform2D, cache)).toBe(true);
  });
});

describe('ensureWorldTransform2D', () => {
  it('computes world transform the first time', () => {
    const runtime = getRuntime(node) as GraphNodeRuntime<typeof TestKind, HasTransform2D> & HasTransform2DRuntime;
    expect(runtime.worldTransform2D).toBeNull();
    ensureWorldTransform2D(node);
    expect(runtime.worldTransform2D).not.toBeNull();
  });

  it('computes world transform for a parent for the first time', () => {
    const parent = createTestNode();
    addChild(parent, node);
    const parentState = getRuntime(node) as HasTransform2DRuntime;
    expect(parentState.worldTransform2D).toBeNull();
    ensureWorldTransform2D(node);
    expect(parentState.worldTransform2D).not.toBeNull();
  });

  it('recomputes if the local transform ID has changed', () => {
    const runtime = getRuntime(node) as GraphNodeRuntime<typeof TestKind, HasTransform2D> & HasTransform2DRuntime;
    ensureWorldTransform2D(node);
    const cache = cloneAndInvalidateMatrix(runtime.worldTransform2D);
    runtime.localTransformID++;
    ensureWorldTransform2D(node);
    expect(equalsMatrix(runtime.worldTransform2D, cache)).toBe(true);
  });

  it('recomputes if the parent transform ID has changed', () => {
    const parent = createTestNode();
    addChild(parent, node);
    const runtime = getRuntime(node) as HasTransform2DRuntime;
    const parentState = getRuntime(parent) as GraphNodeRuntime<typeof TestKind, HasTransform2D> & HasTransform2DRuntime;
    ensureWorldTransform2D(node);
    const cache = cloneAndInvalidateMatrix(runtime.worldTransform2D);
    parentState.worldTransformID++;
    ensureWorldTransform2D(node);
    expect(equalsMatrix(runtime.worldTransform2D, cache)).toBe(true);
  });
});

describe('getLocalTransform2D', () => {
  it('ensures local transform', () => {
    const runtime = getRuntime(node) as HasTransform2DRuntime;
    expect(runtime.localTransform2D).toBeNull();
    getLocalTransform2D(node);
    expect(runtime.localTransform2D).not.toBeNull();
  });

  it('returns local transform', () => {
    const transform = getLocalTransform2D(node);
    expect(transform).equals((getRuntime(node) as HasTransform2DRuntime).localTransform2D);
  });
});

describe('getWorldTransform2D', () => {
  it('ensures world transform', () => {
    const runtime = getRuntime(node) as HasTransform2DRuntime;
    expect(runtime.worldTransform2D).toBeNull();
    getWorldTransform2D(node);
    expect(runtime.worldTransform2D).not.toBeNull();
  });

  it('returns local transform', () => {
    const transform = getWorldTransform2D(node);
    expect(transform).equals((getRuntime(node) as HasTransform2DRuntime).worldTransform2D);
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
    const out = createVector2();
    const world = createVector2(14, 24);

    globalToLocal2D(out, obj, world);

    expect(out.x).toBeCloseTo(2);
    expect(out.y).toBeCloseTo(2);
  });

  it('reuses the output object', () => {
    const out = createVector2(999, 999);
    globalToLocal2D(out, obj, createVector2(10, 20));

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
    const local = createVector2(5, 5);
    const out = createVector2();

    localToGlobal2D(out, obj, local);

    expect(out.x).toBe(5);
    expect(out.y).toBe(5);
    expect(out).not.toBe(local); // out is a separate object
  });

  it('respects world transform', () => {
    obj.x = 50;
    obj.y = 30;
    invalidateLocalTransform(obj);

    const local = createVector2(10, 20);
    const out = createVector2();

    localToGlobal2D(out, obj, local);

    expect(out.x).toBe(60); // 50 + 10
    expect(out.y).toBe(50); // 30 + 20
  });

  it('produces independent results from multiple points', () => {
    obj.x = 1;
    obj.y = 2;
    invalidateLocalTransform(obj);

    const p1 = createVector2(1, 1);
    const p2 = createVector2(2, 2);

    const g1 = createVector2();
    localToGlobal2D(g1, obj, p1);
    const g2 = createVector2();
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

describe('setRotation', () => {
  it('updates rotation on the node', () => {
    setRotation(node, 45);
    expect(node.rotation).toBe(45);
  });

  it('invalidates the local transform', () => {
    const before = cloneMatrix(getLocalTransform2D(node));
    setRotation(node, 90);
    const after = getLocalTransform2D(node);
    expect(equalsMatrix(before, after)).toBe(false);
  });

  it('affects the resulting matrix', () => {
    setRotation(node, 90);
    const m = getLocalTransform2D(node);
    expect(m.a).toBeCloseTo(0);
    expect(m.b).toBeCloseTo(1);
  });
});

describe('setScaleX', () => {
  it('updates scaleX on the node', () => {
    setScaleX(node, 3);
    expect(node.scaleX).toBe(3);
  });

  it('invalidates the local transform', () => {
    const before = cloneMatrix(getLocalTransform2D(node));
    setScaleX(node, 2);
    const after = getLocalTransform2D(node);
    expect(equalsMatrix(before, after)).toBe(false);
  });

  it('affects the resulting matrix', () => {
    setScaleX(node, 4);
    const m = getLocalTransform2D(node);
    expect(m.a).toBeCloseTo(4);
  });
});

describe('setScaleY', () => {
  it('updates scaleY on the node', () => {
    setScaleY(node, 3);
    expect(node.scaleY).toBe(3);
  });

  it('invalidates the local transform', () => {
    const before = cloneMatrix(getLocalTransform2D(node));
    setScaleY(node, 2);
    const after = getLocalTransform2D(node);
    expect(equalsMatrix(before, after)).toBe(false);
  });

  it('affects the resulting matrix', () => {
    setScaleY(node, 5);
    const m = getLocalTransform2D(node);
    expect(m.d).toBeCloseTo(5);
  });
});

describe('setX', () => {
  it('updates x on the node', () => {
    setX(node, 50);
    expect(node.x).toBe(50);
  });

  it('invalidates the local transform', () => {
    const before = cloneMatrix(getLocalTransform2D(node));
    setX(node, 100);
    const after = getLocalTransform2D(node);
    expect(equalsMatrix(before, after)).toBe(false);
  });

  it('affects the resulting matrix', () => {
    setX(node, 42);
    const m = getLocalTransform2D(node);
    expect(m.tx).toBe(42);
  });
});

describe('setY', () => {
  it('updates y on the node', () => {
    setY(node, 75);
    expect(node.y).toBe(75);
  });

  it('invalidates the local transform', () => {
    const before = cloneMatrix(getLocalTransform2D(node));
    setY(node, 100);
    const after = getLocalTransform2D(node);
    expect(equalsMatrix(before, after)).toBe(false);
  });

  it('affects the resulting matrix', () => {
    setY(node, 99);
    const m = getLocalTransform2D(node);
    expect(m.ty).toBe(99);
  });
});

function cloneAndInvalidateMatrix(matrix: Matrix | null): Matrix | null {
  if (matrix === null) return null;
  const clone = cloneMatrix(matrix);
  setMatrix(matrix, -1, -1, -1, -1, -1, -1);
  return clone;
}

type TestNode = GraphNode<typeof TestKind, HasTransform2D> & HasTransform2D;

const TestKind: unique symbol = Symbol('Test');
