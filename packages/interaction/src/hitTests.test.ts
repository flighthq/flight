import { createDisplayObject, createDisplayObjectGeneric, getDisplayObjectRuntime } from '@flighthq/displayobject';
import { createRectangle, setRectangle } from '@flighthq/geometry';
import { addNodeChild, getNodeLocalBoundsRectangle, invalidateNodeLocalTransform } from '@flighthq/node';
import { appendPathRectangle, createPath } from '@flighthq/path';
import type { DisplayObject, DisplayObjectRuntime, HitTestResult, NodeAny } from '@flighthq/types';
import { DisplayObjectKind } from '@flighthq/types';

import {
  describeGraphHit,
  findGraphHitTarget,
  findGraphHitTargetPrecise,
  findGraphHitTargets,
  findGraphHitTargetsPrecise,
  hitTestDisplayObjects,
  hitTestGraphLocalBounds,
  hitTestGraphPoint,
  hitTestGraphPointPrecise,
  hitTestNodeRegion,
  registerHitTest,
  registerHitTestPrecise,
} from './hitTests';
import { setNodeHitArea, setNodeHitTestEnabled } from './nodeInteractionState';

// A precise provider over local bounds: 0 (hit) inside, -1 outside — the boolean-precise shape.
function boundsPrecise(source: NodeAny, x: number, y: number): number {
  return hitTestGraphLocalBounds(source, x, y) ? 0 : -1;
}

function boundsObject(w: number, h: number): DisplayObject {
  const obj = createDisplayObject();
  setRectangle(getNodeLocalBoundsRectangle(obj), 0, 0, w, h);
  setNodeHitTestEnabled(obj, true);
  return obj;
}

function emptyResult(node: DisplayObject): HitTestResult {
  return { localX: 0, localY: 0, node, subIndex: -2 };
}

beforeAll(() => {
  registerHitTest(DisplayObjectKind, hitTestGraphLocalBounds);
});

describe('describeGraphHit', () => {
  it('fills node, local coordinates, and the sub-index from the kind exact provider', () => {
    const kind = 'DescribeKind';
    const node = createDisplayObjectGeneric(kind);
    node.x = 40;
    node.y = 40;
    invalidateNodeLocalTransform(node);
    setRectangle(getNodeLocalBoundsRectangle(node), 0, 0, 100, 100);
    registerHitTestPrecise(kind, () => 7);
    const out = emptyResult(node);
    describeGraphHit(node, 50, 50, out);
    expect(out.node).toBe(node);
    expect(out.localX).toBe(10);
    expect(out.localY).toBe(10);
    expect(out.subIndex).toBe(7);
  });

  it('reports subIndex -1 when the kind has no exact provider', () => {
    const obj = boundsObject(100, 100);
    const out = emptyResult(obj);
    describeGraphHit(obj, 50, 50, out);
    expect(out.subIndex).toBe(-1);
  });
});

describe('findGraphHitTarget', () => {
  it('returns null when node is disabled', () => {
    const obj = boundsObject(100, 100);
    obj.enabled = false;
    expect(findGraphHitTarget(obj, 50, 50)).toBeNull();
  });

  it('is not a candidate until it opts in, then is', () => {
    const obj = createDisplayObject();
    setRectangle(getNodeLocalBoundsRectangle(obj), 0, 0, 100, 100);
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
    expect(findGraphHitTarget(parent, 50, 50)).toBe(child);
  });

  it('treats a hitArea node as an atomic unit that consumes and hides its children', () => {
    const parent = boundsObject(200, 200);
    const child = boundsObject(50, 50);
    addNodeChild(parent, child);
    setNodeHitArea(parent, 'bounds');
    expect(findGraphHitTarget(parent, 25, 25)).toBe(parent);
  });

  it('resolves a rectangle hitArea in the node local space, through the world transform', () => {
    const obj = createDisplayObject();
    obj.x = 40;
    obj.y = 40;
    invalidateNodeLocalTransform(obj);
    setNodeHitTestEnabled(obj, true);
    setNodeHitArea(obj, createRectangle(0, 0, 100, 100));
    expect(findGraphHitTarget(obj, 50, 50)).toBe(obj);
    expect(findGraphHitTarget(obj, 20, 20)).toBeNull();
  });

  it('resolves a path hitArea by winding, and a node proxy in the proxy world space', () => {
    const pathObj = createDisplayObject();
    setNodeHitTestEnabled(pathObj, true);
    const path = createPath();
    appendPathRectangle(path, 0, 0, 30, 30);
    setNodeHitArea(pathObj, path);
    expect(findGraphHitTarget(pathObj, 10, 10)).toBe(pathObj);
    expect(findGraphHitTarget(pathObj, 40, 40)).toBeNull();

    const proxyOwner = createDisplayObject();
    const proxy = createDisplayObjectGeneric(DisplayObjectKind);
    setRectangle(getNodeLocalBoundsRectangle(proxy), 0, 0, 20, 20);
    setNodeHitTestEnabled(proxyOwner, true);
    setNodeHitArea(proxyOwner, proxy);
    expect(findGraphHitTarget(proxyOwner, 5, 5)).toBe(proxyOwner);
    expect(findGraphHitTarget(proxyOwner, 50, 50)).toBeNull();
  });
});

describe('findGraphHitTargetPrecise', () => {
  it('uses the kind exact provider, so a bbox hit off the real geometry misses', () => {
    const kind = 'PreciseFirstKind';
    const node = createDisplayObjectGeneric(kind);
    setRectangle(getNodeLocalBoundsRectangle(node), 0, 0, 100, 100);
    setNodeHitTestEnabled(node, true);
    // Exact provider only accepts the left half.
    registerHitTestPrecise(kind, (s, x, y) => (hitTestGraphLocalBounds(s, x, y) && x < 50 ? 0 : -1));
    registerHitTest(kind, hitTestGraphLocalBounds);
    expect(findGraphHitTargetPrecise(node, 25, 50)).toBe(node);
    expect(findGraphHitTargetPrecise(node, 75, 50)).toBeNull();
    // Coarse still hits the whole box.
    expect(findGraphHitTarget(node, 75, 50)).toBe(node);
  });

  it('falls back to the coarse bounds handler when no exact provider is registered', () => {
    const obj = boundsObject(100, 100);
    expect(findGraphHitTargetPrecise(obj, 50, 50)).toBe(obj);
  });
});

describe('findGraphHitTargets', () => {
  it('collects every hit under the point, front-to-back', () => {
    const root = createDisplayObject();
    const under = boundsObject(100, 100);
    const over = boundsObject(100, 100);
    addNodeChild(root, under);
    addNodeChild(root, over);
    const stack = findGraphHitTargets(root, 50, 50);
    expect(stack).toEqual([over, under]);
  });

  it('clears the out array and returns it', () => {
    const obj = boundsObject(100, 100);
    const out: DisplayObject[] = [createDisplayObject()];
    const result = findGraphHitTargets(obj, 50, 50, out);
    expect(result).toBe(out);
    expect(out).toEqual([obj]);
  });
});

describe('findGraphHitTargetsPrecise', () => {
  it('collects hits using exact geometry per kind', () => {
    const kind = 'PreciseStackKind';
    registerHitTest(kind, hitTestGraphLocalBounds);
    registerHitTestPrecise(kind, boundsPrecise);
    const root = createDisplayObject();
    const a = createDisplayObjectGeneric(kind);
    setRectangle(getNodeLocalBoundsRectangle(a), 0, 0, 100, 100);
    setNodeHitTestEnabled(a, true);
    addNodeChild(root, a);
    expect(findGraphHitTargetsPrecise(root, 50, 50)).toEqual([a]);
    expect(findGraphHitTargetsPrecise(root, 500, 500)).toEqual([]);
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
  it('returns whether a world-space point is inside local bounds', () => {
    const obj = createDisplayObject();
    setRectangle(getNodeLocalBoundsRectangle(obj), 0, 0, 100, 100);
    expect(hitTestGraphLocalBounds(obj, 50, 50)).toBe(true);
    expect(hitTestGraphLocalBounds(obj, 200, 200)).toBe(false);
  });
});

describe('hitTestGraphPoint', () => {
  let obj: DisplayObject;

  beforeEach(() => {
    obj = boundsObject(100, 100);
  });

  it('returns true for point inside bounds, false outside', () => {
    expect(hitTestGraphPoint(obj, 50, 50)).toBe(true);
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
});

describe('hitTestGraphPointPrecise', () => {
  it('uses exact geometry, so a bbox hit off the real geometry misses', () => {
    const kind = 'PreciseAnyKind';
    const node = createDisplayObjectGeneric(kind);
    setRectangle(getNodeLocalBoundsRectangle(node), 0, 0, 100, 100);
    setNodeHitTestEnabled(node, true);
    registerHitTestPrecise(kind, (s, x, y) => (hitTestGraphLocalBounds(s, x, y) && x < 50 ? 0 : -1));
    expect(hitTestGraphPointPrecise(node, 25, 50)).toBe(true);
    expect(hitTestGraphPointPrecise(node, 75, 50)).toBe(false);
  });
});

describe('hitTestNodeRegion', () => {
  it('tests a node kind geometry, ignoring eligibility and children', () => {
    const obj = createDisplayObject();
    setRectangle(getNodeLocalBoundsRectangle(obj), 0, 0, 100, 100);
    expect(hitTestNodeRegion(obj, 50, 50)).toBe(true);
    expect(hitTestNodeRegion(obj, 200, 200)).toBe(false);
  });

  it('uses the hitArea when one is set', () => {
    const obj = createDisplayObject();
    setNodeHitArea(obj, createRectangle(0, 0, 30, 30));
    expect(hitTestNodeRegion(obj, 10, 10)).toBe(true);
    expect(hitTestNodeRegion(obj, 40, 40)).toBe(false);
  });

  it('uses the exact provider when precise', () => {
    const kind = 'RegionPreciseKind';
    const node = createDisplayObjectGeneric(kind);
    setRectangle(getNodeLocalBoundsRectangle(node), 0, 0, 100, 100);
    registerHitTestPrecise(kind, (s, x, y) => (hitTestGraphLocalBounds(s, x, y) && x < 50 ? 0 : -1));
    expect(hitTestNodeRegion(node, 25, 50, true)).toBe(true);
    expect(hitTestNodeRegion(node, 75, 50, true)).toBe(false);
  });
});

describe('registerHitTest', () => {
  it('registers a coarse handler that hitTestGraphPoint will use', () => {
    const kind = 'RegisterTest';
    registerHitTest(kind, () => true);
    const node = createDisplayObjectGeneric(kind);
    setNodeHitTestEnabled(node, true);
    expect(hitTestGraphPoint(node, 0, 0)).toBe(true);
  });
});

describe('registerHitTestPrecise', () => {
  it('registers an exact provider used by the precise queries and describeGraphHit', () => {
    const kind = 'RegisterPreciseTest';
    registerHitTest(kind, () => true);
    registerHitTestPrecise(kind, () => 3);
    const node = createDisplayObjectGeneric(kind);
    setNodeHitTestEnabled(node, true);
    expect(findGraphHitTargetPrecise(node, 0, 0)).toBe(node);
    const out = emptyResult(node);
    describeGraphHit(node, 0, 0, out);
    expect(out.subIndex).toBe(3);
  });
});
