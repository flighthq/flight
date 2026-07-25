import { createRectangle, setRectangle } from '@flighthq/geometry';
import { getNodeLocalBoundsRectangle } from '@flighthq/node';
import { createDisplayObject } from '@flighthq/scene2d';

import { containsNode2D, getNode2DOverlapRectangle, hitTestNode2DsShape } from './displayObjectOverlap';

function makeAt(x: number, y: number, w: number, h: number) {
  const obj = createDisplayObject();
  setRectangle(getNodeLocalBoundsRectangle(obj), x, y, w, h);
  return obj;
}

describe('containsNode2D', () => {
  it('returns true when inner is fully inside outer', () => {
    const outer = makeAt(0, 0, 100, 100);
    const inner = makeAt(10, 10, 20, 20);
    expect(containsNode2D(outer, inner)).toBe(true);
  });

  it('returns false when inner extends beyond outer', () => {
    const outer = makeAt(0, 0, 50, 50);
    const inner = makeAt(30, 30, 40, 40);
    expect(containsNode2D(outer, inner)).toBe(false);
  });

  it('returns false when inner is completely outside outer', () => {
    const outer = makeAt(0, 0, 50, 50);
    const inner = makeAt(100, 100, 20, 20);
    expect(containsNode2D(outer, inner)).toBe(false);
  });
});

describe('getNode2DOverlapRectangle', () => {
  it('writes the intersection rectangle into out', () => {
    const a = makeAt(0, 0, 100, 100);
    const b = makeAt(50, 50, 100, 100);
    const out = createRectangle();
    const result = getNode2DOverlapRectangle(a, b, out);
    expect(result).toBe(out);
    expect(out.x).toBe(50);
    expect(out.y).toBe(50);
    expect(out.width).toBe(50);
    expect(out.height).toBe(50);
  });

  it('writes an empty rectangle when there is no overlap', () => {
    const a = makeAt(0, 0, 50, 50);
    const b = makeAt(100, 100, 50, 50);
    const out = createRectangle();
    getNode2DOverlapRectangle(a, b, out);
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
  });
});

describe('hitTestNode2DsShape', () => {
  it('returns true when centers overlap', () => {
    const a = makeAt(0, 0, 100, 100);
    const b = makeAt(20, 20, 60, 60);
    expect(hitTestNode2DsShape(a, b)).toBe(true);
  });

  it('returns false when AABBs do not intersect', () => {
    const a = makeAt(0, 0, 50, 50);
    const b = makeAt(100, 100, 50, 50);
    expect(hitTestNode2DsShape(a, b)).toBe(false);
  });

  it('returns false when AABBs barely intersect but no center is inside the other', () => {
    const a = makeAt(0, 0, 10, 100);
    const b = makeAt(8, 0, 10, 100);
    expect(hitTestNode2DsShape(a, b)).toBe(false);
  });
});
