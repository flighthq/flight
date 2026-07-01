import { getEntityRuntime } from '@flighthq/entity';
import { cloneMatrix, createMatrix, createVector2, equalsMatrix, multiplyMatrix, setMatrix } from '@flighthq/geometry';
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
    runtime.localTransformId++;
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
    runtime.localTransformId++;
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
    parentState.worldTransformId++;
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

  it('offsets translation by the pivot so the pivot point lands at (x, y)', () => {
    node.x = 100;
    node.y = 50;
    node.pivotX = 10;
    node.pivotY = 20;
    const transform = getNodeLocalTransformMatrix(node);
    expect(transform.tx).toBeCloseTo(90); // 100 - 1 * 10
    expect(transform.ty).toBeCloseTo(30); // 50 - 1 * 20
  });

  it('scales the pivot offset with scaleX/scaleY', () => {
    node.scaleX = 2;
    node.scaleY = 3;
    node.pivotX = 10;
    node.pivotY = 10;
    const transform = getNodeLocalTransformMatrix(node);
    expect(transform.tx).toBeCloseTo(-20); // 0 - 2 * 10
    expect(transform.ty).toBeCloseTo(-30); // 0 - 3 * 10
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

describe('skew', () => {
  const DEG_TO_RAD = Math.PI / 180;

  it('produces the same matrix with skewX=0 and skewY=0 as without skew', () => {
    const withSkew = createTestNode();
    withSkew.rotation = 30;
    withSkew.scaleX = 2;
    withSkew.scaleY = 3;
    withSkew.skewX = 0;
    withSkew.skewY = 0;
    invalidateNodeLocalTransform(withSkew);

    const withoutSkew = createTestNode();
    withoutSkew.rotation = 30;
    withoutSkew.scaleX = 2;
    withoutSkew.scaleY = 3;
    invalidateNodeLocalTransform(withoutSkew);

    const mSkew = getNodeLocalTransformMatrix(withSkew);
    const mNoSkew = getNodeLocalTransformMatrix(withoutSkew);
    expect(mSkew.a).toBeCloseTo(mNoSkew.a);
    expect(mSkew.b).toBeCloseTo(mNoSkew.b);
    expect(mSkew.c).toBeCloseTo(mNoSkew.c);
    expect(mSkew.d).toBeCloseTo(mNoSkew.d);
    expect(mSkew.tx).toBeCloseTo(mNoSkew.tx);
    expect(mSkew.ty).toBeCloseTo(mNoSkew.ty);
  });

  it('applies isolated skewX to c and d cells without affecting a and b', () => {
    node.skewX = 45;
    node.skewY = 0;
    node.scaleX = 1;
    node.scaleY = 1;
    node.rotation = 0;
    invalidateNodeLocalTransform(node);

    const m = getNodeLocalTransformMatrix(node);
    const radX = 45 * DEG_TO_RAD;
    expect(m.a).toBeCloseTo(1);
    expect(m.b).toBeCloseTo(0);
    expect(m.c).toBeCloseTo(-Math.sin(radX));
    expect(m.d).toBeCloseTo(Math.cos(radX));
  });

  it('applies isolated skewY to a and b cells without affecting c and d', () => {
    node.skewX = 0;
    node.skewY = 30;
    node.scaleX = 1;
    node.scaleY = 1;
    node.rotation = 0;
    invalidateNodeLocalTransform(node);

    const m = getNodeLocalTransformMatrix(node);
    const radY = 30 * DEG_TO_RAD;
    expect(m.a).toBeCloseTo(Math.cos(radY));
    expect(m.b).toBeCloseTo(Math.sin(radY));
    expect(m.c).toBeCloseTo(0);
    expect(m.d).toBeCloseTo(1);
  });

  it('computes all four matrix cells with combined skew and rotation', () => {
    node.rotation = 45;
    node.skewX = 15;
    node.skewY = 20;
    node.scaleX = 1;
    node.scaleY = 1;
    invalidateNodeLocalTransform(node);

    const m = getNodeLocalTransformMatrix(node);
    const radY = (45 + 20) * DEG_TO_RAD;
    const radX = (45 + 15) * DEG_TO_RAD;
    expect(m.a).toBeCloseTo(Math.cos(radY));
    expect(m.b).toBeCloseTo(Math.sin(radY));
    expect(m.c).toBeCloseTo(-Math.sin(radX));
    expect(m.d).toBeCloseTo(Math.cos(radX));
  });

  it('propagates skew through world transform', () => {
    const parent = createTestNode();
    parent.skewX = 10;
    parent.skewY = 20;
    parent.scaleX = 2;
    parent.scaleY = 1;
    invalidateNodeLocalTransform(parent);

    const child = createTestNode();
    child.x = 50;
    child.scaleX = 1;
    child.scaleY = 1;
    invalidateNodeLocalTransform(child);

    addNodeChild(parent, child);

    const parentLocal = getNodeLocalTransformMatrix(parent);
    const childLocal = getNodeLocalTransformMatrix(child);
    const expected = createMatrix();
    multiplyMatrix(expected, parentLocal, childLocal);

    const world = getNodeWorldTransformMatrix(child);
    expect(world.a).toBeCloseTo(expected.a);
    expect(world.b).toBeCloseTo(expected.b);
    expect(world.c).toBeCloseTo(expected.c);
    expect(world.d).toBeCloseTo(expected.d);
    expect(world.tx).toBeCloseTo(expected.tx);
    expect(world.ty).toBeCloseTo(expected.ty);
  });

  it('computes correct tx/ty when both pivot and skew are nonzero', () => {
    node.skewX = 30;
    node.skewY = 45;
    node.scaleX = 2;
    node.scaleY = 3;
    node.pivotX = 10;
    node.pivotY = 20;
    node.x = 100;
    node.y = 50;
    node.rotation = 0;
    invalidateNodeLocalTransform(node);

    const m = getNodeLocalTransformMatrix(node);
    const radY = 45 * DEG_TO_RAD;
    const radX = 30 * DEG_TO_RAD;
    const a = Math.cos(radY) * 2;
    const b = Math.sin(radY) * 2;
    const c = -Math.sin(radX) * 3;
    const d = Math.cos(radX) * 3;
    expect(m.a).toBeCloseTo(a);
    expect(m.b).toBeCloseTo(b);
    expect(m.c).toBeCloseTo(c);
    expect(m.d).toBeCloseTo(d);
    expect(m.tx).toBeCloseTo(100 - (a * 10 + c * 20));
    expect(m.ty).toBeCloseTo(50 - (b * 10 + d * 20));
  });
});

function cloneAndInvalidateMatrix(matrix: Matrix | null): Matrix | null {
  if (matrix === null) return null;
  const clone = cloneMatrix(matrix);
  setMatrix(matrix, -1, -1, -1, -1, -1, -1);
  return clone;
}

type TestNode = Node<HasTransform2D> & HasTransform2D;

const TestKind = 'Test';
