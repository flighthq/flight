import type { RectangleLike } from '@flighthq/types';

import { getPathBounds } from './getPathBounds';
import { offsetPath } from './offsetPath';
import { appendPathCircle, appendPathRectangle, createPath } from './path';

describe('offsetPath', () => {
  it('outsets a rectangle so bounds grow', () => {
    const source = createPath();
    appendPathRectangle(source, 10, 10, 80, 60);
    const out = createPath();
    offsetPath(source, 5, out);

    const srcBounds: RectangleLike = { x: 0, y: 0, width: 0, height: 0 };
    const outBounds: RectangleLike = { x: 0, y: 0, width: 0, height: 0 };
    getPathBounds(source, srcBounds);
    getPathBounds(out, outBounds);

    expect(outBounds.width).toBeGreaterThan(srcBounds.width);
    expect(outBounds.height).toBeGreaterThan(srcBounds.height);
  });

  it('offsets a circle outward', () => {
    const source = createPath();
    appendPathCircle(source, 0, 0, 50);
    const out = createPath();
    offsetPath(source, 10, out);

    const outBounds: RectangleLike = { x: 0, y: 0, width: 0, height: 0 };
    getPathBounds(out, outBounds);
    expect(outBounds.width).toBeCloseTo(120, -1);
    expect(outBounds.height).toBeCloseTo(120, -1);
  });

  it('zero offset produces the same geometry', () => {
    const source = createPath();
    appendPathRectangle(source, 0, 0, 100, 50);
    const out = createPath();
    offsetPath(source, 0, out);

    const srcBounds: RectangleLike = { x: 0, y: 0, width: 0, height: 0 };
    const outBounds: RectangleLike = { x: 0, y: 0, width: 0, height: 0 };
    getPathBounds(source, srcBounds);
    getPathBounds(out, outBounds);

    expect(outBounds.x).toBeCloseTo(srcBounds.x);
    expect(outBounds.y).toBeCloseTo(srcBounds.y);
    expect(outBounds.width).toBeCloseTo(srcBounds.width);
    expect(outBounds.height).toBeCloseTo(srcBounds.height);
  });

  it('negative offset insets (shrinks) the path', () => {
    const source = createPath();
    appendPathRectangle(source, 0, 0, 100, 100);
    const out = createPath();
    offsetPath(source, -10, out);

    const outBounds: RectangleLike = { x: 0, y: 0, width: 0, height: 0 };
    getPathBounds(out, outBounds);

    expect(outBounds.width).toBeLessThan(100);
    expect(outBounds.height).toBeLessThan(100);
  });

  it('preserves winding rule', () => {
    const source = createPath('evenOdd');
    appendPathRectangle(source, 0, 0, 50, 50);
    const out = createPath();
    offsetPath(source, 5, out);
    expect(out.winding).toBe('evenOdd');
  });

  it('handles an empty path', () => {
    const out = createPath();
    offsetPath(createPath(), 10, out);
    expect(out.commands).toStrictEqual([]);
  });
});
