import {
  createAabb,
  createFrustum,
  createMatrix4,
  createPerspectiveMatrix4,
  createVector3,
  isFrustumContainingPoint,
  isFrustumIntersectingAabb,
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

describe('setFrustumFromMatrix4', () => {
  it('produces unit-length plane normals', () => {
    const f = createFrustum();
    setFrustumFromMatrix4(f, createTestViewProjection());
    const near = f.near;
    const len = Math.sqrt(near.a * near.a + near.b * near.b + near.c * near.c);
    expect(len).toBeCloseTo(1, 5);
  });
});
