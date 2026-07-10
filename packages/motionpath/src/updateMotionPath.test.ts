import { appendPathLineTo, appendPathMoveTo, createPath } from '@flighthq/path';
import type { Path } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { createMotionPath } from './createMotionPath';
import { getMotionPathProgress } from './getMotionPathProgress';
import { updateMotionPath } from './updateMotionPath';

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

// An empty path with no commands: arc length 0.
function empty(): Path {
  return createPath();
}
