import { createDisplayObject, createDisplayObjectGeneric, getDisplayObjectRuntime } from '@flighthq/displayobject';
import { setRectangle } from '@flighthq/geometry';
import { addSceneChild, getLocalBoundsRectangle, invalidateLocalTransform } from '@flighthq/node';
import type { DisplayObject, DisplayObjectRuntime } from '@flighthq/types';
import { DisplayObjectKind } from '@flighthq/types';

import {
  findGraphHitTarget,
  graphHitTestLocalBounds,
  graphHitTestPoint,
  hitTestDisplayObjects,
  registerHitTestPoint,
} from './hitTests';

describe('findGraphHitTarget', () => {
  it('returns null when node is disabled', () => {
    const obj = createDisplayObject();
    obj.enabled = false;
    expect(findGraphHitTarget(obj, 50, 50)).toBeNull();
  });

  it('returns a child node registered with a hit handler', () => {
    const parent = createDisplayObject();
    const child = createDisplayObjectGeneric(DisplayObjectKind);
    setRectangle(getLocalBoundsRectangle(child), 0, 0, 100, 100);
    addSceneChild(parent, child);
    registerHitTestPoint(DisplayObjectKind, graphHitTestLocalBounds);
    const hit = findGraphHitTarget(parent, 50, 50);
    expect(hit).toBe(child);
  });
});

describe('graphHitTestLocalBounds', () => {
  it('returns true when world-space point is inside local bounds', () => {
    const obj = createDisplayObject();
    setRectangle(getLocalBoundsRectangle(obj), 0, 0, 100, 100);
    expect(graphHitTestLocalBounds(obj, 50, 50)).toBe(true);
  });

  it('returns false when world-space point is outside local bounds', () => {
    const obj = createDisplayObject();
    setRectangle(getLocalBoundsRectangle(obj), 0, 0, 100, 100);
    expect(graphHitTestLocalBounds(obj, 200, 200)).toBe(false);
  });
});

describe('graphHitTestPoint', () => {
  let obj: DisplayObject;

  beforeAll(() => {
    registerHitTestPoint(DisplayObjectKind, graphHitTestLocalBounds);
  });

  beforeEach(() => {
    obj = createDisplayObject();
    setRectangle(getLocalBoundsRectangle(obj), 0, 0, 100, 100);
  });

  it('returns true for point inside bounds', () => {
    const result = graphHitTestPoint(obj, 50, 50);
    expect(result).toBe(true);
  });

  it('returns false for point outside bounds', () => {
    const result = graphHitTestPoint(obj, 200, 200);
    expect(result).toBe(false);
  });

  it('returns false if object is not enabled', () => {
    obj.enabled = false;
    const result = graphHitTestPoint(obj, 50, 50);
    expect(result).toBe(false);
  });

  it('returns false when point is outside bounds', () => {
    const result = graphHitTestPoint(obj, 200, 200);
    expect(result).toBe(false);
  });

  it('respects world transform', () => {
    obj.x = 100;
    obj.y = 100;
    invalidateLocalTransform(obj);
    const inside = graphHitTestPoint(obj, 150, 150);
    const outside = graphHitTestPoint(obj, 50, 50);

    expect(inside).toBe(true);
    expect(outside).toBe(false);
  });

  it('works with the default shapeFlag param', () => {
    const result = graphHitTestPoint(obj, 50, 50);
    expect(result).toBe(true);

    const resultExplicit = graphHitTestPoint(obj, 50, 50, true);
    expect(resultExplicit).toBe(true);
  });

  it('returns true when a child is hit even if the parent has no local bounds', () => {
    const child = createDisplayObject();
    setRectangle(getLocalBoundsRectangle(child), 0, 0, 100, 100);
    addSceneChild(obj, child);

    setRectangle(getLocalBoundsRectangle(obj), 0, 0, 0, 0);
    expect(graphHitTestPoint(obj, 50, 50)).toBe(true);
  });

  it('does not test children of a disabled parent', () => {
    obj.enabled = false;

    const child = createDisplayObject();
    setRectangle(getLocalBoundsRectangle(child), 0, 0, 100, 100);
    addSceneChild(obj, child);

    expect(graphHitTestPoint(obj, 50, 50)).toBe(false);
  });

  it('uses a registered handler for a custom kind', () => {
    const CustomKind = Symbol('CustomKind');
    registerHitTestPoint(CustomKind, () => true);
    const custom = createDisplayObjectGeneric(CustomKind);

    expect(graphHitTestPoint(custom, 50, 50)).toBe(true);
  });
});

describe('hitTestDisplayObjects', () => {
  let a: DisplayObject;
  let b: DisplayObject;

  beforeEach(() => {
    a = createDisplayObject();
    b = createDisplayObject();

    addSceneChild(createDisplayObject(), a);
    addSceneChild(createDisplayObject(), b);

    setRectangle(getLocalBoundsRectangle(a), 0, 0, 10, 10);
    setRectangle(getLocalBoundsRectangle(b), 0, 0, 10, 10);

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
    invalidateLocalTransform(b);

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
    invalidateLocalTransform(b);

    const result = hitTestDisplayObjects(a, b);
    expect(result).toBe(true);
  });

  it('includes child bounds when a child extends beyond the object local bounds', () => {
    const child = createDisplayObject();
    child.x = 90;
    child.y = 90;
    invalidateLocalTransform(child);
    setRectangle(getLocalBoundsRectangle(child), 0, 0, 20, 20);
    addSceneChild(a, child);

    b.x = 100;
    b.y = 100;
    invalidateLocalTransform(b);

    expect(hitTestDisplayObjects(a, b)).toBe(true);
  });
});

describe('registerHitTestPoint', () => {
  it('registers a handler that graphHitTestPoint will use', () => {
    const kind = Symbol('RegisterTest');
    registerHitTestPoint(kind, () => true);
    const node = createDisplayObjectGeneric(kind);
    expect(graphHitTestPoint(node, 0, 0)).toBe(true);
  });
});
