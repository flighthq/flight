import { appendPathLineTo, appendPathMoveTo, createPath } from '@flighthq/path';
import type { Path } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createMotionPath } from './createMotionPath';
import { getMotionPathHeading } from './getMotionPathHeading';
import { setMotionPathDistance } from './setMotionPathDistance';

describe('getMotionPathHeading', () => {
  it('reads 0 radians along a rightward line', () => {
    const mp = createMotionPath(line());
    setMotionPathDistance(mp, 50);
    expect(getMotionPathHeading(mp)).toBeCloseTo(0, 6);
  });

  it('differs before and after a corner', () => {
    const mp = createMotionPath(corner());
    setMotionPathDistance(mp, 50); // on the horizontal leg, heading 0
    const before = getMotionPathHeading(mp);
    setMotionPathDistance(mp, 150); // on the vertical leg, heading +pi/2
    const after = getMotionPathHeading(mp);
    expect(before).toBeCloseTo(0, 6);
    expect(after).toBeCloseTo(Math.PI / 2, 6);
    expect(after).not.toBeCloseTo(before, 3);
  });
});

// A straight horizontal line from (0,0) to (100,0): arc length 100.
function line(): Path {
  const path = createPath();
  appendPathMoveTo(path, 0, 0);
  appendPathLineTo(path, 100, 0);
  return path;
}

// An L-shape: (0,0) -> (100,0) -> (100,100). Arc length 200, corner at distance 100.
function corner(): Path {
  const path = createPath();
  appendPathMoveTo(path, 0, 0);
  appendPathLineTo(path, 100, 0);
  appendPathLineTo(path, 100, 100);
  return path;
}
