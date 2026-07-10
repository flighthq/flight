import { appendPathLineTo, appendPathMoveTo, createPath } from '@flighthq/path';
import type { Path } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createMotionPath } from './createMotionPath';
import { setMotionPathProgress } from './setMotionPathProgress';

describe('setMotionPathProgress', () => {
  it('seeks to a normalized progress along the path', () => {
    const mp = createMotionPath(line());
    setMotionPathProgress(mp, 0.25);
    expect(mp.distance).toBeCloseTo(25, 6);
  });

  it('clamps progress above 1 to the end', () => {
    const mp = createMotionPath(line());
    setMotionPathProgress(mp, 1.5);
    expect(mp.distance).toBeCloseTo(100, 6);
  });

  it('clamps negative progress to the start', () => {
    const mp = createMotionPath(line());
    setMotionPathProgress(mp, -0.5);
    expect(mp.distance).toBe(0);
  });
});

// A straight horizontal line from (0,0) to (100,0): arc length 100.
function line(): Path {
  const path = createPath();
  appendPathMoveTo(path, 0, 0);
  appendPathLineTo(path, 100, 0);
  return path;
}
