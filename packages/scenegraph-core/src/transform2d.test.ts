import { getEntityRuntime } from '@flighthq/entity';
import { cloneMatrix, createVector2, equalsMatrix, setMatrix } from '@flighthq/geometry';
import { addGraphChild, createGraphNode } from '@flighthq/scenegraph-core';
import type { GraphNode, GraphNodeRuntime, HasTransform2D, HasTransform2DRuntime, Matrix } from '@flighthq/types';

import { initHasTransform, initHasTransformRuntime } from './hasTransform2d';
import { invalidateLocalTransform } from './revision';
import {
  ensureLocalTransformMatrix,
  ensureWorldTransformMatrix,
  getLocalTransformMatrix,
  getWorldTransformMatrix,
  globalVector2ToLocal,
  localVector2ToGlobal,
  setTransformRotation,
  setTransformScaleX,
  setTransformScaleY,
  setTransformX,
  setTransformY,
} from './transform2d';

function createTestNode(): TestNode {
  const node = createGraphNode(TestKind, TestKind) as TestNode;
  const runtime = getEntityRuntime(node);
  initHasTransform(node);
  initHasTransformRuntime(runtime as HasTransform2DRuntime);
  return node;
}

let node: TestNode;
beforeEach(() => {
  node = createTestNode();
});

describe('ensureLocalTransformMatrix', () => {
  it('computes local transform the first time', () => {
    const runtime = getEntityRuntime(node) as HasTransform2DRuntime;
    expect(runtime.localTransform2D).toBeNull();
    ensureLocalTransformMatrix(node);
    expect(runtime.localTransform2D).not.toBeNull();
  });

  it('recomputes if the local transform ID has changed', () => {
    const runtime = getEntityRuntime(node) as GraphNodeRuntime<typeof TestKind, HasTransform2D> & HasTransform2DRuntime;
    ensureLocalTransformMatrix(node);
    const cache = cloneAndInvalidateMatrix(runtime.localTransform2D);
    runtime.localTransformID++;
    ensureLocalTransformMatrix(node);
    expect(equalsMatrix(runtime.localTransform2D, cache)).toBe(true);
  });
});

describe('ensureWorldTransformMatrix', () => {
  it('computes world transform the first time', () => {
    const runtime = getEntityRuntime(node) as GraphNodeRuntime<typeof TestKind, HasTransform2D> & HasTransform2DRuntime;
    expect(runtime.worldTransform2D).toBeNull();
    ensureWorldTransformMatrix(node);
    expect(runtime.worldTransform2D).not.toBeNull();
  });

  it('computes world transform for a parent for the first time', () => {
    const parent = createTestNode();
    addGraphChild(parent, node);
    const parentState = getEntityRuntime(node) as HasTransform2DRuntime;
    expect(parentState.worldTransform2D).toBeNull();
    ensureWorldTransformMatrix(node);
    expect(parentState.worldTransform2D).not.toBeNull();
  });

  it('recomputes if the local transform ID has changed', () => {
    const runtime = getEntityRuntime(node) as GraphNodeRuntime<typeof TestKind, HasTransform2D> & HasTransform2DRuntime;
    ensureWorldTransformMatrix(node);
    const cache = cloneAndInvalidateMatrix(runtime.worldTransform2D);
    runtime.localTransformID++;
    ensureWorldTransformMatrix(node);
    expect(equalsMatrix(runtime.worldTransform2D, cache)).toBe(true);
  });

  it('recomputes if the parent transform ID has changed', () => {
    const parent = createTestNode();
    addGraphChild(parent, node);
    const runtime = getEntityRuntime(node) as HasTransform2DRuntime;
    const parentState = getEntityRuntime(parent) as GraphNodeRuntime<typeof TestKind, HasTransform2D> &
      HasTransform2DRuntime;
    ensureWorldTransformMatrix(node);
    const cache = cloneAndInvalidateMatrix(runtime.worldTransform2D);
    parentState.worldTransformID++;
    ensureWorldTransformMatrix(node);
    expect(equalsMatrix(runtime.worldTransform2D, cache)).toBe(true);
  });
});

describe('getLocalTransformMatrix', () => {
  it('ensures local transform', () => {
    const runtime = getEntityRuntime(node) as HasTransform2DRuntime;
    expect(runtime.localTransform2D).toBeNull();
    getLocalTransformMatrix(node);
    expect(runtime.localTransform2D).not.toBeNull();
  });

  it('returns local transform', () => {
    const transform = getLocalTransformMatrix(node);
    expect(transform).equals((getEntityRuntime(node) as HasTransform2DRuntime).localTransform2D);
  });
});

describe('getWorldTransformMatrix', () => {
  it('ensures world transform', () => {
    const runtime = getEntityRuntime(node) as HasTransform2DRuntime;
    expect(runtime.worldTransform2D).toBeNull();
    getWorldTransformMatrix(node);
    expect(runtime.worldTransform2D).not.toBeNull();
  });

  it('returns local transform', () => {
    const transform = getWorldTransformMatrix(node);
    expect(transform).equals((getEntityRuntime(node) as HasTransform2DRuntime).worldTransform2D);
  });
});

describe('globalVector2ToLocal', () => {
  let obj: TestNode;

  beforeEach(() => {
    obj = createTestNode();
    addGraphChild(createTestNode(), obj);
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

    globalVector2ToLocal(out, obj, world);

    expect(out.x).toBeCloseTo(2);
    expect(out.y).toBeCloseTo(2);
  });

  it('reuses the output object', () => {
    const out = createVector2(999, 999);
    globalVector2ToLocal(out, obj, createVector2(10, 20));

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

    globalVector2ToLocal(out, obj, world);

    expect(out.x).toBeCloseTo(2);
    expect(out.y).toBeCloseTo(2);
  });
});

describe('localVector2ToGlobal', () => {
  let obj: TestNode;

  beforeEach(() => {
    obj = createTestNode();
  });

  it('writes to out parameter', () => {
    const local = createVector2(5, 5);
    const out = createVector2();

    localVector2ToGlobal(out, obj, local);

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

    localVector2ToGlobal(out, obj, local);

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
    localVector2ToGlobal(g1, obj, p1);
    const g2 = createVector2();
    localVector2ToGlobal(g2, obj, p2);

    expect(g1.x).toBe(2);
    expect(g1.y).toBe(3);
    expect(g2.x).toBe(3);
    expect(g2.y).toBe(4);
  });

  it('allows vector-like objects', () => {
    const local = { x: 5, y: 5 };
    const out = { x: 0, y: 0 };

    localVector2ToGlobal(out, obj, local);

    expect(out.x).toBe(5);
    expect(out.y).toBe(5);
    expect(out).not.toBe(local); // out is a separate object
  });
});

describe('setTransformRotation', () => {
  it('updates rotation on the node', () => {
    setTransformRotation(node, 45);
    expect(node.rotation).toBe(45);
  });

  it('invalidates the local transform', () => {
    const before = cloneMatrix(getLocalTransformMatrix(node));
    setTransformRotation(node, 90);
    const after = getLocalTransformMatrix(node);
    expect(equalsMatrix(before, after)).toBe(false);
  });

  it('affects the resulting matrix', () => {
    setTransformRotation(node, 90);
    const m = getLocalTransformMatrix(node);
    expect(m.a).toBeCloseTo(0);
    expect(m.b).toBeCloseTo(1);
  });
});

describe('setTransformScaleX', () => {
  it('updates scaleX on the node', () => {
    setTransformScaleX(node, 3);
    expect(node.scaleX).toBe(3);
  });

  it('invalidates the local transform', () => {
    const before = cloneMatrix(getLocalTransformMatrix(node));
    setTransformScaleX(node, 2);
    const after = getLocalTransformMatrix(node);
    expect(equalsMatrix(before, after)).toBe(false);
  });

  it('affects the resulting matrix', () => {
    setTransformScaleX(node, 4);
    const m = getLocalTransformMatrix(node);
    expect(m.a).toBeCloseTo(4);
  });
});

describe('setTransformScaleY', () => {
  it('updates scaleY on the node', () => {
    setTransformScaleY(node, 3);
    expect(node.scaleY).toBe(3);
  });

  it('invalidates the local transform', () => {
    const before = cloneMatrix(getLocalTransformMatrix(node));
    setTransformScaleY(node, 2);
    const after = getLocalTransformMatrix(node);
    expect(equalsMatrix(before, after)).toBe(false);
  });

  it('affects the resulting matrix', () => {
    setTransformScaleY(node, 5);
    const m = getLocalTransformMatrix(node);
    expect(m.d).toBeCloseTo(5);
  });
});

describe('setTransformX', () => {
  it('updates x on the node', () => {
    setTransformX(node, 50);
    expect(node.x).toBe(50);
  });

  it('invalidates the local transform', () => {
    const before = cloneMatrix(getLocalTransformMatrix(node));
    setTransformX(node, 100);
    const after = getLocalTransformMatrix(node);
    expect(equalsMatrix(before, after)).toBe(false);
  });

  it('affects the resulting matrix', () => {
    setTransformX(node, 42);
    const m = getLocalTransformMatrix(node);
    expect(m.tx).toBe(42);
  });
});

describe('setTransformY', () => {
  it('updates y on the node', () => {
    setTransformY(node, 75);
    expect(node.y).toBe(75);
  });

  it('invalidates the local transform', () => {
    const before = cloneMatrix(getLocalTransformMatrix(node));
    setTransformY(node, 100);
    const after = getLocalTransformMatrix(node);
    expect(equalsMatrix(before, after)).toBe(false);
  });

  it('affects the resulting matrix', () => {
    setTransformY(node, 99);
    const m = getLocalTransformMatrix(node);
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
