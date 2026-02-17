import { rectangle } from '@flighthq/math';
import type { DisplayObject } from '@flighthq/types';

import { calculateBoundsRect, getLocalBoundsRect } from './bounds.js';
import { createDisplayObject } from './createDisplayObject.js';
import { invalidateLocalTransform } from './invalidate.js';

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
