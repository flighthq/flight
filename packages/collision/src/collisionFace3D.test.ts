import type { CollisionShape3D } from '@flighthq/types/contract';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  getCollisionFaceQuery3D,
  queryCollisionAabbFace3D,
  queryCollisionBoxFace3D,
  queryCollisionCapsuleFace3D,
  queryCollisionConvexFace3D,
  registerBuiltInCollisionFaceQueries3D,
  registerCollisionFaceQuery3D,
} from './collisionFace3D';

beforeEach(() => {
  registerBuiltInCollisionFaceQueries3D();
});

const face: number[] = [];

// Every vertex of a face must share one coordinate along the face's axis — that is what makes it a
// face rather than a scattering of points.
function expectCoplanarAlong(vertices: readonly number[], count: number, axis: number, value: number): void {
  for (let i = 0; i < count; i += 1) {
    expect(vertices[i * 3 + axis]).toBeCloseTo(value, 9);
  }
}

describe('getCollisionFaceQuery3D', () => {
  it('returns null for a kind with no registered face query', () => {
    expect(getCollisionFaceQuery3D('acme.blob')).toBeNull();
  });

  it('returns null for sphere, which is curved everywhere and has no face', () => {
    // Absent rather than a zero-returning stub: both reach the single-point fallback, and only one of
    // them requires writing a function body that pretends to have looked.
    expect(getCollisionFaceQuery3D('sphere')).toBeNull();
  });

  it('finds the four kinds that have faces', () => {
    for (const kind of ['aabb', 'box', 'capsule', 'convex']) {
      expect(getCollisionFaceQuery3D(kind)).not.toBeNull();
    }
  });
});

describe('queryCollisionAabbFace3D', () => {
  const box: CollisionShape3D = { kind: 'aabb', minX: -1, minY: -2, minZ: -3, maxX: 1, maxY: 2, maxZ: 3 };

  it('returns the four corners of the face the direction selects', () => {
    expect(queryCollisionAabbFace3D(box, 0, 1, 0, face)).toBe(4);
    expectCoplanarAlong(face, 4, 1, 2);
    expect(queryCollisionAabbFace3D(box, 0, -1, 0, face)).toBe(4);
    expectCoplanarAlong(face, 4, 1, -2);
  });

  it('selects by dominant axis, so a slightly tilted direction still names a face', () => {
    expect(queryCollisionAabbFace3D(box, 0.05, 1, -0.05, face)).toBe(4);
    expectCoplanarAlong(face, 4, 1, 2);
  });

  it('spans the whole face extent on the other two axes', () => {
    queryCollisionAabbFace3D(box, 1, 0, 0, face);
    const ys = [face[1], face[4], face[7], face[10]];
    const zs = [face[2], face[5], face[8], face[11]];
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(4, 9);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(6, 9);
  });
});

describe('queryCollisionBoxFace3D', () => {
  it('matches the aabb query when the rotation is identity', () => {
    const oriented: CollisionShape3D = {
      kind: 'box',
      x: 0,
      y: 0,
      z: 0,
      halfX: 1,
      halfY: 2,
      halfZ: 3,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      rotationW: 1,
    };
    expect(queryCollisionBoxFace3D(oriented, 0, 1, 0, face)).toBe(4);
    expectCoplanarAlong(face, 4, 1, 2);
  });

  it('returns the spun face for a rotated box', () => {
    const oriented: CollisionShape3D = {
      kind: 'box',
      x: 0,
      y: 0,
      z: 0,
      halfX: 1,
      halfY: 1,
      halfZ: 1,
      rotationX: 0,
      rotationY: Math.sin(Math.PI / 8),
      rotationZ: 0,
      rotationW: Math.cos(Math.PI / 8),
    };
    // Spun about y, so the top face is still flat at y = 1 but its corners have turned in x and z.
    expect(queryCollisionBoxFace3D(oriented, 0, 1, 0, face)).toBe(4);
    expectCoplanarAlong(face, 4, 1, 1);
    const xs = [face[0], face[3], face[6], face[9]];
    expect(Math.max(...xs)).toBeCloseTo(Math.SQRT2, 6);
  });
});

describe('queryCollisionCapsuleFace3D', () => {
  const lying: CollisionShape3D = { kind: 'capsule', x0: -2, y0: 0, z0: 0, x1: 2, y1: 0, z1: 0, radius: 0.5 };

  it('returns the two offset endpoints when the direction crosses the axis', () => {
    expect(queryCollisionCapsuleFace3D(lying, 0, -1, 0, face)).toBe(2);
    expect(face[0]).toBeCloseTo(-2, 9);
    expect(face[1]).toBeCloseTo(-0.5, 9);
    expect(face[3]).toBeCloseTo(2, 9);
    expect(face[4]).toBeCloseTo(-0.5, 9);
  });

  it('returns no face along the axis, where the capsule presents a curved cap', () => {
    expect(queryCollisionCapsuleFace3D(lying, 1, 0, 0, face)).toBe(0);
  });

  it('returns no face for a zero-length segment, which is a sphere', () => {
    const degenerate: CollisionShape3D = { kind: 'capsule', x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, radius: 1 };
    expect(queryCollisionCapsuleFace3D(degenerate, 0, 1, 0, face)).toBe(0);
  });

  it('returns no face for a zero direction rather than dividing by zero', () => {
    expect(queryCollisionCapsuleFace3D(lying, 0, 0, 0, face)).toBe(0);
  });
});

describe('queryCollisionConvexFace3D', () => {
  // A unit cube as a bare vertex list — no face indices anywhere.
  const cube: CollisionShape3D = {
    kind: 'convex',
    points: [-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1],
  };

  it('recovers a face from the vertex list alone, with no topology', () => {
    expect(queryCollisionConvexFace3D(cube, 0, 0, 1, face)).toBe(4);
    expectCoplanarAlong(face, 4, 2, 1);
  });

  it('winds the recovered face so consecutive vertices are adjacent, not diagonal', () => {
    queryCollisionConvexFace3D(cube, 0, 0, 1, face);
    // On a unit-cube face each edge is 2 long and each diagonal is 2*sqrt(2); an unsorted list would
    // produce at least one diagonal step.
    for (let i = 0; i < 4; i += 1) {
      const next = (i + 1) % 4;
      const dx = face[next * 3] - face[i * 3];
      const dy = face[next * 3 + 1] - face[i * 3 + 1];
      const dz = face[next * 3 + 2] - face[i * 3 + 2];
      expect(Math.sqrt(dx * dx + dy * dy + dz * dz)).toBeCloseTo(2, 6);
    }
  });

  it('returns a single vertex when the direction picks out a corner', () => {
    expect(queryCollisionConvexFace3D(cube, 1, 1, 1, face)).toBe(1);
  });

  it('returns an edge when the direction picks out one', () => {
    expect(queryCollisionConvexFace3D(cube, 1, 1, 0, face)).toBe(2);
  });

  it('returns no face for an empty hull or a zero direction', () => {
    expect(queryCollisionConvexFace3D({ kind: 'convex', points: [] }, 0, 1, 0, face)).toBe(0);
    expect(queryCollisionConvexFace3D(cube, 0, 0, 0, face)).toBe(0);
  });
});

describe('registerBuiltInCollisionFaceQueries3D', () => {
  it('binds each built-in kind to its own query', () => {
    expect(getCollisionFaceQuery3D('aabb')).toBe(queryCollisionAabbFace3D);
    expect(getCollisionFaceQuery3D('box')).toBe(queryCollisionBoxFace3D);
    expect(getCollisionFaceQuery3D('capsule')).toBe(queryCollisionCapsuleFace3D);
    expect(getCollisionFaceQuery3D('convex')).toBe(queryCollisionConvexFace3D);
  });
});

describe('registerCollisionFaceQuery3D', () => {
  it('is last-write-wins so a caller can override a built-in', () => {
    const custom = () => 0;
    registerCollisionFaceQuery3D('aabb', custom);
    expect(getCollisionFaceQuery3D('aabb')).toBe(custom);
    registerBuiltInCollisionFaceQueries3D();
    expect(getCollisionFaceQuery3D('aabb')).toBe(queryCollisionAabbFace3D);
  });
});
