import { Rectangle } from '@flighthq/math';
import type { DisplayObject } from '@flighthq/types';
import { DirtyFlags } from '@flighthq/types';

import { createDisplayObject } from './createDisplayObject';
import { getCurrentLocalBounds } from './derived';
import { invalidate } from './dirty';
import { hitTestObject, hitTestPoint } from './hitTest';

describe('hitTestObject', () => {
  let a: DisplayObject;
  let b: DisplayObject;

  beforeEach(() => {
    a = createDisplayObject();
    b = createDisplayObject();

    // fake parent
    (a as any).parent = createDisplayObject() as any; // eslint-disable-line
    (b as any).parent = createDisplayObject() as any; // eslint-disable-line

    // Simple local bounds
    Rectangle.set(getCurrentLocalBounds(a), 0, 0, 10, 10);
    Rectangle.set(getCurrentLocalBounds(b), 0, 0, 10, 10);

    // Position b to overlap a
    a.x = 0;
    a.y = 0;
    b.x = 5;
    b.y = 5;

    a.scaleX = a.scaleY = 1;
    b.scaleX = b.scaleY = 1;
  });

  it('returns true when bounds intersect', () => {
    const result = hitTestObject(a, b);
    expect(result).toBe(true);
  });

  it('returns false when bounds do not intersect', () => {
    b.x = 20;
    b.y = 20;
    invalidate(b, DirtyFlags.Transform);

    const result = hitTestObject(a, b);
    expect(result).toBe(false);
  });

  it('returns false if either object has no parent', () => {
    (b as any).parent = null; // eslint-disable-line

    const result = hitTestObject(a, b);
    expect(result).toBe(false);
  });

  it('compares bounds in source local space', () => {
    a.scaleX = 1;
    a.scaleY = 1;

    b.x = 5;
    b.y = 5;

    const result = hitTestObject(a, b);
    expect(result).toBe(true);
  });
});

describe('hitTestPoint', () => {
  let obj: DisplayObject;

  beforeEach(() => {
    obj = createDisplayObject();
    obj.visible = true;
    obj.opaqueBackground = 0xff0000;
    // set a simple local bounds rectangle
    Rectangle.set(getCurrentLocalBounds(obj), 0, 0, 100, 100);
  });

  it('returns true for point inside bounds', () => {
    const result = hitTestPoint(obj, 50, 50);
    expect(result).toBe(true);
  });

  it('returns false for point outside bounds', () => {
    const result = hitTestPoint(obj, 200, 200);
    expect(result).toBe(false);
  });

  it('returns false if object is not visible', () => {
    obj.visible = false;
    const result = hitTestPoint(obj, 50, 50);
    expect(result).toBe(false);
  });

  it('returns false if object has no opaqueBackground', () => {
    obj.opaqueBackground = null;
    const result = hitTestPoint(obj, 50, 50);
    expect(result).toBe(false);
  });

  it('respects world transform', () => {
    obj.x = 100;
    obj.y = 100;
    invalidate(obj, DirtyFlags.Transform);
    const inside = hitTestPoint(obj, 150, 150);
    const outside = hitTestPoint(obj, 50, 50);

    expect(inside).toBe(true);
    expect(outside).toBe(false);
  });

  it('works with the default shapeFlag param', () => {
    // should ignore _shapeFlag in base DisplayObject
    const result = hitTestPoint(obj, 50, 50);
    expect(result).toBe(true);

    const resultExplicit = hitTestPoint(obj, 50, 50, true);
    expect(resultExplicit).toBe(true);
  });
});
