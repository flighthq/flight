import {
  createCollisionContactManifold3D,
  createCollisionRaycastHit3D,
  createCollisionTimeOfImpact3D,
  createCollisionTriangleMesh3D,
  registerBuiltInCollisionFaceQueries3D,
  registerBuiltInCollisionSupports3D,
} from '@flighthq/collision/contract';
import type { CollisionShape3D } from '@flighthq/types/contract';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  collidePhysics3DColliderShapes,
  raycastPhysics3DColliderShape,
  sweepPhysics3DColliderShapes,
} from './colliderCollision';

beforeEach(() => {
  registerBuiltInCollisionSupports3D();
  registerBuiltInCollisionFaceQueries3D();
});

describe('collidePhysics3DColliderShapes', () => {
  it('preserves argument-oriented normals when the mesh is first', () => {
    const mesh = createFloorMesh();
    const sphere: CollisionShape3D = { kind: 'sphere', x: 0, y: 0.4, z: 0, radius: 0.5 };
    const manifold = createCollisionContactManifold3D();

    expect(collidePhysics3DColliderShapes(mesh, sphere, manifold)).toBe(true);
    expect(manifold.normalY).toBeLessThan(-0.99);
    expect(collidePhysics3DColliderShapes(sphere, mesh, manifold)).toBe(true);
    expect(manifold.normalY).toBeGreaterThan(0.99);
  });
});

describe('raycastPhysics3DColliderShape', () => {
  it('routes concave surfaces through their triangle query', () => {
    const hit = createCollisionRaycastHit3D();
    expect(raycastPhysics3DColliderShape(createFloorMesh(), 0, 2, 0, 0, -1, 0, hit, 10)).toBe(true);
    expect(hit.fraction).toBeCloseTo(2, 12);
  });
});

describe('sweepPhysics3DColliderShapes', () => {
  it('preserves argument-oriented normals when the mesh is first', () => {
    const mesh = createFloorMesh();
    const sphere: CollisionShape3D = { kind: 'sphere', x: 0, y: 2, z: 0, radius: 0.25 };
    const hit = createCollisionTimeOfImpact3D();

    expect(sweepPhysics3DColliderShapes(mesh, 0, 0, 0, sphere, 0, -4, 0, hit, 1)).toBe(true);
    expect(hit.normalY).toBeLessThan(-0.99);
  });
});

function createFloorMesh() {
  return createCollisionTriangleMesh3D([-5, 0, -5, 5, 0, -5, 5, 0, 5, -5, 0, 5], [0, 2, 1, 0, 3, 2]);
}
