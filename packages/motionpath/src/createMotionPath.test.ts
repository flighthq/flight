import { appendPathLineTo, appendPathMoveTo, createPath } from '@flighthq/path';
import type { Path } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createMotionPath } from './createMotionPath';

describe('createMotionPath', () => {
  it('caches the path arc length measured from the path', () => {
    const mp = createMotionPath(line());
    expect(mp.length).toBeCloseTo(100, 6);
  });

  it('starts at the path start, forward, with clamp defaults', () => {
    const mp = createMotionPath(line());
    expect(mp.distance).toBe(0);
    expect(mp.direction).toBe(1);
    expect(mp.speed).toBe(0);
    expect(mp.loopMode).toBe('clamp');
  });

  it('carries the provided speed and loop mode', () => {
    const mp = createMotionPath(line(), 50, 'pingpong');
    expect(mp.speed).toBe(50);
    expect(mp.loopMode).toBe('pingpong');
  });
});

// A straight horizontal line from (0,0) to (100,0): arc length 100, tangent (1,0) everywhere.
function line(): Path {
  const path = createPath();
  appendPathMoveTo(path, 0, 0);
  appendPathLineTo(path, 100, 0);
  return path;
}
