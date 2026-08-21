import type { CollisionShape3D } from '@flighthq/types/contract';
import { beforeEach, describe, expect, it } from 'vitest';

import { registerBuiltInCollisionFaceQueries3D } from './collisionFace3D';
import { registerBuiltInCollisionSupports3D } from './collisionSupport3D';
import { createCollisionContactManifold3D } from './contactManifold3D';
import { createCollisionRaycastHit3D } from './raycastCollisionShape3D';
import { createCollisionTimeOfImpact3D } from './sweepCollisionShape3D';
import {
  collideCollisionHeightfield3D,
  collideCollisionTriangleMesh3D,
  createCollisionHeightfield3D,
  createCollisionTriangleMesh3D,
  getCollisionHeightfieldValidationStatus3D,
  getCollisionTriangleMeshValidationStatus3D,
  invalidateCollisionHeightfield3D,
  invalidateCollisionTriangleMesh3D,
  raycastCollisionHeightfield3D,
  raycastCollisionTriangleMesh3D,
  sweepCollisionHeightfield3D,
  sweepCollisionTriangleMesh3D,
  writeCollisionHeightfieldBounds3D,
  writeCollisionTriangleMeshBounds3D,
} from './triangleMesh3D';

beforeEach(() => {
  registerBuiltInCollisionSupports3D();
  registerBuiltInCollisionFaceQueries3D();
});

describe('collideCollisionHeightfield3D', () => {
  it('collides a convex body with a sloped height grid', () => {
    const heightfield = createCollisionHeightfield3D(2, 2, [0, 1, 0, 1]);
    const sphere: CollisionShape3D = { kind: 'sphere', x: 0.5, y: 0.9, z: 0.5, radius: 0.5 };
    const manifold = createCollisionContactManifold3D();

    expect(collideCollisionHeightfield3D(sphere, heightfield, manifold)).toBe(true);
    expect(manifold.pointCount).toBeGreaterThan(0);
    expect(manifold.normalY).toBeGreaterThan(0);
    expect(manifold.normalX).toBeLessThan(0);
  });

  it('observes height edits after invalidation', () => {
    const heightfield = createCollisionHeightfield3D(2, 2, [0, 0, 0, 0]);
    const sphere: CollisionShape3D = { kind: 'sphere', x: 0.5, y: 1.5, z: 0.5, radius: 0.25 };
    const manifold = createCollisionContactManifold3D();
    expect(collideCollisionHeightfield3D(sphere, heightfield, manifold)).toBe(false);

    heightfield.heights.fill(1.4);
    invalidateCollisionHeightfield3D(heightfield);
    expect(collideCollisionHeightfield3D(sphere, heightfield, manifold)).toBe(true);
  });
});

describe('collideCollisionTriangleMesh3D', () => {
  it('reduces adjacent floor triangles to one distributed four-point patch', () => {
    const mesh = createFloorMesh();
    const box: CollisionShape3D = {
      kind: 'box',
      x: 0,
      y: 0.4,
      z: 0,
      halfX: 0.5,
      halfY: 0.5,
      halfZ: 0.5,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      rotationW: 1,
    };
    const manifold = createCollisionContactManifold3D();

    expect(collideCollisionTriangleMesh3D(box, mesh, manifold)).toBe(true);
    expect(manifold.normalY).toBeCloseTo(1, 12);
    expect(manifold.pointCount).toBe(4);
    expect(new Set(manifold.points.slice(0, 4).map((point) => `${point.x},${point.z}`)).size).toBe(4);
  });

  it('keeps the acceleration local while the mesh pose rotates', () => {
    const mesh = createFloorMesh();
    mesh.rotationZ = Math.SQRT1_2;
    mesh.rotationW = Math.SQRT1_2;
    mesh.x = 2;
    const sphere: CollisionShape3D = { kind: 'sphere', x: 1.6, y: 0, z: 0, radius: 0.5 };
    const manifold = createCollisionContactManifold3D();

    expect(collideCollisionTriangleMesh3D(sphere, mesh, manifold)).toBe(true);
    expect(manifold.normalX).toBeLessThan(-0.99);
  });

  it('rebuilds the acceleration when point payload changes', () => {
    const mesh = createFloorMesh();
    const sphere: CollisionShape3D = { kind: 'sphere', x: 0, y: 1.5, z: 0, radius: 0.25 };
    const manifold = createCollisionContactManifold3D();
    expect(collideCollisionTriangleMesh3D(sphere, mesh, manifold)).toBe(false);

    for (let i = 1; i < mesh.points.length; i += 3) mesh.points[i] = 1.4;
    invalidateCollisionTriangleMesh3D(mesh);
    expect(collideCollisionTriangleMesh3D(sphere, mesh, manifold)).toBe(true);
  });
});

describe('createCollisionHeightfield3D', () => {
  it('copies the height payload and starts with an identity pose', () => {
    const heights = [0, 1, 2, 3];
    const heightfield = createCollisionHeightfield3D(2, 2, heights, 2, 3);
    heights[0] = 99;
    expect(heightfield.heights).toEqual([0, 1, 2, 3]);
    expect(heightfield.cellSizeX).toBe(2);
    expect(heightfield.cellSizeZ).toBe(3);
    expect(heightfield.rotationW).toBe(1);
  });
});

describe('createCollisionTriangleMesh3D', () => {
  it('copies both payload arrays and starts with an identity pose', () => {
    const points = [0, 0, 0, 1, 0, 0, 0, 0, 1];
    const indices = [0, 1, 2];
    const mesh = createCollisionTriangleMesh3D(points, indices);
    points[0] = 99;
    indices[0] = 2;
    expect(mesh.points[0]).toBe(0);
    expect(mesh.indices).toEqual([0, 1, 2]);
    expect(mesh.rotationW).toBe(1);
  });
});

describe('getCollisionHeightfieldValidationStatus3D', () => {
  it('rejects malformed grids, samples, spacing, and poses', () => {
    expect(getCollisionHeightfieldValidationStatus3D(createCollisionHeightfield3D(1, 2, [0, 0]))).toBe(
      'degenerate-shape',
    );
    expect(getCollisionHeightfieldValidationStatus3D(createCollisionHeightfield3D(2, 2, [0, 0, 0]))).toBe(
      'degenerate-shape',
    );
    expect(getCollisionHeightfieldValidationStatus3D(createCollisionHeightfield3D(2, 2, [0, NaN, 0, 0]))).toBe(
      'degenerate-shape',
    );
    expect(getCollisionHeightfieldValidationStatus3D(createCollisionHeightfield3D(2, 2, [0, 0, 0, 0], 0))).toBe(
      'degenerate-shape',
    );
    const invalidPose = createCollisionHeightfield3D(2, 2, [0, 0, 0, 0]);
    invalidPose.rotationW = 2;
    expect(getCollisionHeightfieldValidationStatus3D(invalidPose)).toBe('degenerate-shape');
  });
});

describe('getCollisionTriangleMeshValidationStatus3D', () => {
  it('rejects malformed, out-of-range, and degenerate triangles', () => {
    expect(getCollisionTriangleMeshValidationStatus3D(createCollisionTriangleMesh3D([], []))).toBe('degenerate-shape');
    expect(
      getCollisionTriangleMeshValidationStatus3D(createCollisionTriangleMesh3D([0, 0, 0, 1, 0, 0, 0, 0, 1], [0, 1, 3])),
    ).toBe('degenerate-shape');
    expect(
      getCollisionTriangleMeshValidationStatus3D(createCollisionTriangleMesh3D([0, 0, 0, 1, 0, 0, 2, 0, 0], [0, 1, 2])),
    ).toBe('degenerate-shape');
  });
});

describe('invalidateCollisionHeightfield3D', () => {
  it('increments the payload version', () => {
    const heightfield = createCollisionHeightfield3D(2, 2, [0, 0, 0, 0]);
    invalidateCollisionHeightfield3D(heightfield);
    expect(heightfield.version).toBe(1);
  });
});

describe('invalidateCollisionTriangleMesh3D', () => {
  it('increments the payload version', () => {
    const mesh = createFloorMesh();
    invalidateCollisionTriangleMesh3D(mesh);
    expect(mesh.version).toBe(1);
  });
});

describe('raycastCollisionHeightfield3D', () => {
  it('reports the nearest terrain surface with a ray-facing normal', () => {
    const heightfield = createCollisionHeightfield3D(2, 2, [0, 0, 0, 0]);
    const hit = createCollisionRaycastHit3D();
    expect(raycastCollisionHeightfield3D(heightfield, 0.5, 2, 0.5, 0, -4, 0, hit, 1)).toBe(true);
    expect(hit.fraction).toBeCloseTo(0.5, 12);
    expect(hit.normalY).toBe(1);
  });
});

describe('raycastCollisionTriangleMesh3D', () => {
  it('returns the closest triangle through the local BVH', () => {
    const mesh = createCollisionTriangleMesh3D(
      [-1, 0, -1, 1, 0, -1, 0, 0, 1, -1, -2, -1, 1, -2, -1, 0, -2, 1],
      [0, 1, 2, 3, 4, 5],
    );
    const hit = createCollisionRaycastHit3D();
    expect(raycastCollisionTriangleMesh3D(mesh, 0, 2, 0, 0, -1, 0, hit)).toBe(true);
    expect(hit.fraction).toBeCloseTo(2, 12);
    expect(hit.normalY).toBe(1);
  });
});

describe('sweepCollisionHeightfield3D', () => {
  it("finds a fast convex body's first terrain impact", () => {
    const heightfield = createCollisionHeightfield3D(2, 2, [0, 0, 0, 0]);
    const sphere: CollisionShape3D = { kind: 'sphere', x: 0.5, y: 5, z: 0.5, radius: 0.25 };
    const hit = createCollisionTimeOfImpact3D();
    expect(sweepCollisionHeightfield3D(sphere, 0, -10, 0, heightfield, hit)).toBe(true);
    expect(hit.fraction).toBeCloseTo(0.475, 5);
    expect(hit.normalY).toBeGreaterThan(0.99);
  });
});

describe('sweepCollisionTriangleMesh3D', () => {
  it("finds a fast convex body's first mesh impact", () => {
    const mesh = createFloorMesh();
    const sphere: CollisionShape3D = { kind: 'sphere', x: 0, y: 5, z: 0, radius: 0.25 };
    const hit = createCollisionTimeOfImpact3D();
    expect(sweepCollisionTriangleMesh3D(sphere, 0, -10, 0, mesh, hit)).toBe(true);
    expect(hit.fraction).toBeCloseTo(0.475, 5);
  });
});

describe('writeCollisionHeightfieldBounds3D', () => {
  it('includes the height samples and pose', () => {
    const heightfield = createCollisionHeightfield3D(2, 2, [0, 1, -1, 0], 2, 3);
    heightfield.x = 4;
    const bounds = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
    writeCollisionHeightfieldBounds3D(heightfield, bounds);
    expect(bounds).toEqual({ minX: 4, minY: -1, minZ: 0, maxX: 6, maxY: 1, maxZ: 3 });
  });
});

describe('writeCollisionTriangleMeshBounds3D', () => {
  it('transforms local acceleration bounds into world space', () => {
    const mesh = createFloorMesh();
    mesh.rotationZ = Math.SQRT1_2;
    mesh.rotationW = Math.SQRT1_2;
    mesh.x = 2;
    const bounds = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
    writeCollisionTriangleMeshBounds3D(mesh, bounds);
    expect(bounds.minX).toBeCloseTo(2, 12);
    expect(bounds.maxX).toBeCloseTo(2, 12);
    expect(bounds.minY).toBeCloseTo(-5, 12);
    expect(bounds.maxY).toBeCloseTo(5, 12);
  });
});

function createFloorMesh() {
  return createCollisionTriangleMesh3D([-5, 0, -5, 5, 0, -5, 5, 0, 5, -5, 0, 5], [0, 2, 1, 0, 3, 2]);
}
