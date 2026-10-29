// Generated from crates/flight-path/tests/tessellate_path_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import {
  appendPathLineTo,
  appendPathMoveTo,
  appendPathRectangle,
  createPath,
  tessellatePath,
  tessellatePathInto,
} from './contract.ts';
import type { PathMesh, PathRaw } from './contract.ts';

function meshArea(mesh: Readonly<PathMesh>): number {
  let area = 0.0;
  let i = 0;
  while (i < mesh.indices.length) {
    const i0 = mesh.indices[i];
    const i1 = mesh.indices[i + 1];
    const i2 = mesh.indices[i + 2];
    const ax = mesh.vertices[i0 * 2];
    const ay = mesh.vertices[i0 * 2 + 1];
    const bx = mesh.vertices[i1 * 2];
    const by = mesh.vertices[i1 * 2 + 1];
    const cx = mesh.vertices[i2 * 2];
    const cy = mesh.vertices[i2 * 2 + 1];
    area += Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2.0;
    i += 3;
  }
  return area;
}

function polygon(points: Readonly<number[]>): PathRaw {
  let path = createPath('nonZero');
  appendPathMoveTo(path, points[0], points[1]);
  let i = 2;
  while (i < points.length) {
    appendPathLineTo(path, points[i], points[i + 1]);
    i += 2;
  }
  return path;
}

describe('tessellatePath', () => {
  it('triangulates triangle into one triangle', () => {
    const path = polygon([0.0, 0.0, 10.0, 0.0, 0.0, 10.0]);
    const mesh = tessellatePath(path, 0.25);
    expect(mesh.indices.length).toEqual(3);
    expect(Math.abs(meshArea(mesh) - 50.0) < 0.005).toBe(true);
  });
  it('triangulates square into two triangles covering its area', () => {
    const path = polygon([0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0]);
    const mesh = tessellatePath(path, 0.25);
    expect(mesh.indices.length).toEqual(6);
    expect(Math.abs(meshArea(mesh) - 100.0) < 0.005).toBe(true);
  });
  it('triangulates concave l shape conserving area', () => {
    const path = polygon([0.0, 0.0, 20.0, 0.0, 20.0, 10.0, 10.0, 10.0, 10.0, 20.0, 0.0, 20.0]);
    const mesh = tessellatePath(path, 0.25);
    expect(mesh.indices.length).toEqual(12);
    expect(Math.abs(meshArea(mesh) - 300.0) < 0.005).toBe(true);
  });
  it('drops trailing point that closes contour explicitly', () => {
    const path = polygon([0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0, 0.0, 0.0]);
    const mesh = tessellatePath(path, 0.25);
    expect(mesh.vertices.length).toEqual(8);
    expect(Math.abs(meshArea(mesh) - 100.0) < 0.005).toBe(true);
  });
  it('produces empty mesh for degenerate contour', () => {
    const path = polygon([0.0, 0.0, 10.0, 0.0]);
    const mesh = tessellatePath(path, 0.25);
    expect(mesh.indices.length === 0).toBe(true);
    expect(mesh.vertices.length === 0).toBe(true);
  });
  it('returns empty for empty path', () => {
    const path = createPath('nonZero');
    const mesh = tessellatePath(path, 0.25);
    expect(mesh.vertices.length === 0).toBe(true);
    expect(mesh.indices.length === 0).toBe(true);
  });
  it('triangulates rectangle', () => {
    let path = createPath('nonZero');
    appendPathRectangle(path, 0.0, 0.0, 100.0, 100.0);
    const mesh = tessellatePath(path, 0.25);
    expect(mesh.vertices.length >= 8).toBe(true);
    expect(mesh.indices.length >= 6).toBe(true);
    expect(mesh.indices.length % 3).toEqual(0);
  });
});

describe('tessellatePathInto', () => {
  // Rust-only: reuses output vertex and index storage across calls
  it('writes same result as tessellate path into provided mesh', () => {
    const path = polygon([0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0]);
    const expected = tessellatePath(path, 0.25);
    let out: PathMesh = { vertices: [], indices: [] };
    tessellatePathInto(path, out, 0.25);
    expect(out.vertices).toEqual(expected.vertices);
    expect(out.indices).toEqual(expected.indices);
  });
  it('clears previous contents before writing', () => {
    const path = polygon([0.0, 0.0, 10.0, 0.0, 0.0, 10.0]);
    let out: PathMesh = { vertices: [99.0, 99.0, 99.0], indices: [0, 1, 2, 3] };
    tessellatePathInto(path, out, 0.25);
    expect(out.indices.length).toEqual(3);
    expect(out.vertices.length).toEqual(6);
  });
});
