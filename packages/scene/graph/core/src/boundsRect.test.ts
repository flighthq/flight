import { rectangle } from '@flighthq/geometry';
import { setEmpty } from '@flighthq/geometry/rectangle';
import {
  addChild,
  createGraphNode,
  ensureLocalTransform2D,
  getRuntime,
  initHasTransform2D,
  initHasTransform2DRuntime,
  invalidateLocalTransform,
} from '@flighthq/scene-graph-core';
import type {
  GraphNode,
  HasBoundsRect,
  HasBoundsRectRuntime,
  HasTransform2D,
  HasTransform2DRuntime,
  Rectangle,
} from '@flighthq/types';

import {
  calculateBoundsRect,
  ensureBoundsRect,
  ensureLocalBoundsRect,
  ensureWorldBoundsRect,
  getBoundsRect,
  getLocalBoundsRect,
  getWorldBoundsRect,
} from './boundsRect';
import { getHasBoundsRectRuntime, initHasBoundsRect, initHasBoundsRectRuntime } from './hasBoundsRect';

function createTestNode(): TestNode {
  const node = createGraphNode(TestGraph, TestKind) as TestNode;
  const runtime = getRuntime(node);
  initHasBoundsRect(node);
  initHasBoundsRectRuntime(runtime as HasBoundsRectRuntime<typeof TestGraph>);
  initHasTransform2D(node);
  initHasTransform2DRuntime(runtime as HasTransform2DRuntime<typeof TestGraph>);
  return node;
}

describe('calculateBoundsRect', () => {
  let root: TestNode;
  let child: TestNode;
  let grandChild: TestNode;

  beforeEach(() => {
    root = createTestNode();
    child = createTestNode();
    grandChild = createTestNode();

    child.x = 100;
    child.y = 100;

    addChild(root, child);
    addChild(child, grandChild);

    // fake local bounds
    rectangle.setTo(getLocalBoundsRect(root), 0, 0, 100, 100);
    rectangle.setTo(getLocalBoundsRect(child), 10, 20, 50, 50);
    rectangle.setTo(getLocalBoundsRect(grandChild), 5, 5, 100, 100);
  });

  it('should equal local bounds when targetCoordinateSpace is self and there are no children', () => {
    const out = rectangle.create();
    calculateBoundsRect(out, grandChild, grandChild);
    expect(out).toEqual(getLocalBoundsRect(grandChild));
  });

  it('should include children bounds when targetCoordinateSpace is self', () => {
    const out = rectangle.create();
    calculateBoundsRect(out, child, child);
    expect(out).toEqual({ x: 5, y: 5, width: 100, height: 100 });
  });

  it('should compute bounds relative to parent', () => {
    const out = rectangle.create();
    calculateBoundsRect(out, child, root);
    expect(out.x).toBeCloseTo(105);
    expect(out.y).toBeCloseTo(105);
    expect(out.width).toBeCloseTo(100);
    expect(out.height).toBeCloseTo(100);
  });

  it('should compute bounds relative to nested child', () => {
    const out = rectangle.create();
    calculateBoundsRect(out, root, grandChild);
    expect(out.width).toBeGreaterThan(0);
    expect(out.height).toBeGreaterThan(0);
    // exact numbers depend on transforms
  });

  it('should account for scaling in parent transforms', () => {
    // child is 50x50, should be 100x150 now in parent coordinate space
    child.scaleX = 2;
    child.scaleY = 3;

    const out = rectangle.create();
    calculateBoundsRect(out, child, root);

    expect(out.width).toBeCloseTo(100 * 2);
    expect(out.height).toBeCloseTo(100 * 3);
  });

  it('should account for translation in parent transforms', () => {
    child.x = 5;
    child.y = 7;

    const out = rectangle.create();
    calculateBoundsRect(out, grandChild, root);

    // grandChild localBounds at (5,5) with no scaling
    expect(out.x).toBeCloseTo(5 + 5); // parent offset + grandChild offset
    expect(out.y).toBeCloseTo(7 + 5);
  });

  it('should handle rotation', () => {
    child.rotation = 90;

    const out = rectangle.create();
    calculateBoundsRect(out, child, root);
    expect(out.width).toBeCloseTo(100); // roughly unchanged
    expect(out.height).toBeCloseTo(100);
  });

  it('should allow a rectangle-like object', () => {
    const out = { x: 0, y: 0, width: 0, height: 0 };
    calculateBoundsRect(out, grandChild, grandChild);
    expect(out).toEqual(getLocalBoundsRect(grandChild));
  });

  it('should compute bounds relative to an unrelated target', () => {
    const out = rectangle.create();
    const unrelatedTarget = createTestNode(); // another object in a separate scene graph
    calculateBoundsRect(out, child, unrelatedTarget);
    expect(out).toEqual(getWorldBoundsRect(child));
  });

  it('should return world bounds if the target coordinate space is root', () => {
    const out = rectangle.create();
    calculateBoundsRect(out, child, root);
    expect(out).toEqual(getWorldBoundsRect(child));
  });
});

describe('ensureBoundsRect', () => {
  it('should ensure boundsRect is defined', () => {
    const object = createTestNode();
    const runtime = getHasBoundsRectRuntime(object);
    expect(runtime.boundsRect).toBeNull();
    ensureBoundsRect(object);
    expect(runtime.boundsRect).not.toBeNull();
  });

  it('should not recalculate if localBoundsID and localTransformID are unchanged', () => {
    const object = createTestNode();
    const runtime = getHasBoundsRectRuntime(object);
    ensureBoundsRect(object);
    const cache = cloneAndInvalidateRect(runtime.boundsRect!);
    ensureBoundsRect(object);
    expect(runtime.boundsRect).not.toEqual(cache);
  });

  it('should recalculate if localBoundsID is changed', () => {
    const object = createTestNode();
    const runtime = getHasBoundsRectRuntime(object);
    runtime.computeLocalBoundsRect = (out, _source) => {
      setEmpty(out);
    };
    ensureBoundsRect(object);
    const cache = cloneAndInvalidateRect(runtime.boundsRect!);
    runtime.localBoundsID++;
    ensureBoundsRect(object);
    expect(runtime.boundsRect).toEqual(cache);
  });

  it('should recalculate if localTransformID is changed', () => {
    const object = createTestNode();
    const runtime = getHasBoundsRectRuntime(object);
    ensureBoundsRect(object);
    const cache = cloneAndInvalidateRect(runtime.boundsRect!);
    runtime.localTransformID++;
    ensureBoundsRect(object);
    expect(runtime.boundsRect).toEqual(cache);
  });
});

describe('ensureLocalBoundsRect', () => {
  it('should ensure localBoundsRect is defined', () => {
    const object = createTestNode();
    const runtime = getHasBoundsRectRuntime(object);
    expect(runtime.localBoundsRect).toBeNull();
    ensureLocalBoundsRect(object);
    expect(runtime.localBoundsRect).not.toBeNull();
  });

  it('should not recalculate if localBoundsID is unchanged', () => {
    const object = createTestNode();
    const runtime = getHasBoundsRectRuntime(object);
    runtime.computeLocalBoundsRect = (out, _source) => {
      setEmpty(out);
    };
    ensureLocalBoundsRect(object);
    const cache = cloneAndInvalidateRect(runtime.localBoundsRect!);
    ensureLocalBoundsRect(object);
    expect(runtime.localBoundsRect).not.toEqual(cache);
  });

  it('should recalculate if localBoundsID is changed', () => {
    const object = createTestNode();
    const runtime = getHasBoundsRectRuntime(object);
    runtime.computeLocalBoundsRect = (out, _source) => {
      setEmpty(out);
    };
    ensureLocalBoundsRect(object);
    const cache = cloneAndInvalidateRect(runtime.localBoundsRect!);
    runtime.localBoundsID++;
    ensureLocalBoundsRect(object);
    expect(runtime.localBoundsRect).toEqual(cache);
  });

  it('should not recalculate if localTransformID is unchanged', () => {
    const object = createTestNode();
    const runtime = getHasBoundsRectRuntime(object);
    runtime.computeLocalBoundsRect = (out, _source) => {
      setEmpty(out);
    };
    ensureLocalBoundsRect(object);
    const cache = cloneAndInvalidateRect(runtime.localBoundsRect!);
    runtime.localTransformID++;
    ensureLocalBoundsRect(object);
    expect(runtime.localBoundsRect).not.toEqual(cache);
  });
});

describe('ensureWorldBoundsRect', () => {
  it('should ensure worldBoundsRect is defined', () => {
    const object = createTestNode();
    const runtime = getHasBoundsRectRuntime(object);
    expect(runtime.worldBoundsRect).toBeNull();
    ensureWorldBoundsRect(object);
    expect(runtime.worldBoundsRect).not.toBeNull();
  });

  it('should not recalculate if localBoundsID and worldTransformID are unchanged', () => {
    const object = createTestNode();
    const runtime = getHasBoundsRectRuntime(object);
    ensureWorldBoundsRect(object);
    const cache = cloneAndInvalidateRect(runtime.worldBoundsRect!);
    ensureWorldBoundsRect(object);
    expect(runtime.worldBoundsRect).not.toEqual(cache);
  });

  it('should recalculate if localBoundsID is changed', () => {
    const object = createTestNode();
    const runtime = getHasBoundsRectRuntime(object);
    ensureWorldBoundsRect(object);
    const cache = cloneAndInvalidateRect(runtime.worldBoundsRect!);
    runtime.localBoundsID++;
    ensureWorldBoundsRect(object);
    expect(runtime.worldBoundsRect).toEqual(cache);
  });

  it('should recalculate if local transform is changed (translate)', () => {
    const object = createTestNode();
    const runtime = getHasBoundsRectRuntime(object);
    ensureWorldBoundsRect(object);
    const cache = rectangle.clone(runtime.worldBoundsRect!);
    object.x = 100;
    invalidateLocalTransform(object);
    ensureWorldBoundsRect(object);
    expect(runtime.worldBoundsRect).not.toEqual(cache);
    expect(runtime.worldBoundsRect).toEqual({ x: 100, y: 0, width: 0, height: 0 });
  });

  it('should recalculate if local transform is changed (scale)', () => {
    const object = createTestNode();
    const runtime = getHasBoundsRectRuntime(object);
    ensureWorldBoundsRect(object);
    const cache = rectangle.clone(runtime.worldBoundsRect!);
    const localBounds = getLocalBoundsRect(object) as Rectangle;
    localBounds.width = 10; // hack;
    object.scaleX = 2;
    invalidateLocalTransform(object);
    ensureWorldBoundsRect(object);
    expect(runtime.worldBoundsRect).not.toEqual(cache);
    expect(runtime.worldBoundsRect).toEqual({ x: 0, y: 0, width: 20, height: 0 });
  });

  it('should recalculate if parent transform is changed (translate)', () => {
    const parent = createTestNode();
    const child = createTestNode();
    addChild(parent, child);
    const runtime = getHasBoundsRectRuntime(child);
    ensureWorldBoundsRect(child);
    const cache = rectangle.clone(runtime.worldBoundsRect!);
    parent.x = 100;
    invalidateLocalTransform(parent);
    ensureWorldBoundsRect(child);
    expect(runtime.worldBoundsRect).not.toEqual(cache);
    expect(runtime.worldBoundsRect).toEqual({ x: 100, y: 0, width: 0, height: 0 });
  });

  it('should recalculate if parent transform is changed (scale)', () => {
    const parent = createTestNode();
    const child = createTestNode();
    addChild(parent, child);
    const runtime = getHasBoundsRectRuntime(child);
    ensureWorldBoundsRect(child);
    const localBounds = getLocalBoundsRect(child) as Rectangle;
    localBounds.width = 10; // hack;
    const worldBounds = getWorldBoundsRect(child) as Rectangle;
    worldBounds.width = 10; // hack
    const cache = rectangle.clone(runtime.worldBoundsRect!);
    parent.scaleX = 2;
    invalidateLocalTransform(parent);
    ensureLocalTransform2D(parent);
    ensureWorldBoundsRect(child);
    expect(runtime.worldBoundsRect).not.toEqual(cache);
    expect(runtime.worldBoundsRect).toEqual({ x: 0, y: 0, width: 20, height: 0 });
  });
});

describe('getBoundsRect', () => {
  it('should call ensure and return boundsRect', () => {
    const object = createTestNode();
    const runtime = getHasBoundsRectRuntime(object);
    expect(runtime.boundsRect).toBeNull();
    const rect = getBoundsRect(object);
    expect(rect).not.toBeNull();
    expect(rect).toStrictEqual(runtime.boundsRect);
  });
});

describe('getLocalBoundsRect', () => {
  it('should call ensure and return localBoundsRect', () => {
    const object = createTestNode();
    const runtime = getHasBoundsRectRuntime(object);
    expect(runtime.localBoundsRect).toBeNull();
    const rect = getLocalBoundsRect(object);
    expect(rect).not.toBeNull();
    expect(rect).toStrictEqual(runtime.localBoundsRect);
  });
});

describe('getWorldBoundsRect', () => {
  it('should call ensure and return worldBoundsRect', () => {
    const object = createTestNode();
    const runtime = getHasBoundsRectRuntime(object);
    expect(runtime.worldBoundsRect).toBeNull();
    const rect = getWorldBoundsRect(object);
    expect(rect).not.toBeNull();
    expect(rect).toStrictEqual(runtime.worldBoundsRect);
  });
});

function cloneAndInvalidateRect(rect: Rectangle): Rectangle {
  const clone = rectangle.clone(rect);
  invalidateRect(rect);
  return clone;
}

function invalidateRect(rect: Rectangle | null): void {
  if (rect !== null) rectangle.setTo(rect, NaN, NaN, NaN, NaN);
}

type TestNode = GraphNode<typeof TestKind> & HasTransform2D<typeof TestKind> & HasBoundsRect<typeof TestKind>;

const TestGraph: unique symbol = Symbol('TestGraph');

const TestKind: unique symbol = Symbol('Test');
