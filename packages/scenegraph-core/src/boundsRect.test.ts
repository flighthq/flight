import { getEntityRuntime as _getRuntime } from '@flighthq/entity';
import {
  cloneRectangle,
  createRectangle,
  equalsRectangle,
  setEmptyRectangle as setEmpty,
  setRectangle,
} from '@flighthq/geometry';
import {
  addGraphChild,
  createGraphNode,
  ensureLocalTransformMatrix,
  initHasTransform,
  initHasTransformRuntime,
  invalidateLocalTransform,
} from '@flighthq/scenegraph-core';
import type {
  GraphNode,
  GraphNodeRuntime,
  HasBoundsRect,
  HasBoundsRectRuntime,
  HasTransform2D,
  HasTransform2DRuntime,
  Rectangle,
} from '@flighthq/types';

import {
  computeBoundsRectangle,
  ensureBoundsRectangle,
  ensureLocalBoundsRectangle,
  ensureWorldBoundsRectangle,
  getBoundsRectangle,
  getLocalBoundsRectangle,
  getScaledBoundsHeight,
  getScaledBoundsWidth,
  getWorldBoundsRectangle,
  setScaledBoundsHeight,
  setScaledBoundsWidth,
} from './boundsRect';
import { initHasBoundsRectangle, initHasBoundsRectangleRuntime } from './hasBoundsRect';

function getEntityRuntime<GraphKind extends symbol>(
  source: TestNode,
): GraphNodeRuntime<GraphKind, HasBoundsRect & HasTransform2D> & HasBoundsRectRuntime {
  return _getRuntime(source) as GraphNodeRuntime<GraphKind, HasBoundsRect & HasTransform2D> & HasBoundsRectRuntime;
}

function createTestNode(): TestNode {
  const node = createGraphNode(TestKind, TestKind) as TestNode;
  const runtime = _getRuntime(node);
  initHasBoundsRectangle(node);
  initHasBoundsRectangleRuntime(runtime as HasBoundsRectRuntime);
  initHasTransform(node);
  initHasTransformRuntime(runtime as HasTransform2DRuntime);
  return node;
}

describe('computeBoundsRectangle', () => {
  let root: TestNode;
  let child: TestNode;
  let grandChild: TestNode;

  beforeEach(() => {
    root = createTestNode();
    child = createTestNode();
    grandChild = createTestNode();

    child.x = 100;
    child.y = 100;

    addGraphChild(root, child);
    addGraphChild(child, grandChild);

    // fake local bounds
    setRectangle(getLocalBoundsRectangle(root), 0, 0, 100, 100);
    setRectangle(getLocalBoundsRectangle(child), 10, 20, 50, 50);
    setRectangle(getLocalBoundsRectangle(grandChild), 5, 5, 100, 100);
  });

  it('should equal local bounds when targetCoordinateSpace is self and there are no children', () => {
    const out = createRectangle();
    computeBoundsRectangle(out, grandChild, grandChild);
    expect(equalsRectangle(out, getLocalBoundsRectangle(grandChild))).toBe(true);
  });

  it('should include children bounds when targetCoordinateSpace is self', () => {
    const out = createRectangle();
    computeBoundsRectangle(out, child, child);
    expect(equalsRectangle(out, { x: 5, y: 5, width: 100, height: 100 })).toBe(true);
  });

  it('should compute bounds relative to parent', () => {
    const out = createRectangle();
    computeBoundsRectangle(out, child, root);
    expect(out.x).toBeCloseTo(105);
    expect(out.y).toBeCloseTo(105);
    expect(out.width).toBeCloseTo(100);
    expect(out.height).toBeCloseTo(100);
  });

  it('should compute bounds relative to nested child', () => {
    const out = createRectangle();
    computeBoundsRectangle(out, root, grandChild);
    expect(out.width).toBeGreaterThan(0);
    expect(out.height).toBeGreaterThan(0);
    // exact numbers depend on transforms
  });

  it('should account for scaling in parent transforms', () => {
    // child is 50x50, should be 100x150 now in parent coordinate space
    child.scaleX = 2;
    child.scaleY = 3;

    const out = createRectangle();
    computeBoundsRectangle(out, child, root);

    expect(out.width).toBeCloseTo(100 * 2);
    expect(out.height).toBeCloseTo(100 * 3);
  });

  it('should account for translation in parent transforms', () => {
    child.x = 5;
    child.y = 7;

    const out = createRectangle();
    computeBoundsRectangle(out, grandChild, root);

    // grandChild localBounds at (5,5) with no scaling
    expect(out.x).toBeCloseTo(5 + 5); // parent offset + grandChild offset
    expect(out.y).toBeCloseTo(7 + 5);
  });

  it('should handle rotation', () => {
    child.rotation = 90;

    const out = createRectangle();
    computeBoundsRectangle(out, child, root);
    expect(out.width).toBeCloseTo(100); // roughly unchanged
    expect(out.height).toBeCloseTo(100);
  });

  it('should allow a rectangle-like object', () => {
    const out = { x: 0, y: 0, width: 0, height: 0 };
    computeBoundsRectangle(out, grandChild, grandChild);
    expect(equalsRectangle(out, getLocalBoundsRectangle(grandChild))).toBe(true);
  });

  it('should compute bounds relative to an unrelated target', () => {
    const out = createRectangle();
    const unrelatedTarget = createTestNode(); // another object in a separate scene graph
    computeBoundsRectangle(out, child, unrelatedTarget);
    expect(equalsRectangle(out, getWorldBoundsRectangle(child))).toBe(true);
  });

  it('should return world bounds if the target coordinate space is root', () => {
    const out = createRectangle();
    computeBoundsRectangle(out, child, root);
    expect(equalsRectangle(out, getWorldBoundsRectangle(child))).toBe(true);
  });
});

describe('ensureBoundsRectangle', () => {
  it('should ensure boundsRect is defined', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    expect(runtime.boundsRect).toBeNull();
    ensureBoundsRectangle(object);
    expect(runtime.boundsRect).not.toBeNull();
  });

  it('should not recalculate if localBoundsID and localTransformID are unchanged', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    ensureBoundsRectangle(object);
    const cache = cloneAndInvalidateRect(runtime.boundsRect!);
    ensureBoundsRectangle(object);
    expect(runtime.boundsRect).not.toEqual(cache);
  });

  it('should recalculate if localBoundsID is changed', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    runtime.computeLocalBoundsRect = (out: Rectangle, _source: GraphNode) => {
      setEmpty(out);
    };
    ensureBoundsRectangle(object);
    const cache = cloneAndInvalidateRect(runtime.boundsRect!);
    runtime.localBoundsID++;
    ensureBoundsRectangle(object);
    expect(equalsRectangle(runtime.boundsRect, cache)).toBe(true);
  });

  it('should recalculate if localTransformID is changed', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    ensureBoundsRectangle(object);
    const cache = cloneAndInvalidateRect(runtime.boundsRect!);
    runtime.localTransformID++;
    ensureBoundsRectangle(object);
    expect(equalsRectangle(runtime.boundsRect, cache)).toBe(true);
  });
});

describe('ensureLocalBoundsRectangle', () => {
  it('should ensure localBoundsRect is defined', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    expect(runtime.localBoundsRect).toBeNull();
    ensureLocalBoundsRectangle(object);
    expect(runtime.localBoundsRect).not.toBeNull();
  });

  it('should not recalculate if localBoundsID is unchanged', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    runtime.computeLocalBoundsRect = (out: Rectangle, _source: GraphNode) => {
      setEmpty(out);
    };
    ensureLocalBoundsRectangle(object);
    const cache = cloneAndInvalidateRect(runtime.localBoundsRect!);
    ensureLocalBoundsRectangle(object);
    expect(runtime.localBoundsRect).not.toEqual(cache);
  });

  it('should recalculate if localBoundsID is changed', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    runtime.computeLocalBoundsRect = (out: Rectangle, _source: GraphNode) => {
      setEmpty(out);
    };
    ensureLocalBoundsRectangle(object);
    const cache = cloneAndInvalidateRect(runtime.localBoundsRect!);
    runtime.localBoundsID++;
    ensureLocalBoundsRectangle(object);
    expect(equalsRectangle(runtime.localBoundsRect, cache)).toBe(true);
  });

  it('should not recalculate if localTransformID is unchanged', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    runtime.computeLocalBoundsRect = (out: Rectangle, _source: GraphNode) => {
      setEmpty(out);
    };
    ensureLocalBoundsRectangle(object);
    const cache = cloneAndInvalidateRect(runtime.localBoundsRect!);
    runtime.localTransformID++;
    ensureLocalBoundsRectangle(object);
    expect(runtime.localBoundsRect).not.toEqual(cache);
  });
});

describe('ensureWorldBoundsRectangle', () => {
  it('should ensure worldBoundsRect is defined', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    expect(runtime.worldBoundsRect).toBeNull();
    ensureWorldBoundsRectangle(object);
    expect(runtime.worldBoundsRect).not.toBeNull();
  });

  it('should not recalculate if localBoundsID and worldTransformID are unchanged', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    ensureWorldBoundsRectangle(object);
    const cache = cloneAndInvalidateRect(runtime.worldBoundsRect!);
    ensureWorldBoundsRectangle(object);
    expect(runtime.worldBoundsRect).not.toEqual(cache);
  });

  it('should recalculate if localBoundsID is changed', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    ensureWorldBoundsRectangle(object);
    const cache = cloneAndInvalidateRect(runtime.worldBoundsRect!);
    runtime.localBoundsID++;
    ensureWorldBoundsRectangle(object);
    expect(equalsRectangle(runtime.worldBoundsRect, cache)).toBe(true);
  });

  it('should recalculate if local transform is changed (translate)', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    ensureWorldBoundsRectangle(object);
    const cache = cloneRectangle(runtime.worldBoundsRect!);
    object.x = 100;
    invalidateLocalTransform(object);
    ensureWorldBoundsRectangle(object);
    expect(runtime.worldBoundsRect).not.toEqual(cache);
    expect(equalsRectangle(runtime.worldBoundsRect, { x: 100, y: 0, width: 0, height: 0 })).toBe(true);
  });

  it('should recalculate if local transform is changed (scale)', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    ensureWorldBoundsRectangle(object);
    const cache = cloneRectangle(runtime.worldBoundsRect!);
    const localBounds = getLocalBoundsRectangle(object) as Rectangle;
    localBounds.width = 10; // hack;
    object.scaleX = 2;
    invalidateLocalTransform(object);
    ensureWorldBoundsRectangle(object);
    expect(runtime.worldBoundsRect).not.toEqual(cache);
    expect(equalsRectangle(runtime.worldBoundsRect, { x: 0, y: 0, width: 20, height: 0 })).toBe(true);
  });

  it('should recalculate if parent transform is changed (translate)', () => {
    const parent = createTestNode();
    const child = createTestNode();
    addGraphChild(parent, child);
    const runtime = getEntityRuntime(child);
    ensureWorldBoundsRectangle(child);
    const cache = cloneRectangle(runtime.worldBoundsRect!);
    parent.x = 100;
    invalidateLocalTransform(parent);
    ensureWorldBoundsRectangle(child);
    expect(runtime.worldBoundsRect).not.toEqual(cache);
    expect(equalsRectangle(runtime.worldBoundsRect, { x: 100, y: 0, width: 0, height: 0 })).toBe(true);
  });

  it('should recalculate if parent transform is changed (scale)', () => {
    const parent = createTestNode();
    const child = createTestNode();
    addGraphChild(parent, child);
    const runtime = getEntityRuntime(child);
    ensureWorldBoundsRectangle(child);
    const localBounds = getLocalBoundsRectangle(child) as Rectangle;
    localBounds.width = 10; // hack;
    const worldBounds = getWorldBoundsRectangle(child) as Rectangle;
    worldBounds.width = 10; // hack
    const cache = cloneRectangle(runtime.worldBoundsRect!);
    parent.scaleX = 2;
    invalidateLocalTransform(parent);
    ensureLocalTransformMatrix(parent);
    ensureWorldBoundsRectangle(child);
    expect(runtime.worldBoundsRect).not.toEqual(cache);
    expect(equalsRectangle(runtime.worldBoundsRect, { x: 0, y: 0, width: 20, height: 0 })).toBe(true);
  });
});

describe('getBoundsRectangle', () => {
  it('should call ensure and return boundsRect', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    expect(runtime.boundsRect).toBeNull();
    const rect = getBoundsRectangle(object);
    expect(rect).not.toBeNull();
    expect(rect).toStrictEqual(runtime.boundsRect);
  });
});

describe('getLocalBoundsRectangle', () => {
  it('should call ensure and return localBoundsRect', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    expect(runtime.localBoundsRect).toBeNull();
    const rect = getLocalBoundsRectangle(object);
    expect(rect).not.toBeNull();
    expect(rect).toStrictEqual(runtime.localBoundsRect);
  });
});

describe('getScaledBoundsHeight', () => {
  it('returns height in parent space with default scale', () => {
    const parent = createTestNode();
    const node = createTestNode();
    addGraphChild(parent, node);
    setRectangle(getLocalBoundsRectangle(node) as Rectangle, 0, 0, 100, 50);
    expect(getScaledBoundsHeight(node)).toBeCloseTo(50);
  });

  it('accounts for scaleY', () => {
    const parent = createTestNode();
    const node = createTestNode();
    addGraphChild(parent, node);
    setRectangle(getLocalBoundsRectangle(node) as Rectangle, 0, 0, 100, 50);
    node.scaleY = 2;
    invalidateLocalTransform(node);
    expect(getScaledBoundsHeight(node)).toBeCloseTo(100);
  });
});

describe('getScaledBoundsWidth', () => {
  it('returns width in parent space with default scale', () => {
    const parent = createTestNode();
    const node = createTestNode();
    addGraphChild(parent, node);
    setRectangle(getLocalBoundsRectangle(node) as Rectangle, 0, 0, 80, 40);
    expect(getScaledBoundsWidth(node)).toBeCloseTo(80);
  });

  it('accounts for scaleX', () => {
    const parent = createTestNode();
    const node = createTestNode();
    addGraphChild(parent, node);
    setRectangle(getLocalBoundsRectangle(node) as Rectangle, 0, 0, 80, 40);
    node.scaleX = 3;
    invalidateLocalTransform(node);
    expect(getScaledBoundsWidth(node)).toBeCloseTo(240);
  });
});

describe('getWorldBoundsRectangle', () => {
  it('should call ensure and return worldBoundsRect', () => {
    const object = createTestNode();
    const runtime = getEntityRuntime(object);
    expect(runtime.worldBoundsRect).toBeNull();
    const rect = getWorldBoundsRectangle(object);
    expect(rect).not.toBeNull();
    expect(rect).toStrictEqual(runtime.worldBoundsRect);
  });

  it('excludes a disabled child from world bounds', () => {
    const parent = createTestNode();
    const child = createTestNode();
    addGraphChild(parent, child);

    setRectangle(getLocalBoundsRectangle(parent) as Rectangle, 0, 0, 10, 10);
    setRectangle(getLocalBoundsRectangle(child) as Rectangle, 0, 0, 200, 200);
    child.x = 100;
    invalidateLocalTransform(child);

    child.enabled = false;

    const bounds = getWorldBoundsRectangle(parent);
    expect(bounds.width).toBeCloseTo(10);
    expect(bounds.height).toBeCloseTo(10);
  });

  it('includes an enabled child in world bounds', () => {
    const parent = createTestNode();
    const child = createTestNode();
    addGraphChild(parent, child);

    setRectangle(getLocalBoundsRectangle(parent) as Rectangle, 0, 0, 10, 10);
    setRectangle(getLocalBoundsRectangle(child) as Rectangle, 0, 0, 200, 200);
    child.x = 100;
    invalidateLocalTransform(child);

    const bounds = getWorldBoundsRectangle(parent);
    expect(bounds.width).toBeGreaterThan(10);
    expect(bounds.height).toBeGreaterThan(10);
  });
});

describe('setScaledBoundsHeight', () => {
  it('adjusts scaleY to achieve the desired height', () => {
    const parent = createTestNode();
    const node = createTestNode();
    addGraphChild(parent, node);
    setRectangle(getLocalBoundsRectangle(node) as Rectangle, 0, 0, 100, 50);
    setScaledBoundsHeight(node, 100);
    expect(getScaledBoundsHeight(node)).toBeCloseTo(100);
  });

  it('does nothing when scaleY is zero', () => {
    const node = createTestNode();
    node.scaleY = 0;
    invalidateLocalTransform(node);
    setScaledBoundsHeight(node, 100);
    expect(node.scaleY).toBe(0);
  });
});

describe('setScaledBoundsWidth', () => {
  it('adjusts scaleX to achieve the desired width', () => {
    const parent = createTestNode();
    const node = createTestNode();
    addGraphChild(parent, node);
    setRectangle(getLocalBoundsRectangle(node) as Rectangle, 0, 0, 80, 40);
    setScaledBoundsWidth(node, 160);
    expect(getScaledBoundsWidth(node)).toBeCloseTo(160);
  });

  it('does nothing when scaleX is zero', () => {
    const node = createTestNode();
    node.scaleX = 0;
    invalidateLocalTransform(node);
    setScaledBoundsWidth(node, 100);
    expect(node.scaleX).toBe(0);
  });
});

function cloneAndInvalidateRect(rect: Rectangle): Rectangle {
  const clone = cloneRectangle(rect);
  invalidateRect(rect);
  return clone;
}

function invalidateRect(rect: Rectangle | null): void {
  if (rect !== null) setRectangle(rect, NaN, NaN, NaN, NaN);
}

type TestNode = GraphNode<typeof TestKind, HasTransform2D & HasBoundsRect> & HasTransform2D & HasBoundsRect;

const TestKind: unique symbol = Symbol('Test');
