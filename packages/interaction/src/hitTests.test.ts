import { createDisplayObject, createDisplayObjectGeneric, getDisplayObjectRuntime } from '@flighthq/displayobject';
import { createRectangle, setRectangle } from '@flighthq/geometry';
import { addNodeChild, getNodeLocalBoundsRectangle, invalidateNodeLocalTransform } from '@flighthq/node';
import { appendPathRectangle, createPath } from '@flighthq/path';
import type { DisplayObject, DisplayObjectRuntime, HitTestResult } from '@flighthq/types';
import { DisplayObjectKind } from '@flighthq/types';

import {
  findGraphHitTarget,
  findGraphHitTargetDetailed,
  hitTestDisplayObjects,
  hitTestGraphLocalBounds,
  hitTestGraphPoint,
  hitTestNodeRegion,
  registerHitTestDetailed,
  registerHitTestPoint,
} from './hitTests';
import { setNodeHitArea, setNodeHitTestEnabled } from './nodeInteractionState';

function boundsObject(w: number, h: number): DisplayObject {
  const obj = createDisplayObject();
  setRectangle(getNodeLocalBoundsRectangle(obj), 0, 0, w, h);
  setNodeHitTestEnabled(obj, true);
  return obj;
}

function emptyResult(node: DisplayObject): HitTestResult {
  return { localX: 0, localY: 0, node, subIndex: -2 };
}

describe('findGraphHitTarget', () => {
  it('returns null when node is disabled', () => {
    const obj = boundsObject(100, 100);
    obj.enabled = false;
    registerHitTestPoint(DisplayObjectKind, hitTestGraphLocalBounds);
    expect(findGraphHitTarget(obj, 50, 50)).toBeNull();
  });

  it('is not a candidate until it opts in, then is', () => {
    const obj = createDisplayObject();
    setRectangle(getNodeLocalBoundsRectangle(obj), 0, 0, 100, 100);
    registerHitTestPoint(DisplayObjectKind, hitTestGraphLocalBounds);
    expect(findGraphHitTarget(obj, 50, 50)).toBeNull();
    setNodeHitTestEnabled(obj, true);
    expect(findGraphHitTarget(obj, 50, 50)).toBe(obj);
    setNodeHitTestEnabled(obj, false);
    expect(findGraphHitTarget(obj, 50, 50)).toBeNull();
  });

  it('descends into an un-opted-in parent to reach an opted-in child', () => {
    const parent = createDisplayObject();
    const child = boundsObject(100, 100);
    addNodeChild(parent, child);
    registerHitTestPoint(DisplayObjectKind, hitTestGraphLocalBounds);
    expect(findGraphHitTarget(parent, 50, 50)).toBe(child);
  });

  it('treats a hitArea node as an atomic unit that consumes and hides its children', () => {
    const parent = boundsObject(200, 200);
    const child = boundsObject(50, 50);
    addNodeChild(parent, child);
    registerHitTestPoint(DisplayObjectKind, hitTestGraphLocalBounds);
    setNodeHitArea(parent, 'bounds');
    // The child sits inside the parent, but the atomic parent is what resolves.
    expect(findGraphHitTarget(parent, 25, 25)).toBe(parent);
  });

  it('resolves a rectangle hitArea in the node local space', () => {
    const obj = createDisplayObject();
    setNodeHitTestEnabled(obj, true);
    setNodeHitArea(obj, createRectangle(0, 0, 30, 30));
    expect(findGraphHitTarget(obj, 10, 10)).toBe(obj);
    expect(findGraphHitTarget(obj, 40, 40)).toBeNull();
  });

  it('resolves a rectangle hitArea through the node world transform', () => {
    const obj = createDisplayObject();
    obj.x = 40;
    obj.y = 40;
    invalidateNodeLocalTransform(obj);
    setNodeHitTestEnabled(obj, true);
    setNodeHitArea(obj, createRectangle(0, 0, 100, 100));
    // Local (0,0,100,100) offset by the node position → world (40,40)-(140,140).
    expect(findGraphHitTarget(obj, 50, 50)).toBe(obj);
    expect(findGraphHitTarget(obj, 20, 20)).toBeNull();
  });

  it('resolves a path hitArea by winding in the node local space', () => {
    const obj = createDisplayObject();
    setNodeHitTestEnabled(obj, true);
    const path = createPath();
    appendPathRectangle(path, 0, 0, 30, 30);
    setNodeHitArea(obj, path);
    expect(findGraphHitTarget(obj, 10, 10)).toBe(obj);
    expect(findGraphHitTarget(obj, 40, 40)).toBeNull();
  });

  it('resolves a node hitArea proxy in the proxy world space', () => {
    const obj = createDisplayObject();
    const proxy = createDisplayObjectGeneric(DisplayObjectKind);
    setRectangle(getNodeLocalBoundsRectangle(proxy), 0, 0, 20, 20);
    registerHitTestPoint(DisplayObjectKind, hitTestGraphLocalBounds);
    setNodeHitTestEnabled(obj, true);
    setNodeHitArea(obj, proxy);
    expect(findGraphHitTarget(obj, 5, 5)).toBe(obj);
    expect(findGraphHitTarget(obj, 50, 50)).toBeNull();
  });
});

describe('findGraphHitTargetDetailed', () => {
  beforeAll(() => {
    registerHitTestPoint(DisplayObjectKind, hitTestGraphLocalBounds);
  });

  it('returns null when nothing is hit', () => {
    const obj = boundsObject(100, 100);
    expect(findGraphHitTargetDetailed(obj, 500, 500, emptyResult(obj))).toBeNull();
  });

  it('fills the node and local coordinates', () => {
    const obj = createDisplayObject();
    obj.x = 40;
    obj.y = 40;
    invalidateNodeLocalTransform(obj);
    setRectangle(getNodeLocalBoundsRectangle(obj), 0, 0, 100, 100);
    setNodeHitTestEnabled(obj, true);
    const out = emptyResult(obj);
    const result = findGraphHitTargetDetailed(obj, 50, 50, out);
    expect(result).toBe(out);
    expect(out.node).toBe(obj);
    expect(out.localX).toBe(10);
    expect(out.localY).toBe(10);
  });

  it('pierces an atomic hitArea unit to report the real child', () => {
    const parent = boundsObject(200, 200);
    const child = boundsObject(50, 50);
    addNodeChild(parent, child);
    setNodeHitArea(parent, 'bounds');
    // Tier-1 would stop at the parent; the detailed refine descends to the child.
    const out = emptyResult(parent);
    findGraphHitTargetDetailed(parent, 25, 25, out);
    expect(out.node).toBe(child);
  });

  it('resolves a sub-index from a registered detailed handler', () => {
    const kind = 'DetailedSubIndexKind';
    const node = createDisplayObjectGeneric(kind);
    setRectangle(getNodeLocalBoundsRectangle(node), 0, 0, 100, 100);
    setNodeHitTestEnabled(node, true);
    registerHitTestPoint(kind, hitTestGraphLocalBounds);
    registerHitTestDetailed(kind, () => 7);
    const out = emptyResult(node);
    findGraphHitTargetDetailed(node, 10, 10, out);
    expect(out.node).toBe(node);
    expect(out.subIndex).toBe(7);
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
    expect(hitTestDisplayObjects(a, b)).toBe(true);
  });

  it('returns false when bounds do not intersect', () => {
    b.x = 20;
    b.y = 20;
    invalidateNodeLocalTransform(b);
    expect(hitTestDisplayObjects(a, b)).toBe(false);
  });

  it('returns false if either object has no parent', () => {
    (getDisplayObjectRuntime(b) as DisplayObjectRuntime).parent = null;
    expect(hitTestDisplayObjects(a, b)).toBe(false);
  });

  it('compares bounds in world space', () => {
    b.x = 5;
    b.y = 5;
    invalidateNodeLocalTransform(b);
    expect(hitTestDisplayObjects(a, b)).toBe(true);
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
    obj = boundsObject(100, 100);
  });

  it('returns true for point inside bounds', () => {
    expect(hitTestGraphPoint(obj, 50, 50)).toBe(true);
  });

  it('returns false for point outside bounds', () => {
    expect(hitTestGraphPoint(obj, 200, 200)).toBe(false);
  });

  it('returns false for a node that has not opted in', () => {
    const other = createDisplayObject();
    setRectangle(getNodeLocalBoundsRectangle(other), 0, 0, 100, 100);
    expect(hitTestGraphPoint(other, 50, 50)).toBe(false);
  });

  it('returns false if object is not enabled', () => {
    obj.enabled = false;
    expect(hitTestGraphPoint(obj, 50, 50)).toBe(false);
  });

  it('respects world transform', () => {
    obj.x = 100;
    obj.y = 100;
    invalidateNodeLocalTransform(obj);
    expect(hitTestGraphPoint(obj, 150, 150)).toBe(true);
    expect(hitTestGraphPoint(obj, 50, 50)).toBe(false);
  });

  it('works with the default shapeFlag param', () => {
    expect(hitTestGraphPoint(obj, 50, 50)).toBe(true);
    expect(hitTestGraphPoint(obj, 50, 50, true)).toBe(true);
  });

  it('returns true when an opted-in child is hit even if the parent is inert', () => {
    const parent = createDisplayObject();
    const child = boundsObject(100, 100);
    addNodeChild(parent, child);
    expect(hitTestGraphPoint(parent, 50, 50)).toBe(true);
  });

  it('does not test children of a disabled parent', () => {
    const parent = createDisplayObject();
    parent.enabled = false;
    const child = boundsObject(100, 100);
    addNodeChild(parent, child);
    expect(hitTestGraphPoint(parent, 50, 50)).toBe(false);
  });

  it('uses a registered handler for a custom kind', () => {
    const CustomKind = 'CustomKindHitPoint';
    registerHitTestPoint(CustomKind, () => true);
    const custom = createDisplayObjectGeneric(CustomKind);
    setNodeHitTestEnabled(custom, true);
    expect(hitTestGraphPoint(custom, 50, 50)).toBe(true);
  });
});

describe('hitTestNodeRegion', () => {
  beforeAll(() => {
    registerHitTestPoint(DisplayObjectKind, hitTestGraphLocalBounds);
  });

  it('tests a node kind geometry, ignoring eligibility and children', () => {
    const obj = createDisplayObject();
    setRectangle(getNodeLocalBoundsRectangle(obj), 0, 0, 100, 100);
    // No opt-in required — hitTestNodeRegion is the precise per-node test the broadphase calls.
    expect(hitTestNodeRegion(obj, 50, 50)).toBe(true);
    expect(hitTestNodeRegion(obj, 200, 200)).toBe(false);
  });

  it('uses the hitArea when one is set', () => {
    const obj = createDisplayObject();
    setNodeHitArea(obj, createRectangle(0, 0, 30, 30));
    expect(hitTestNodeRegion(obj, 10, 10)).toBe(true);
    expect(hitTestNodeRegion(obj, 40, 40)).toBe(false);
  });
});

describe('registerHitTestDetailed', () => {
  it('registers a sub-index resolver used by findGraphHitTargetDetailed', () => {
    const kind = 'RegisterDetailedTest';
    registerHitTestPoint(kind, () => true);
    registerHitTestDetailed(kind, () => 3);
    const node = createDisplayObjectGeneric(kind);
    setNodeHitTestEnabled(node, true);
    const out = emptyResult(node);
    findGraphHitTargetDetailed(node, 0, 0, out);
    expect(out.subIndex).toBe(3);
  });
});

describe('registerHitTestPoint', () => {
  it('registers a handler that hitTestGraphPoint will use', () => {
    const kind = 'RegisterTest';
    registerHitTestPoint(kind, () => true);
    const node = createDisplayObjectGeneric(kind);
    setNodeHitTestEnabled(node, true);
    expect(hitTestGraphPoint(node, 0, 0)).toBe(true);
  });
});
