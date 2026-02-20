import { rectangle } from '@flighthq/math';
import type { Rectangle } from '@flighthq/types';
import { type DisplayObject, GraphState } from '@flighthq/types';

import {
  calculateBoundsRect,
  ensureBoundsRect,
  ensureLocalBoundsRect,
  ensureWorldBoundsRect,
  getBoundsRect,
  getLocalBoundsRect,
  getWorldBoundsRect,
} from './bounds.js';
import { createDisplayObject } from './createDisplayObject.js';
import { getGraphState } from './internal/graphState.js';
import { invalidateLocalTransform } from './revision.js';

describe('calculateBoundsRect', () => {
  let root: DisplayObject;
  let child: DisplayObject;
  let grandChild: DisplayObject;

  beforeEach(() => {
    root = createDisplayObject();
    child = createDisplayObject();
    grandChild = createDisplayObject();

    // fake hierarchy
    (child as any).parent = root as any; // eslint-disable-line
    (grandChild as any).parent = child as any; // eslint-disable-line

    // fake local bounds
    rectangle.setTo(getLocalBoundsRect(root), 0, 0, 100, 100);
    rectangle.setTo(getLocalBoundsRect(child), 10, 20, 50, 50);
    rectangle.setTo(getLocalBoundsRect(grandChild), 5, 5, 10, 10);
  });

  it('should return local bounds when targetCoordinateSpace is self', () => {
    const out = rectangle.create();
    calculateBoundsRect(out, child, child);
    expect(out).toEqual(getLocalBoundsRect(child));
  });

  it('should compute bounds relative to parent', () => {
    const out = rectangle.create();
    calculateBoundsRect(out, child, root);
    expect(out.x).toBeCloseTo(10);
    expect(out.y).toBeCloseTo(20);
    expect(out.width).toBeCloseTo(50);
    expect(out.height).toBeCloseTo(50);
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
    invalidateLocalTransform(child);

    const out = rectangle.create();
    calculateBoundsRect(out, child, root);

    expect(out.width).toBeCloseTo(50 * 2);
    expect(out.height).toBeCloseTo(50 * 3);
  });

  it('should account for translation in parent transforms', () => {
    child.x = 5;
    child.y = 7;
    invalidateLocalTransform(child);

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
    expect(out.width).toBeCloseTo(50); // roughly unchanged
    expect(out.height).toBeCloseTo(50);
  });

  it('should allow a rectangle-like object', () => {
    const out = { x: 0, y: 0, width: 0, height: 0 };
    calculateBoundsRect(out, child, child);
    expect(out).toEqual(getLocalBoundsRect(child));
  });
});

describe('ensureBoundsRect', () => {
  it('should ensure boundsRect is defined', () => {
    const object = createDisplayObject();
    const state = getGraphState(object);
    expect(state.boundsRect).toBeNull();
    ensureBoundsRect(object);
    expect(state.boundsRect).not.toBeNull();
  });

  it('should not recalculate if localBoundsID and localTransformID are unchanged', () => {
    const object = createDisplayObject();
    const state = getGraphState(object);
    ensureBoundsRect(object);
    const cache = cloneAndInvalidateRect(state.boundsRect!);
    ensureBoundsRect(object);
    expect(state.boundsRect).not.toEqual(cache);
  });

  it('should recalculate if localBoundsID is changed', () => {
    const object = createDisplayObject();
    const state = getGraphState(object);
    ensureBoundsRect(object);
    const cache = cloneAndInvalidateRect(state.boundsRect!);
    state.localBoundsID++;
    ensureBoundsRect(object);
    expect(state.boundsRect).toEqual(cache);
  });

  it('should recalculate if localTransformID is changed', () => {
    const object = createDisplayObject();
    const state = getGraphState(object);
    ensureBoundsRect(object);
    const cache = cloneAndInvalidateRect(state.boundsRect!);
    state.localTransformID++;
    ensureBoundsRect(object);
    expect(state.boundsRect).toEqual(cache);
  });
});

describe('ensureLocalBoundsRect', () => {
  it('should ensure localBoundsRect is defined', () => {
    const object = createDisplayObject();
    const state = getGraphState(object);
    expect(state.localBoundsRect).toBeNull();
    ensureLocalBoundsRect(object);
    expect(state.localBoundsRect).not.toBeNull();
  });

  it('should not recalculate if localBoundsID is unchanged', () => {
    const object = createDisplayObject();
    const state = getGraphState(object);
    ensureLocalBoundsRect(object);
    const cache = cloneAndInvalidateRect(state.localBoundsRect!);
    ensureLocalBoundsRect(object);
    expect(state.localBoundsRect).not.toEqual(cache);
  });

  it('should recalculate if localBoundsID is changed', () => {
    const object = createDisplayObject();
    const state = getGraphState(object);
    ensureLocalBoundsRect(object);
    const cache = cloneAndInvalidateRect(state.localBoundsRect!);
    state.localBoundsID++;
    ensureLocalBoundsRect(object);
    expect(state.localBoundsRect).toEqual(cache);
  });

  it('should not recalculate if localTransformID is unchanged', () => {
    const object = createDisplayObject();
    const state = getGraphState(object);
    ensureLocalBoundsRect(object);
    const cache = cloneAndInvalidateRect(state.localBoundsRect!);
    state.localTransformID++;
    ensureLocalBoundsRect(object);
    expect(state.localBoundsRect).not.toEqual(cache);
  });
});

describe('ensureWorldBoundsRect', () => {
  it('should ensure worldBoundsRect is defined', () => {
    const object = createDisplayObject();
    const state = getGraphState(object);
    expect(state.worldBoundsRect).toBeNull();
    ensureWorldBoundsRect(object);
    expect(state.worldBoundsRect).not.toBeNull();
  });

  it('should not recalculate if localBoundsID and worldTransformID are unchanged', () => {
    const object = createDisplayObject();
    const state = getGraphState(object);
    ensureWorldBoundsRect(object);
    const cache = cloneAndInvalidateRect(state.worldBoundsRect!);
    ensureWorldBoundsRect(object);
    expect(state.worldBoundsRect).not.toEqual(cache);
  });

  it('should recalculate if localBoundsID is changed', () => {
    const object = createDisplayObject();
    const state = getGraphState(object);
    ensureWorldBoundsRect(object);
    const cache = cloneAndInvalidateRect(state.worldBoundsRect!);
    state.localBoundsID++;
    ensureWorldBoundsRect(object);
    expect(state.worldBoundsRect).toEqual(cache);
  });

  it('should recalculate if worldTransformID is changed', () => {
    const object = createDisplayObject();
    const state = getGraphState(object);
    ensureWorldBoundsRect(object);
    const cache = cloneAndInvalidateRect(state.worldBoundsRect!);
    state.worldTransformID++;
    ensureWorldBoundsRect(object);
    expect(state.worldBoundsRect).toEqual(cache);
  });
});

describe('getBoundsRect', () => {
  it('should call ensure and return boundsRect', () => {
    const object = createDisplayObject();
    const state = getGraphState(object);
    expect(state.boundsRect).toBeNull();
    const rect = getBoundsRect(object);
    expect(rect).not.toBeNull();
    expect(rect).toStrictEqual(state.boundsRect);
  });
});

describe('getLocalBoundsRect', () => {
  it('should call ensure and return localBoundsRect', () => {
    const object = createDisplayObject();
    const state = getGraphState(object);
    expect(state.localBoundsRect).toBeNull();
    const rect = getLocalBoundsRect(object);
    expect(rect).not.toBeNull();
    expect(rect).toStrictEqual(state.localBoundsRect);
  });
});

describe('getWorldBoundsRect', () => {
  it('should call ensure and return worldBoundsRect', () => {
    const object = createDisplayObject();
    const state = getGraphState(object);
    expect(state.worldBoundsRect).toBeNull();
    const rect = getWorldBoundsRect(object);
    expect(rect).not.toBeNull();
    expect(rect).toStrictEqual(state.worldBoundsRect);
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
