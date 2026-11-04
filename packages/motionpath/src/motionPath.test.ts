// Generated from crates/flight-motionpath/tests/motion_path_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { createVector2 } from '@flighthq/geometry/contract';
import { appendPathLineTo, appendPathMoveTo, createPath } from '@flighthq/path/contract';
import type { Path } from '@flighthq/path/contract';
import { describe, expect, it } from 'vitest';

import {
  createMotionPath,
  getMotionPathHeading,
  getMotionPathPosition,
  getMotionPathProgress,
  initializeMotionPath,
  isMotionPathAtEnd,
  setMotionPathDirection,
  setMotionPathDistance,
  setMotionPathProgress,
  updateMotionPath,
} from './contract.ts';
import type { MotionPathLoopMode } from './contract.ts';

function line(): Path {
  let path = createPath('nonZero');
  appendPathMoveTo(path, 0.0, 0.0);
  appendPathLineTo(path, 100.0, 0.0);
  return path;
}

function corner(): Path {
  let path = createPath('nonZero');
  appendPathMoveTo(path, 0.0, 0.0);
  appendPathLineTo(path, 100.0, 0.0);
  appendPathLineTo(path, 100.0, 100.0);
  return path;
}

function empty(): Path {
  return createPath('nonZero');
}

describe('createMotionPath', () => {
  it('caches the path arc length measured from the path', () => {
    const marker = createMotionPath(line(), 0.0, undefined, undefined);
    expect(Math.abs(marker.length - 100.0) < 1e-6).toBe(true);
  });
  it('starts at the path start forward with clamp defaults', () => {
    const marker = createMotionPath(empty(), undefined, undefined, undefined);
    expect(marker.distance).toEqual(0.0);
    expect(marker.direction).toEqual(1);
    expect(marker.speed).toEqual(0.0);
    expect(marker.loopMode).toEqual('clamp');
    expect(marker.length).toEqual(0.0);
    expect(marker.path!.commands.length === 0).toBe(true);
  });
  it('carries the provided speed and loop mode', () => {
    const mode: MotionPathLoopMode = 'pingpong';
    const marker = createMotionPath(line(), 50.0, mode, undefined);
    expect(marker.speed).toEqual(50.0);
    expect(marker.loopMode).toEqual('pingpong');
  });
});

describe('getMotionPathHeading', () => {
  it('reads zero radians along a rightward line', () => {
    let marker = createMotionPath(line(), 0.0, 'clamp', undefined);
    setMotionPathDistance(marker, 50.0);
    expect(Math.abs(getMotionPathHeading(marker)) < 1e-6).toBe(true);
  });
  it('differs before and after a corner', () => {
    let marker = createMotionPath(corner(), 0.0, 'clamp', undefined);
    setMotionPathDistance(marker, 50.0);
    const before = getMotionPathHeading(marker);
    setMotionPathDistance(marker, 150.0);
    const after = getMotionPathHeading(marker);
    expect(Math.abs(before) < 1e-6).toBe(true);
    expect(Math.abs(after - Math.atan2(1.0, 0.0)) < 1e-6).toBe(true);
    expect(Math.abs(after - before) > 1e-3).toBe(true);
  });
});

describe('getMotionPathPosition', () => {
  it('samples the point and tangent at the current distance', () => {
    let marker = createMotionPath(line(), 0.0, 'clamp', undefined);
    setMotionPathDistance(marker, 50.0);
    let point = createVector2(0.0, 0.0);
    let tangent = createVector2(0.0, 0.0);
    expect(getMotionPathPosition(marker, point, tangent)).toBe(true);
    expect(Math.abs(point.x - 50.0) < 1e-4).toBe(true);
    expect(Math.abs(point.y) < 1e-4).toBe(true);
    expect(Math.abs(tangent.x - 1.0) < 1e-4).toBe(true);
    expect(Math.abs(tangent.y) < 1e-4).toBe(true);
  });
  it('returns false and leaves the point unchanged for an empty path', () => {
    const marker = createMotionPath(empty(), 0.0, undefined, undefined);
    let point = createVector2(7.0, 8.0);
    let tangent = createVector2(9.0, 9.0);
    expect(!getMotionPathPosition(marker, point, tangent)).toBe(true);
    expect(point.x).toEqual(7.0);
    expect(point.y).toEqual(8.0);
  });
});

describe('getMotionPathProgress', () => {
  it('reports distance over length', () => {
    let marker = createMotionPath(line(), 0.0, 'clamp', undefined);
    setMotionPathDistance(marker, 25.0);
    expect(Math.abs(getMotionPathProgress(marker) - 0.25) < 1e-6).toBe(true);
  });
  it('reports zero for a zero length path', () => {
    const marker = createMotionPath(empty(), 0.0, undefined, undefined);
    expect(getMotionPathProgress(marker)).toEqual(0.0);
  });
});

describe('initializeMotionPath', () => {
  it('is the construction initializer of create motion path', () => {
    let marker = createMotionPath(line(), 5.0, 'loop', undefined);
    marker.direction = -1;
    marker.distance = 4.0;
    initializeMotionPath(marker, empty(), 0.0, 'clamp', undefined);
    expect(marker.direction).toEqual(1);
    expect(marker.distance).toEqual(0.0);
    expect(marker.length).toEqual(0.0);
    expect(marker.speed).toEqual(0.0);
    expect(marker.loopMode).toEqual('clamp');
    expect(marker.path!.commands.length === 0).toBe(true);
  });
});

describe('isMotionPathAtEnd', () => {
  it('reports the terminal edge in the current direction', () => {
    let marker = createMotionPath(line(), 0.0, 'clamp', undefined);
    expect(!isMotionPathAtEnd(marker)).toBe(true);
    setMotionPathDistance(marker, 100.0);
    expect(isMotionPathAtEnd(marker)).toBe(true);
    setMotionPathDirection(marker, -1);
    expect(!isMotionPathAtEnd(marker)).toBe(true);
    setMotionPathDistance(marker, 0.0);
    expect(isMotionPathAtEnd(marker)).toBe(true);
  });
});

describe('setMotionPathDirection', () => {
  it('changes traversal direction without changing distance', () => {
    let marker = createMotionPath(line(), 0.0, 'clamp', undefined);
    setMotionPathDistance(marker, 25.0);
    setMotionPathDirection(marker, -1);
    expect(marker.direction).toEqual(-1);
    expect(marker.distance).toEqual(25.0);
  });
});

describe('setMotionPathDistance', () => {
  it('seeks to an absolute arc length distance', () => {
    let marker = createMotionPath(line(), 0.0, 'clamp', undefined);
    setMotionPathDistance(marker, 25.0);
    expect(marker.distance).toEqual(25.0);
  });
  it('clamps distances above the length', () => {
    let marker = createMotionPath(line(), 0.0, 'clamp', undefined);
    setMotionPathDistance(marker, 150.0);
    expect(marker.distance).toEqual(100.0);
  });
  it('clamps negative distances to zero', () => {
    let marker = createMotionPath(line(), 0.0, 'clamp', undefined);
    setMotionPathDistance(marker, -10.0);
    expect(marker.distance).toEqual(0.0);
  });
});

describe('setMotionPathProgress', () => {
  it('seeks to a normalized progress along the path', () => {
    let marker = createMotionPath(line(), 0.0, 'clamp', undefined);
    setMotionPathProgress(marker, 0.25);
    expect(Math.abs(marker.distance - 25.0) < 1e-6).toBe(true);
  });
  it('clamps progress above one to the end', () => {
    let marker = createMotionPath(line(), 0.0, 'clamp', undefined);
    setMotionPathProgress(marker, 1.5);
    expect(Math.abs(marker.distance - 100.0) < 1e-6).toBe(true);
  });
  it('clamps negative progress to the start', () => {
    let marker = createMotionPath(line(), 0.0, 'clamp', undefined);
    setMotionPathProgress(marker, -0.5);
    expect(marker.distance).toEqual(0.0);
  });
});

describe('updateMotionPath', () => {
  it('advances distance by speed times delta time', () => {
    let marker = createMotionPath(line(), 50.0, 'clamp', undefined);
    updateMotionPath(marker, 1.0);
    expect(Math.abs(marker.distance - 50.0) < 1e-6).toBe(true);
    expect(Math.abs(getMotionPathProgress(marker) - 0.5) < 1e-6).toBe(true);
  });
  it('clamp stops at the end and stays there', () => {
    let marker = createMotionPath(line(), 50.0, 'clamp', undefined);
    updateMotionPath(marker, 10.0);
    expect(Math.abs(marker.distance - 100.0) < 1e-6).toBe(true);
    expect(Math.abs(getMotionPathProgress(marker) - 1.0) < 1e-6).toBe(true);
    updateMotionPath(marker, 5.0);
    expect(Math.abs(marker.distance - 100.0) < 1e-6).toBe(true);
  });
  it('loop wraps past the end modulo length', () => {
    let marker = createMotionPath(line(), 30.0, 'loop', undefined);
    updateMotionPath(marker, 4.0);
    expect(Math.abs(marker.distance - 20.0) < 1e-6).toBe(true);
  });
  it('loop wraps backward into the valid range', () => {
    let marker = createMotionPath(line(), 30.0, 'loop', undefined);
    setMotionPathDirection(marker, -1);
    updateMotionPath(marker, 4.0);
    expect(Math.abs(marker.distance - 80.0) < 1e-6).toBe(true);
  });
  it('pingpong reflects at the end and flips direction to backward', () => {
    let marker = createMotionPath(line(), 30.0, 'pingpong', undefined);
    setMotionPathDistance(marker, 90.0);
    updateMotionPath(marker, 1.0);
    expect(Math.abs(marker.distance - 80.0) < 1e-6).toBe(true);
    expect(marker.direction).toEqual(-1);
  });
  it('pingpong then travels back toward the start', () => {
    let marker = createMotionPath(line(), 30.0, 'pingpong', undefined);
    setMotionPathDistance(marker, 90.0);
    updateMotionPath(marker, 1.0);
    updateMotionPath(marker, 1.0);
    expect(Math.abs(marker.distance - 50.0) < 1e-6).toBe(true);
    expect(marker.direction).toEqual(-1);
  });
  it('loop wraps a single large step across the path multiple times', () => {
    let marker = createMotionPath(line(), 250.0, 'loop', undefined);
    updateMotionPath(marker, 1.0);
    expect(Math.abs(marker.distance - 50.0) < 1e-6).toBe(true);
  });
  it('pingpong resolves a single large step that crosses the path several times', () => {
    let marker = createMotionPath(line(), 250.0, 'pingpong', undefined);
    updateMotionPath(marker, 1.0);
    expect(Math.abs(marker.distance - 50.0) < 1e-6).toBe(true);
    expect(marker.direction).toEqual(1);
  });
  it('pingpong reflects again at the start and flips direction back', () => {
    let marker = createMotionPath(line(), 80.0, 'pingpong', undefined);
    setMotionPathDistance(marker, 50.0);
    setMotionPathDirection(marker, -1);
    updateMotionPath(marker, 1.0);
    expect(Math.abs(marker.distance - 30.0) < 1e-6).toBe(true);
    expect(marker.direction).toEqual(1);
  });
  it('a non positive delta time is a no op', () => {
    let marker = createMotionPath(line(), 50.0, 'clamp', undefined);
    updateMotionPath(marker, 0.0);
    expect(marker.distance).toEqual(0.0);
    updateMotionPath(marker, -1.0);
    expect(marker.distance).toEqual(0.0);
  });
  it('a zero length path is a no op', () => {
    let marker = createMotionPath(empty(), 50.0, 'clamp', undefined);
    expect(marker.length).toEqual(0.0);
    updateMotionPath(marker, 1.0);
    expect(marker.distance).toEqual(0.0);
  });
});
