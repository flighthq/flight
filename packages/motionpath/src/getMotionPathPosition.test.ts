import { createVector2 } from '@flighthq/geometry';
import { appendPathLineTo, appendPathMoveTo, createPath } from '@flighthq/path';
import type { Path } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createMotionPath } from './createMotionPath';
import { getMotionPathPosition } from './getMotionPathPosition';
import { setMotionPathDistance } from './setMotionPathDistance';

describe('getMotionPathPosition', () => {
  it('samples the point and tangent at the current distance', () => {
    const mp = createMotionPath(line());
    setMotionPathDistance(mp, 50);
    const point = createVector2();
    const tangent = createVector2();
    const ok = getMotionPathPosition(mp, point, tangent);
    expect(ok).toBe(true);
    expect(point.x).toBeCloseTo(50, 6);
    expect(point.y).toBeCloseTo(0, 6);
    expect(tangent.x).toBeCloseTo(1, 6);
    expect(tangent.y).toBeCloseTo(0, 6);
  });

  it('returns false and leaves outputs unchanged for an empty path', () => {
    const mp = createMotionPath(createPath());
    const point = createVector2(7, 8);
    const tangent = createVector2(9, 9);
    const ok = getMotionPathPosition(mp, point, tangent);
    expect(ok).toBe(false);
    expect(point.x).toBe(7);
    expect(point.y).toBe(8);
  });
});

// A straight horizontal line from (0,0) to (100,0): arc length 100.
function line(): Path {
  const path = createPath();
  appendPathMoveTo(path, 0, 0);
  appendPathLineTo(path, 100, 0);
  return path;
}
