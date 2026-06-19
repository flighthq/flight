import type { PathMesh } from '@flighthq/types';

import { appendPathLineTo, appendPathMoveTo, createPath } from './path';
import { tessellatePath } from './tessellatePath';

function meshArea(mesh: PathMesh): number {
  let area = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const i0 = mesh.indices[i];
    const i1 = mesh.indices[i + 1];
    const i2 = mesh.indices[i + 2];
    const ax = mesh.vertices[i0 * 2];
    const ay = mesh.vertices[i0 * 2 + 1];
    const bx = mesh.vertices[i1 * 2];
    const by = mesh.vertices[i1 * 2 + 1];
    const cx = mesh.vertices[i2 * 2];
    const cy = mesh.vertices[i2 * 2 + 1];
    area += Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
  }
  return area;
}

function polygon(...points: number[]): ReturnType<typeof createPath> {
  const path = createPath();
  appendPathMoveTo(path, points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) {
    appendPathLineTo(path, points[i], points[i + 1]);
  }
  return path;
}

describe('tessellatePath', () => {
  it('triangulates a triangle into one triangle', () => {
    const mesh = tessellatePath(polygon(0, 0, 10, 0, 0, 10));
    expect(mesh.indices).toHaveLength(3);
    expect(meshArea(mesh)).toBeCloseTo(50);
  });

  it('triangulates a square into two triangles covering its area', () => {
    const mesh = tessellatePath(polygon(0, 0, 10, 0, 10, 10, 0, 10));
    expect(mesh.indices).toHaveLength(6);
    expect(meshArea(mesh)).toBeCloseTo(100);
  });

  it('triangulates a concave L-shape conserving area (n-2 triangles)', () => {
    const mesh = tessellatePath(polygon(0, 0, 20, 0, 20, 10, 10, 10, 10, 20, 0, 20));
    expect(mesh.indices).toHaveLength(12); // 6 vertices → 4 triangles
    expect(meshArea(mesh)).toBeCloseTo(300);
  });

  it('drops a trailing point that closes the contour explicitly', () => {
    const mesh = tessellatePath(polygon(0, 0, 10, 0, 10, 10, 0, 10, 0, 0));
    expect(mesh.vertices).toHaveLength(8); // 4 unique vertices, not 5
    expect(meshArea(mesh)).toBeCloseTo(100);
  });

  it('produces an empty mesh for a degenerate contour', () => {
    const mesh = tessellatePath(polygon(0, 0, 10, 0));
    expect(mesh.indices).toHaveLength(0);
    expect(mesh.vertices).toHaveLength(0);
  });
});
