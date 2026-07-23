import { createVector2 } from '@flighthq/geometry';
import { appendPathLineTo, appendPathMoveTo, createPath } from '@flighthq/path';
import type { Path } from '@flighthq/types';

import {
  createMotionPath,
  getMotionPathHeading,
  getMotionPathPosition,
  getMotionPathProgress,
  setMotionPathDistance,
  setMotionPathProgress,
  updateMotionPath,
} from './motionPath';

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
describe('updateMotionPath', () => {
  it('advances distance by speed * deltaTime', () => {
    const mp = createMotionPath(line(), 50);
    updateMotionPath(mp, 1);
    expect(mp.distance).toBeCloseTo(50, 6);
    expect(getMotionPathProgress(mp)).toBeCloseTo(0.5, 6);
  });

  it('clamp stops at the end and stays there', () => {
    const mp = createMotionPath(line(), 50, 'clamp');
    updateMotionPath(mp, 10); // 500 units of travel, past the 100-length end
    expect(mp.distance).toBeCloseTo(100, 6);
    expect(getMotionPathProgress(mp)).toBeCloseTo(1, 6);
    updateMotionPath(mp, 5);
    expect(mp.distance).toBeCloseTo(100, 6);
  });

  it('loop wraps past the end modulo length', () => {
    const mp = createMotionPath(line(), 30, 'loop');
    updateMotionPath(mp, 4); // 120 -> 20
    expect(mp.distance).toBeCloseTo(20, 6);
  });

  it('loop wraps backward into [0, length)', () => {
    const mp = createMotionPath(line(), 30, 'loop');
    mp.direction = -1;
    updateMotionPath(mp, 4); // 0 - 120 -> -120 mod 100 -> 80
    expect(mp.distance).toBeCloseTo(80, 6);
  });

  it('pingpong reflects at the end and flips direction to -1', () => {
    const mp = createMotionPath(line(), 30, 'pingpong');
    mp.distance = 90;
    updateMotionPath(mp, 1); // 90 + 30 = 120 -> reflect to 80
    expect(mp.distance).toBeCloseTo(80, 6);
    expect(mp.direction).toBe(-1);
  });

  it('pingpong then travels back toward the start', () => {
    const mp = createMotionPath(line(), 30, 'pingpong');
    mp.distance = 90;
    updateMotionPath(mp, 1); // -> 80, direction -1
    updateMotionPath(mp, 1); // 80 - 30 = 50
    expect(mp.distance).toBeCloseTo(50, 6);
    expect(mp.direction).toBe(-1);
  });

  it('loop wraps a single large step across the path multiple times', () => {
    const mp = createMotionPath(line(), 250, 'loop');
    updateMotionPath(mp, 1); // 250 mod 100 -> 50
    expect(mp.distance).toBeCloseTo(50, 6);
  });

  it('pingpong resolves a single large step that crosses the path several times', () => {
    const mp = createMotionPath(line(), 250, 'pingpong');
    updateMotionPath(mp, 1); // 0->100 (flip), 100->0 (flip), 0->50 => 50, direction +1
    expect(mp.distance).toBeCloseTo(50, 6);
    expect(mp.direction).toBe(1);
  });

  it('pingpong reflects again at the start and flips direction back to +1', () => {
    const mp = createMotionPath(line(), 80, 'pingpong');
    mp.distance = 50;
    mp.direction = -1;
    updateMotionPath(mp, 1); // 50 - 80 = -30 -> reflect to 30, direction +1
    expect(mp.distance).toBeCloseTo(30, 6);
    expect(mp.direction).toBe(1);
  });

  it('deltaTime <= 0 is a no-op', () => {
    const mp = createMotionPath(line(), 50);
    updateMotionPath(mp, 0);
    expect(mp.distance).toBe(0);
    updateMotionPath(mp, -1);
    expect(mp.distance).toBe(0);
  });

  it('a zero-length path is a no-op', () => {
    const mp = createMotionPath(empty(), 50);
    expect(mp.length).toBe(0);
    updateMotionPath(mp, 1);
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

function corner(): Path {
  const path = createPath();
  appendPathMoveTo(path, 0, 0);
  appendPathLineTo(path, 100, 0);
  appendPathLineTo(path, 100, 100);
  return path;
}

function empty(): Path {
  return createPath();
}
