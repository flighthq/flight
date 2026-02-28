import { matrix3x2, vector2 } from '@flighthq/geometry';
import type { DisplayObject, Matrix3x2 } from '@flighthq/types';

import { addChild } from './children';
import { createDisplayObject } from './createDisplayObject';
import { getGraphState } from './graphState';
import { invalidateLocalTransform } from './revision';
import {
  ensureLocalTransform,
  ensureWorldTransform,
  getLocalTransform,
  getWorldTransform,
  globalToLocal,
  localToGlobal,
} from './transform';

let displayObject: DisplayObject;
beforeEach(() => {
  displayObject = createDisplayObject();
});

describe('ensureLocalTransform', () => {
  it('computes local transform the first time', () => {
    const state = getGraphState(displayObject);
    expect(state.localTransform).toBeNull();
    ensureLocalTransform(displayObject);
    expect(state.localTransform).not.toBeNull();
  });

  it('recomputes if the local transform ID has changed', () => {
    const state = getGraphState(displayObject);
    ensureLocalTransform(displayObject);
    const cache = cloneAndInvalidateMatrix(state.localTransform);
    state.localTransformID++;
    ensureLocalTransform(displayObject);
    expect(state.localTransform).toEqual(cache);
  });
});

describe('ensureWorldTransform', () => {
  it('computes world transform the first time', () => {
    const state = getGraphState(displayObject);
    expect(state.worldTransform).toBeNull();
    ensureWorldTransform(displayObject);
    expect(state.worldTransform).not.toBeNull();
  });

  it('computes world transform for a parent for the first time', () => {
    const parent = createDisplayObject();
    addChild(parent, displayObject);
    const parentState = getGraphState(parent);
    expect(parentState.worldTransform).toBeNull();
    ensureWorldTransform(displayObject);
    expect(parentState.worldTransform).not.toBeNull();
  });

  it('recomputes if the local transform ID has changed', () => {
    const state = getGraphState(displayObject);
    ensureWorldTransform(displayObject);
    const cache = cloneAndInvalidateMatrix(state.worldTransform);
    state.localTransformID++;
    ensureWorldTransform(displayObject);
    expect(state.worldTransform).toEqual(cache);
  });

  it('recomputes if the parent transform ID has changed', () => {
    const parent = createDisplayObject();
    addChild(parent, displayObject);
    const state = getGraphState(displayObject);
    const parentState = getGraphState(parent);
    ensureWorldTransform(displayObject);
    const cache = cloneAndInvalidateMatrix(state.worldTransform);
    parentState.worldTransformID++;
    ensureWorldTransform(displayObject);
    expect(state.worldTransform).toEqual(cache);
  });
});

describe('getLocalTransform', () => {
  it('ensures local transform', () => {
    const state = getGraphState(displayObject);
    expect(state.localTransform).toBeNull();
    getLocalTransform(displayObject);
    expect(state.localTransform).not.toBeNull();
  });

  it('returns local transform', () => {
    const transform = getLocalTransform(displayObject);
    expect(transform).equals(getGraphState(displayObject).localTransform);
  });
});

describe('getWorldTransform', () => {
  it('ensures world transform', () => {
    const state = getGraphState(displayObject);
    expect(state.worldTransform).toBeNull();
    getWorldTransform(displayObject);
    expect(state.worldTransform).not.toBeNull();
  });

  it('returns local transform', () => {
    const transform = getWorldTransform(displayObject);
    expect(transform).equals(getGraphState(displayObject).worldTransform);
  });
});

describe('globalToLocal', () => {
  let obj: DisplayObject;

  beforeEach(() => {
    obj = createDisplayObject();
    // fake parent
    (obj as any).parent = createDisplayObject() as any; // eslint-disable-line
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

    globalToLocal(out, obj, world);

    expect(out.x).toBeCloseTo(2);
    expect(out.y).toBeCloseTo(2);
  });

  it('reuses the output object', () => {
    const out = vector2.create(999, 999);
    globalToLocal(out, obj, vector2.create(10, 20));

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

    globalToLocal(out, obj, world);

    expect(out.x).toBeCloseTo(2);
    expect(out.y).toBeCloseTo(2);
  });
});

describe('localToGlobal', () => {
  let obj: DisplayObject;

  beforeEach(() => {
    obj = createDisplayObject();
  });

  it('writes to out parameter', () => {
    const local = vector2.create(5, 5);
    const out = vector2.create();

    localToGlobal(out, obj, local);

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

    localToGlobal(out, obj, local);

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
    localToGlobal(g1, obj, p1);
    const g2 = vector2.create();
    localToGlobal(g2, obj, p2);

    expect(g1.x).toBe(2);
    expect(g1.y).toBe(3);
    expect(g2.x).toBe(3);
    expect(g2.y).toBe(4);
  });

  it('allows vector-like objects', () => {
    const local = { x: 5, y: 5 };
    const out = { x: 0, y: 0 };

    localToGlobal(out, obj, local);

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
