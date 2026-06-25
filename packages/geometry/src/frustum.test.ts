import {
  createAabb,
  createBoundingSphere,
  createFrustum,
  createMatrix4,
  createPerspectiveMatrix4,
  createVector3,
  getFrustumCorners,
  inverseMatrix4,
  isFrustumContainingPoint,
  isFrustumIntersectingAabb,
  isFrustumIntersectingSphere,
  multiplyMatrix4,
  setFrustumFromMatrix4,
  setMatrix4LookAt,
} from '@flighthq/geometry';
import type { Matrix4 } from '@flighthq/types';

// View-projection for a camera at (0,0,5) looking toward the origin down -z.
function createTestViewProjection(): Matrix4 {
  const projection = createPerspectiveMatrix4(0.5, 1, 0.1, 100);
  const view = createMatrix4();
  setMatrix4LookAt(view, createVector3(0, 0, 5), createVector3(0, 0, 0), createVector3(0, 1, 0));
  const vp = createMatrix4();
  multiplyMatrix4(vp, projection, view);
  return vp;
}

describe('createFrustum', () => {
  it('creates six independent planes', () => {
    const f = createFrustum();
    expect(f.left).not.toBe(f.right);
    expect(f.near).not.toBe(f.far);
    expect(f.top.a).toBe(0);
  });
});

describe('getFrustumCorners', () => {
  it('writes 8 corners for a perspective frustum', () => {
    const vp = createTestViewProjection();
    const inv = createMatrix4();
    inverseMatrix4(inv, vp);
    const corners = Array.from({ length: 8 }, () => createVector3());
    getFrustumCorners(corners, inv);
    // All 8 corners should be finite and distinct
    const seen = new Set<string>();
    for (const c of corners) {
      expect(isFinite(c.x)).toBe(true);
      expect(isFinite(c.y)).toBe(true);
      expect(isFinite(c.z)).toBe(true);
      seen.add(`${c.x.toFixed(4)},${c.y.toFixed(4)},${c.z.toFixed(4)}`);
    }
    expect(seen.size).toBe(8);
  });

  it('near corners are closer to the camera than far corners', () => {
    const vp = createTestViewProjection();
    const inv = createMatrix4();
    inverseMatrix4(inv, vp);
    const corners = Array.from({ length: 8 }, () => createVector3());
    getFrustumCorners(corners, inv);
    // Camera at (0,0,5) looking toward origin along -z; near z > far z
    const nearZ = corners.slice(0, 4).map((c) => c.z);
    const farZ = corners.slice(4, 8).map((c) => c.z);
    for (const nz of nearZ) {
      for (const fz of farZ) {
        expect(nz).toBeGreaterThan(fz);
      }
    }
  });

  it('writes only as many corners as out.length', () => {
    const vp = createTestViewProjection();
    const inv = createMatrix4();
    inverseMatrix4(inv, vp);
    const corners = [createVector3(), createVector3()];
    getFrustumCorners(corners, inv);
    // Only first 2 corners written; rest untouched (default to 0,0,0)
    expect(isFinite(corners[0].x)).toBe(true);
    expect(isFinite(corners[1].x)).toBe(true);
  });
});

describe('isFrustumContainingPoint', () => {
  it('contains a point in front of the camera', () => {
    const f = createFrustum();
    setFrustumFromMatrix4(f, createTestViewProjection());
    expect(isFrustumContainingPoint(f, createVector3(0, 0, 0))).toBe(true);
  });

  it('rejects a point behind the camera', () => {
    const f = createFrustum();
    setFrustumFromMatrix4(f, createTestViewProjection());
    expect(isFrustumContainingPoint(f, createVector3(0, 0, 20))).toBe(false);
  });

  it('rejects a point far off to the side', () => {
    const f = createFrustum();
    setFrustumFromMatrix4(f, createTestViewProjection());
    expect(isFrustumContainingPoint(f, createVector3(100, 0, 0))).toBe(false);
  });
});

describe('isFrustumIntersectingAabb', () => {
  it('accepts a box straddling the origin', () => {
    const f = createFrustum();
    setFrustumFromMatrix4(f, createTestViewProjection());
    expect(isFrustumIntersectingAabb(f, createAabb(-1, -1, -1, 1, 1, 1))).toBe(true);
  });

  it('rejects a box entirely behind the camera', () => {
    const f = createFrustum();
    setFrustumFromMatrix4(f, createTestViewProjection());
    expect(isFrustumIntersectingAabb(f, createAabb(-1, -1, 10, 1, 1, 12))).toBe(false);
  });

  it('rejects a box far off to the side', () => {
    const f = createFrustum();
    setFrustumFromMatrix4(f, createTestViewProjection());
    expect(isFrustumIntersectingAabb(f, createAabb(50, 50, -1, 60, 60, 1))).toBe(false);
  });
});

describe('isFrustumIntersectingSphere', () => {
  it('accepts a sphere centered in front of the camera', () => {
    const f = createFrustum();
    setFrustumFromMatrix4(f, createTestViewProjection());
    expect(isFrustumIntersectingSphere(f, createBoundingSphere(0, 0, 0, 1))).toBe(true);
  });

  it('rejects a sphere entirely behind the camera', () => {
    const f = createFrustum();
    setFrustumFromMatrix4(f, createTestViewProjection());
    expect(isFrustumIntersectingSphere(f, createBoundingSphere(0, 0, 20, 1))).toBe(false);
  });

  it('rejects an empty sphere (negative radius)', () => {
    const f = createFrustum();
    setFrustumFromMatrix4(f, createTestViewProjection());
    expect(isFrustumIntersectingSphere(f, createBoundingSphere(0, 0, 0, -1))).toBe(false);
  });

  it('accepts a sphere that straddles the near plane', () => {
    const f = createFrustum();
    setFrustumFromMatrix4(f, createTestViewProjection());
    // Near plane is at z ≈ 4.9 (camera at z=5, near=0.1). A sphere centered just behind the
    // near plane with a radius that crosses it should still intersect.
    expect(isFrustumIntersectingSphere(f, createBoundingSphere(0, 0, 5.5, 2))).toBe(true);
  });
});

describe('setFrustumFromMatrix4', () => {
  it('produces unit-length plane normals', () => {
    const f = createFrustum();
    setFrustumFromMatrix4(f, createTestViewProjection());
    const near = f.near;
    const len = Math.sqrt(near.a * near.a + near.b * near.b + near.c * near.c);
    expect(len).toBeCloseTo(1, 5);
  });
});
