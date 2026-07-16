import { createDisplayObject, createDisplayObjectGeneric, getDisplayObjectRuntime } from '@flighthq/displayobject';
import { createRectangle, setRectangle } from '@flighthq/geometry';
import { addNodeChild, getNodeLocalBoundsRectangle, invalidateNodeLocalTransform } from '@flighthq/node';
import type { DisplayObject, DisplayObjectRuntime } from '@flighthq/types';
import { DisplayObjectKind } from '@flighthq/types';

import {
  findGraphHitTarget,
  hitTestDisplayObjects,
  hitTestGraphLocalBounds,
  hitTestGraphPoint,
  registerHitTestPoint,
} from './hitTests';
import { setNodeHitArea, setNodeHitTestChildren, setNodeHitTestEnabled } from './nodeInteractionState';

describe('findGraphHitTarget', () => {
  it('returns null when node is disabled', () => {
    const obj = createDisplayObject();
    obj.enabled = false;
    expect(findGraphHitTarget(obj, 50, 50)).toBeNull();
  });

  it('returns a child node registered with a hit handler', () => {
    const parent = createDisplayObject();
    const child = createDisplayObjectGeneric(DisplayObjectKind);
    setRectangle(getNodeLocalBoundsRectangle(child), 0, 0, 100, 100);
    addNodeChild(parent, child);
    registerHitTestPoint(DisplayObjectKind, hitTestGraphLocalBounds);
    const hit = findGraphHitTarget(parent, 50, 50);
    expect(hit).toBe(child);
  });

  it('excludes self from hits when hitTestEnabled is false', () => {
    const obj = createDisplayObject();
    setRectangle(getNodeLocalBoundsRectangle(obj), 0, 0, 100, 100);
    registerHitTestPoint(DisplayObjectKind, hitTestGraphLocalBounds);
    expect(findGraphHitTarget(obj, 50, 50)).toBe(obj);
    setNodeHitTestEnabled(obj, false);
    expect(findGraphHitTarget(obj, 50, 50)).toBeNull();
  });

  it('does not descend into the subtree when hitTestChildren is false', () => {
    const parent = createDisplayObject();
    const child = createDisplayObjectGeneric(DisplayObjectKind);
    setRectangle(getNodeLocalBoundsRectangle(child), 0, 0, 100, 100);
    addNodeChild(parent, child);
    registerHitTestPoint(DisplayObjectKind, hitTestGraphLocalBounds);
    setNodeHitTestChildren(parent, false);
    expect(findGraphHitTarget(parent, 50, 50)).toBeNull();
  });

  it('delegates a rectangle hitArea proxy using world-space containment', () => {
    const obj = createDisplayObject();
    registerHitTestPoint(DisplayObjectKind, hitTestGraphLocalBounds);
    setNodeHitArea(obj, createRectangle(0, 0, 30, 30));
    expect(findGraphHitTarget(obj, 10, 10)).toBe(obj);
    expect(findGraphHitTarget(obj, 40, 40)).toBeNull();
  });

  it('delegates a node hitArea proxy through that node hit function', () => {
    const obj = createDisplayObject();
    const proxy = createDisplayObjectGeneric(DisplayObjectKind);
    setRectangle(getNodeLocalBoundsRectangle(proxy), 0, 0, 20, 20);
    registerHitTestPoint(DisplayObjectKind, hitTestGraphLocalBounds);
    setNodeHitArea(obj, proxy);
    expect(findGraphHitTarget(obj, 5, 5)).toBe(obj);
    expect(findGraphHitTarget(obj, 50, 50)).toBeNull();
  });
});

describe('hitTestDisplayObjects', () => {
  let a: DisplayObject;
  let b: DisplayObject;

  beforeEach(() => {
    a = createDisplayObject();
    b = createDisplayObject();

    addNodeChild(createDisplayObject(), a);
    addNodeChild(createDisplayObject(), b);

    setRectangle(getNodeLocalBoundsRectangle(a), 0, 0, 10, 10);
    setRectangle(getNodeLocalBoundsRectangle(b), 0, 0, 10, 10);

    a.x = 0;
    a.y = 0;
    b.x = 5;
    b.y = 5;

    a.scaleX = a.scaleY = 1;
    b.scaleX = b.scaleY = 1;
  });

  it('returns true when bounds intersect', () => {
    const result = hitTestDisplayObjects(a, b);
    expect(result).toBe(true);
  });

  it('returns false when bounds do not intersect', () => {
    b.x = 20;
    b.y = 20;
    invalidateNodeLocalTransform(b);

    const result = hitTestDisplayObjects(a, b);
    expect(result).toBe(false);
  });

  it('returns false if either object has no parent', () => {
    (getDisplayObjectRuntime(b) as DisplayObjectRuntime).parent = null;

    const result = hitTestDisplayObjects(a, b);
    expect(result).toBe(false);
  });

  it('compares bounds in world space', () => {
    a.scaleX = 1;
    a.scaleY = 1;

    b.x = 5;
    b.y = 5;
    invalidateNodeLocalTransform(b);

    const result = hitTestDisplayObjects(a, b);
    expect(result).toBe(true);
  });

  it('includes child bounds when a child extends beyond the object local bounds', () => {
    const child = createDisplayObject();
    child.x = 90;
    child.y = 90;
    invalidateNodeLocalTransform(child);
    setRectangle(getNodeLocalBoundsRectangle(child), 0, 0, 20, 20);
    addNodeChild(a, child);

    b.x = 100;
    b.y = 100;
    invalidateNodeLocalTransform(b);

    expect(hitTestDisplayObjects(a, b)).toBe(true);
  });
});

describe('hitTestGraphLocalBounds', () => {
  it('returns true when world-space point is inside local bounds', () => {
    const obj = createDisplayObject();
    setRectangle(getNodeLocalBoundsRectangle(obj), 0, 0, 100, 100);
    expect(hitTestGraphLocalBounds(obj, 50, 50)).toBe(true);
  });

  it('returns false when world-space point is outside local bounds', () => {
    const obj = createDisplayObject();
    setRectangle(getNodeLocalBoundsRectangle(obj), 0, 0, 100, 100);
    expect(hitTestGraphLocalBounds(obj, 200, 200)).toBe(false);
  });
});

describe('hitTestGraphPoint', () => {
  let obj: DisplayObject;

  beforeAll(() => {
    registerHitTestPoint(DisplayObjectKind, hitTestGraphLocalBounds);
  });

  beforeEach(() => {
    obj = createDisplayObject();
    setRectangle(getNodeLocalBoundsRectangle(obj), 0, 0, 100, 100);
  });

  it('returns true for point inside bounds', () => {
    const result = hitTestGraphPoint(obj, 50, 50);
    expect(result).toBe(true);
  });

  it('returns false for point outside bounds', () => {
    const result = hitTestGraphPoint(obj, 200, 200);
    expect(result).toBe(false);
  });

  it('returns false if object is not enabled', () => {
    obj.enabled = false;
    const result = hitTestGraphPoint(obj, 50, 50);
    expect(result).toBe(false);
  });

  it('returns false when point is outside bounds', () => {
    const result = hitTestGraphPoint(obj, 200, 200);
    expect(result).toBe(false);
  });

  it('respects world transform', () => {
    obj.x = 100;
    obj.y = 100;
    invalidateNodeLocalTransform(obj);
    const inside = hitTestGraphPoint(obj, 150, 150);
    const outside = hitTestGraphPoint(obj, 50, 50);

    expect(inside).toBe(true);
    expect(outside).toBe(false);
  });

  it('works with the default shapeFlag param', () => {
    const result = hitTestGraphPoint(obj, 50, 50);
    expect(result).toBe(true);

    const resultExplicit = hitTestGraphPoint(obj, 50, 50, true);
    expect(resultExplicit).toBe(true);
  });

  it('returns true when a child is hit even if the parent has no local bounds', () => {
    const child = createDisplayObject();
    setRectangle(getNodeLocalBoundsRectangle(child), 0, 0, 100, 100);
    addNodeChild(obj, child);

    setRectangle(getNodeLocalBoundsRectangle(obj), 0, 0, 0, 0);
    expect(hitTestGraphPoint(obj, 50, 50)).toBe(true);
  });

  it('does not test children of a disabled parent', () => {
    obj.enabled = false;

    const child = createDisplayObject();
    setRectangle(getNodeLocalBoundsRectangle(child), 0, 0, 100, 100);
    addNodeChild(obj, child);

    expect(hitTestGraphPoint(obj, 50, 50)).toBe(false);
  });

  it('uses a registered handler for a custom kind', () => {
    const CustomKind = 'CustomKind';
    registerHitTestPoint(CustomKind, () => true);
    const custom = createDisplayObjectGeneric(CustomKind);

    expect(hitTestGraphPoint(custom, 50, 50)).toBe(true);
  });
});

describe('registerHitTestPoint', () => {
  it('registers a handler that hitTestGraphPoint will use', () => {
    const kind = 'RegisterTest';
    registerHitTestPoint(kind, () => true);
    const node = createDisplayObjectGeneric(kind);
    expect(hitTestGraphPoint(node, 0, 0)).toBe(true);
  });
});
