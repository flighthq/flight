// Generated from crates/flight-path/tests/get_path_nearest_point_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { createVector2 } from '@flighthq/geometry/contract';
import { describe, expect, it } from 'vitest';

import { appendPathCircle, appendPathLineTo, appendPathMoveTo, createPath, getPathNearestPoint } from './contract.ts';

describe('getPathNearestPoint', () => {
  it('returns negative one for empty path', () => {
    const path = createPath('nonZero');
    let out = createVector2(0.0, 0.0);
    const dist = getPathNearestPoint(path, 5.0, 5.0, out, 0.25);
    expect(dist).toEqual(-1.0);
  });
  it('returns zero for point on path', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    let out = createVector2(0.0, 0.0);
    const dist = getPathNearestPoint(path, 50.0, 0.0, out, 0.25);
    expect(Math.abs(dist) < 0.005).toBe(true);
    expect(Math.abs(out.x - 50.0) < 0.005).toBe(true);
    expect(Math.abs(out.y) < 0.005).toBe(true);
  });
  it('returns perpendicular distance for point off path', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    let out = createVector2(0.0, 0.0);
    const dist = getPathNearestPoint(path, 50.0, 30.0, out, 0.25);
    expect(Math.abs(dist - 30.0) < 0.005).toBe(true);
    expect(Math.abs(out.x - 50.0) < 0.005).toBe(true);
    expect(Math.abs(out.y) < 0.005).toBe(true);
  });
  it('picks closest contour in multi contour path', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 0.0, 0.0);
    appendPathLineTo(path, 100.0, 0.0);
    appendPathMoveTo(path, 0.0, 10.0);
    appendPathLineTo(path, 100.0, 10.0);
    let out = createVector2(0.0, 0.0);
    const dist = getPathNearestPoint(path, 50.0, 8.0, out, 0.25);
    expect(Math.abs(dist - 2.0) < 0.005).toBe(true);
    expect(Math.abs(out.y - 10.0) < 0.005).toBe(true);
  });
  it('clamps to endpoint when projection falls outside', () => {
    let path = createPath('nonZero');
    appendPathMoveTo(path, 10.0, 0.0);
    appendPathLineTo(path, 90.0, 0.0);
    let out = createVector2(0.0, 0.0);
    const dist = getPathNearestPoint(path, 0.0, 0.0, out, 0.25);
    expect(Math.abs(dist - 10.0) < 0.005).toBe(true);
    expect(Math.abs(out.x - 10.0) < 0.005).toBe(true);
    expect(Math.abs(out.y) < 0.005).toBe(true);
  });
  it('works with curved paths', () => {
    let path = createPath('nonZero');
    appendPathCircle(path, 0.0, 0.0, 50.0);
    let out = createVector2(0.0, 0.0);
    const dist = getPathNearestPoint(path, 100.0, 0.0, out, 0.25);
    expect(Math.abs(dist - 50.0) < 0.5).toBe(true);
    expect(Math.abs(out.x - 50.0) < 0.5).toBe(true);
    expect(Math.abs(out.y) < 0.5).toBe(true);
  });
});
