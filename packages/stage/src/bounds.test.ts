import { Rectangle } from '@flighthq/math';
import type { DisplayObject } from '@flighthq/types';
import { DirtyFlags } from '@flighthq/types';

import { getBounds, getRect } from './bounds.js';
import { createDisplayObject } from './createDisplayObject.js';
import { getCurrentLocalBounds } from './derived.js';
import { invalidate } from './dirty.js';

describe('getBounds', () => {
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
    Rectangle.set(getCurrentLocalBounds(root), 0, 0, 100, 100);
    Rectangle.set(getCurrentLocalBounds(child), 10, 20, 50, 50);
    Rectangle.set(getCurrentLocalBounds(grandChild), 5, 5, 10, 10);
  });

  it('should return local bounds when targetCoordinateSpace is self', () => {
    const out = new Rectangle();
    getBounds(out, child, child);
    expect(out).toEqual(getCurrentLocalBounds(child));
  });

  it('should compute bounds relative to parent', () => {
    const out = new Rectangle();
    getBounds(out, child, root);
    expect(out.x).toBeCloseTo(10);
    expect(out.y).toBeCloseTo(20);
    expect(out.width).toBeCloseTo(50);
    expect(out.height).toBeCloseTo(50);
  });

  it('should compute bounds relative to nested child', () => {
    const out = new Rectangle();
    getBounds(out, root, grandChild);
    expect(out.width).toBeGreaterThan(0);
    expect(out.height).toBeGreaterThan(0);
    // exact numbers depend on transforms
  });

  it('should account for scaling in parent transforms', () => {
    // child is 50x50, should be 100x150 now in parent coordinate space
    child.scaleX = 2;
    child.scaleY = 3;
    invalidate(child, DirtyFlags.Transform);

    const out = new Rectangle();
    getBounds(out, child, root);

    expect(out.width).toBeCloseTo(50 * 2);
    expect(out.height).toBeCloseTo(50 * 3);
  });

  it('should account for translation in parent transforms', () => {
    child.x = 5;
    child.y = 7;
    invalidate(child, DirtyFlags.Transform);

    const out = new Rectangle();
    getBounds(out, grandChild, root);

    // grandChild localBounds at (5,5) with no scaling
    expect(out.x).toBeCloseTo(5 + 5); // parent offset + grandChild offset
    expect(out.y).toBeCloseTo(7 + 5);
  });

  it('should handle rotation', () => {
    child.rotation = 90;

    const out = new Rectangle();
    getBounds(out, child, root);
    expect(out.width).toBeCloseTo(50); // roughly unchanged
    expect(out.height).toBeCloseTo(50);
  });

  it('should allow a rectangle-like object', () => {
    const out = { x: 0, y: 0, width: 0, height: 0 };
    getBounds(out, child, child);
    expect(out).toEqual(getCurrentLocalBounds(child));
  });
});

describe('getRect', () => {
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
    Rectangle.set(getCurrentLocalBounds(root), 0, 0, 100, 100);
    Rectangle.set(getCurrentLocalBounds(child), 10, 20, 50, 50);
    Rectangle.set(getCurrentLocalBounds(grandChild), 5, 5, 10, 10);
  });

  it('should return local bounds when targetCoordinateSpace is self', () => {
    const out = new Rectangle();
    getRect(out, child, child);
    expect(out).toEqual(getCurrentLocalBounds(child));
  });

  it('should compute bounds relative to parent', () => {
    const out = new Rectangle();
    getRect(out, child, root);
    expect(out.x).toBeCloseTo(10);
    expect(out.y).toBeCloseTo(20);
    expect(out.width).toBeCloseTo(50);
    expect(out.height).toBeCloseTo(50);
  });

  it('should compute bounds relative to nested child', () => {
    const out = new Rectangle();
    getRect(out, root, grandChild);
    expect(out.width).toBeGreaterThan(0);
    expect(out.height).toBeGreaterThan(0);
    // exact numbers depend on transforms
  });

  it('should account for scaling in parent transforms', () => {
    // child is 50x50, should be 100x150 now in parent coordinate space
    child.scaleX = 2;
    child.scaleY = 3;
    invalidate(child, DirtyFlags.Transform);

    const out = new Rectangle();
    getRect(out, child, root);

    expect(out.width).toBeCloseTo(50 * 2);
    expect(out.height).toBeCloseTo(50 * 3);
  });

  it('should account for translation in parent transforms', () => {
    child.x = 5;
    child.y = 7;
    invalidate(child, DirtyFlags.Transform);

    const out = new Rectangle();
    getRect(out, grandChild, root);

    // grandChild localBounds at (5,5) with no scaling
    expect(out.x).toBeCloseTo(5 + 5); // parent offset + grandChild offset
    expect(out.y).toBeCloseTo(7 + 5);
  });

  it('should handle rotation', () => {
    child.rotation = 90;

    const out = new Rectangle();
    getRect(out, child, root);
    expect(out.width).toBeCloseTo(50); // roughly unchanged
    expect(out.height).toBeCloseTo(50);
  });

  it('should allow a rectangle-like object', () => {
    const out = { x: 0, y: 0, width: 0, height: 0 };
    getRect(out, child, child);
    expect(out).toEqual(getCurrentLocalBounds(child));
  });
});
