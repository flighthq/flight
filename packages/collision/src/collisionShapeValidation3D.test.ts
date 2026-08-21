import type { CollisionShape3D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  getCollisionConvexValidationStatus3D,
  getCollisionShapeValidationStatus3D,
} from './collisionShapeValidation3D';

describe('getCollisionConvexValidationStatus3D', () => {
  it('accepts a triangle, which is coplanar and encloses no volume', () => {
    // Load-bearing rather than incidental. `CollisionShapeKind3D` documents decomposition as the route a
    // concave mesh takes into the narrow phase, and decomposition emits individual triangles — so a
    // positive-VOLUME test here would reject the one input the design names.
    expect(getCollisionConvexValidationStatus3D([0, 0, 0, 1, 0, 0, 0, 1, 0])).toBeNull();
  });

  it('rejects fewer than three vertices', () => {
    expect(getCollisionConvexValidationStatus3D([0, 0, 0, 1, 0, 0])).toBe('degenerate-shape');
    expect(getCollisionConvexValidationStatus3D([])).toBe('degenerate-shape');
  });

  it('rejects a vertex list that is not a whole number of triples', () => {
    expect(getCollisionConvexValidationStatus3D([0, 0, 0, 1, 0, 0, 0, 1])).toBe('degenerate-shape');
  });

  it('rejects a non-finite coordinate', () => {
    expect(getCollisionConvexValidationStatus3D([0, 0, 0, 1, 0, 0, 0, NaN, 0])).toBe('degenerate-shape');
    expect(getCollisionConvexValidationStatus3D([0, 0, 0, 1, 0, 0, 0, Infinity, 0])).toBe('degenerate-shape');
  });

  it('rejects vertices that are all one point, which has no extent in any axis', () => {
    expect(getCollisionConvexValidationStatus3D([2, 3, 4, 2, 3, 4, 2, 3, 4])).toBe('degenerate-shape');
  });

  it('accepts extent along a single axis', () => {
    // A degenerate-looking line still has a well-defined support function, which is the whole contract a
    // convex hull owes. Extent in one axis is enough.
    expect(getCollisionConvexValidationStatus3D([0, 0, 0, 1, 0, 0, 2, 0, 0])).toBeNull();
  });
});

describe('getCollisionShapeValidationStatus3D', () => {
  it('accepts every well-formed built-in kind', () => {
    expect(getCollisionShapeValidationStatus3D({ kind: 'sphere', radius: 1, x: 0, y: 0, z: 0 })).toBeNull();
    expect(
      getCollisionShapeValidationStatus3D({
        kind: 'aabb',
        maxX: 1,
        maxY: 1,
        maxZ: 1,
        minX: 0,
        minY: 0,
        minZ: 0,
      }),
    ).toBeNull();
    expect(
      getCollisionShapeValidationStatus3D({
        halfX: 1,
        halfY: 1,
        halfZ: 1,
        kind: 'box',
        rotationW: 1,
        rotationX: 0,
        rotationY: 0,
        rotationZ: 0,
        x: 0,
        y: 0,
        z: 0,
      }),
    ).toBeNull();
    expect(
      getCollisionShapeValidationStatus3D({ kind: 'capsule', radius: 1, x0: 0, x1: 1, y0: 0, y1: 0, z0: 0, z1: 0 }),
    ).toBeNull();
    expect(getCollisionShapeValidationStatus3D({ kind: 'convex', points: [0, 0, 0, 1, 0, 0, 0, 1, 0] })).toBeNull();
  });

  it('rejects a zero or negative radius but accepts a zero-length capsule segment', () => {
    expect(getCollisionShapeValidationStatus3D({ kind: 'sphere', radius: 0, x: 0, y: 0, z: 0 })).toBe(
      'degenerate-shape',
    );
    expect(
      getCollisionShapeValidationStatus3D({ kind: 'capsule', radius: -1, x0: 0, x1: 1, y0: 0, y1: 0, z0: 0, z1: 0 }),
    ).toBe('degenerate-shape');

    // A capsule whose endpoints coincide is a SPHERE, not a degenerate shape. `CollisionCapsule3D` chose
    // the segment-plus-radius form precisely so this case needs no special handling.
    expect(
      getCollisionShapeValidationStatus3D({ kind: 'capsule', radius: 1, x0: 5, x1: 5, y0: 5, y1: 5, z0: 5, z1: 5 }),
    ).toBeNull();
  });

  it('rejects an inverted or flat aabb on any single axis', () => {
    const flatZ: CollisionShape3D = { kind: 'aabb', maxX: 1, maxY: 1, maxZ: 0, minX: 0, minY: 0, minZ: 0 };
    expect(getCollisionShapeValidationStatus3D(flatZ)).toBe('degenerate-shape');
    expect(
      getCollisionShapeValidationStatus3D({ kind: 'aabb', maxX: -1, maxY: 1, maxZ: 1, minX: 0, minY: 0, minZ: 0 }),
    ).toBe('degenerate-shape');
  });

  it('rejects an all-zero box quaternion but accepts a merely non-unit one', () => {
    const box = {
      halfX: 1,
      halfY: 1,
      halfZ: 1,
      kind: 'box',
      rotationW: 0,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      x: 0,
      y: 0,
      z: 0,
    } as const;
    expect(getCollisionShapeValidationStatus3D(box)).toBe('degenerate-shape');

    // Non-unit is the caller's error and scales the box, which `CollisionBox3D` states is not normalized
    // away on every support call. It stays a usable shape. All-zero is different in kind: it carries no
    // orientation to scale and collapses the box to its centre.
    expect(getCollisionShapeValidationStatus3D({ ...box, rotationW: 2 })).toBeNull();
  });

  it('rejects a non-positive box half extent', () => {
    expect(
      getCollisionShapeValidationStatus3D({
        halfX: 1,
        halfY: 0,
        halfZ: 1,
        kind: 'box',
        rotationW: 1,
        rotationX: 0,
        rotationY: 0,
        rotationZ: 0,
        x: 0,
        y: 0,
        z: 0,
      }),
    ).toBe('degenerate-shape');
  });

  it('names an unrecognized kind as unsupported rather than degenerate', () => {
    expect(getCollisionShapeValidationStatus3D({ kind: 'acme.cone' })).toBe('unsupported-shape-kind');
  });

  it('never reports non-convex-polygon, which no 3D path can produce', () => {
    // A 3D convex hull is reached only through its support scan, which takes the max over the point list
    // and therefore never returns an interior vertex — so a concave point set is not wrong, it simply IS
    // its own convex hull. The interior vertex here is silently ignored by design.
    const concave: CollisionShape3D = {
      kind: 'convex',
      points: [0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 2, 0.5, 0.5, 0.5],
    };
    expect(getCollisionShapeValidationStatus3D(concave)).toBeNull();
  });
});
