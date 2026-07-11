import { appendPathLineTo, appendPathMoveTo, createPath } from '@flighthq/path';
import type { Path } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createMotionPath } from './createMotionPath';
import { setMotionPathDistance } from './setMotionPathDistance';

describe('setMotionPathDistance', () => {
  it('seeks to an absolute arc-length distance', () => {
    const mp = createMotionPath(line());
    setMotionPathDistance(mp, 25);
    expect(mp.distance).toBe(25);
  });

  it('clamps distances above the length', () => {
    const mp = createMotionPath(line());
    setMotionPathDistance(mp, 150);
    expect(mp.distance).toBe(100);
  });

  it('clamps negative distances to 0', () => {
    const mp = createMotionPath(line());
    setMotionPathDistance(mp, -10);
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
