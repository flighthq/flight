import { rectangle } from '@flighthq/geometry';
import { addChild, getLocalBoundsRect, invalidateLocalTransform } from '@flighthq/scene-graph-core';
import {
  createDisplayObject,
  createDisplayObjectGeneric,
  getDisplayObjectRuntime,
} from '@flighthq/scene-graph-display';
import type { DisplayObject, DisplayObjectRuntime } from '@flighthq/types';
import { DisplayObjectKind } from '@flighthq/types';

import { hitTestObject, hitTestPoint, registerHitTestPoint } from './hitTests';
import { defaultDisplayObjectHitTestPoint } from './displayHitTests';

describe('hitTestObject', () => {
  let a: DisplayObject;
  let b: DisplayObject;

  beforeEach(() => {
    a = createDisplayObject();
    b = createDisplayObject();

    addChild(createDisplayObject(), a);
    addChild(createDisplayObject(), b);

    // Simple local bounds
    rectangle.setTo(getLocalBoundsRect(a), 0, 0, 10, 10);
    rectangle.setTo(getLocalBoundsRect(b), 0, 0, 10, 10);

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
    invalidateLocalTransform(b);

    const result = hitTestObject(a, b);
    expect(result).toBe(false);
  });

  it('returns false if either object has no parent', () => {
    (getDisplayObjectRuntime(b) as DisplayObjectRuntime).parent = null;

    const result = hitTestObject(a, b);
    expect(result).toBe(false);
  });

  it('compares bounds in world space', () => {
    a.scaleX = 1;
    a.scaleY = 1;

    b.x = 5;
    b.y = 5;
    invalidateLocalTransform(b);

    const result = hitTestObject(a, b);
    expect(result).toBe(true);
  });

  it('includes child bounds when a child extends beyond the object local bounds', () => {
    // a at (0,0) local bounds [0,0,10,10]; child at (90,90) size 20x20
    // a's world bounds unions to [0,0,110,110], which reaches b at (100,100)
    const child = createDisplayObject();
    child.x = 90;
    child.y = 90;
    invalidateLocalTransform(child);
    rectangle.setTo(getLocalBoundsRect(child), 0, 0, 20, 20);
    addChild(a, child);

    b.x = 100;
    b.y = 100;
    invalidateLocalTransform(b);

    expect(hitTestObject(a, b)).toBe(true);
  });
});

describe('hitTestPoint', () => {
  let obj: DisplayObject;

  beforeAll(() => {
    registerHitTestPoint(DisplayObjectKind, defaultDisplayObjectHitTestPoint);
  });

  beforeEach(() => {
    obj = createDisplayObject();
    obj.opaqueBackground = 0xff0000;
    // set a simple local bounds rectangle
    rectangle.setTo(getLocalBoundsRect(obj), 0, 0, 100, 100);
  });

  it('returns true for point inside bounds', () => {
    const result = hitTestPoint(obj, 50, 50);
    expect(result).toBe(true);
  });

  it('returns false for point outside bounds', () => {
    const result = hitTestPoint(obj, 200, 200);
    expect(result).toBe(false);
  });

  it('returns false if object is not enabled', () => {
    obj.enabled = false;
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
    invalidateLocalTransform(obj);
    const inside = hitTestPoint(obj, 150, 150);
    const outside = hitTestPoint(obj, 50, 50);

    expect(inside).toBe(true);
    expect(outside).toBe(false);
  });

  it('works with the default shapeFlag param', () => {
    const result = hitTestPoint(obj, 50, 50);
    expect(result).toBe(true);

    const resultExplicit = hitTestPoint(obj, 50, 50, true);
    expect(resultExplicit).toBe(true);
  });

  it('returns true when a child is hit even if the parent has no opaqueBackground', () => {
    obj.opaqueBackground = null;

    const child = createDisplayObject();
    child.opaqueBackground = 0xff0000;
    rectangle.setTo(getLocalBoundsRect(child), 0, 0, 100, 100);
    addChild(obj, child);

    expect(hitTestPoint(obj, 50, 50)).toBe(true);
  });

  it('does not test children of a disabled parent', () => {
    obj.enabled = false;

    const child = createDisplayObject();
    child.opaqueBackground = 0xff0000;
    rectangle.setTo(getLocalBoundsRect(child), 0, 0, 100, 100);
    addChild(obj, child);

    expect(hitTestPoint(obj, 50, 50)).toBe(false);
  });

  it('uses a registered handler for a custom kind', () => {
    const CustomKind = Symbol('CustomKind');
    registerHitTestPoint(CustomKind, () => true);
    const custom = createDisplayObjectGeneric(CustomKind);

    expect(hitTestPoint(custom, 50, 50)).toBe(true);
  });
});
