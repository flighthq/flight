import { appendPathLineTo, appendPathMoveTo, createPath } from '@flighthq/path';
import type { Path } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createMotionPath } from './createMotionPath';
import { getMotionPathProgress } from './getMotionPathProgress';
import { setMotionPathDistance } from './setMotionPathDistance';

describe('getMotionPathProgress', () => {
  it('reports distance / length', () => {
    const mp = createMotionPath(line());
    setMotionPathDistance(mp, 25);
    expect(getMotionPathProgress(mp)).toBeCloseTo(0.25, 6);
  });

  it('reports 0 for a zero-length path', () => {
    const mp = createMotionPath(createPath());
    expect(getMotionPathProgress(mp)).toBe(0);
  });
});

// A straight horizontal line from (0,0) to (100,0): arc length 100.
function line(): Path {
  const path = createPath();
  appendPathMoveTo(path, 0, 0);
  appendPathLineTo(path, 100, 0);
  return path;
}
