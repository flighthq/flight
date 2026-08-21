import type { CollisionShape3D } from '@flighthq/types/contract';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  getCollisionPairTest3D,
  getCollisionSupport3D,
  registerBuiltInCollisionSupports3D,
  registerCollisionPairTest3D,
  registerCollisionSupport3D,
  supportCollisionAabb3D,
  supportCollisionBox3D,
  supportCollisionCapsule3D,
  supportCollisionConvex3D,
  supportCollisionSphere3D,
  writeVertexListSupport3D,
} from './collisionSupport3D';

beforeEach(() => {
  registerBuiltInCollisionSupports3D();
});

const out: number[] = [];

describe('getCollisionPairTest3D', () => {
  it('returns null for a pair with no registered specialization', () => {
    expect(getCollisionPairTest3D('sphere', 'acme.nothing')).toBeNull();
  });

  it('keys the ORDERED pair, so the reverse order is a separate slot', () => {
    const test = () => true;
    registerCollisionPairTest3D('acme.left', 'acme.right', test);
    expect(getCollisionPairTest3D('acme.left', 'acme.right')).toBe(test);
    expect(getCollisionPairTest3D('acme.right', 'acme.left')).toBeNull();
  });

  it('does not confuse kinds whose concatenation collides', () => {
    const first = () => true;
    const second = () => false;
    registerCollisionPairTest3D('a.b', 'c.d', first);
    registerCollisionPairTest3D('a.bc', '.d', second);
    expect(getCollisionPairTest3D('a.b', 'c.d')).toBe(first);
    expect(getCollisionPairTest3D('a.bc', '.d')).toBe(second);
  });
});

describe('getCollisionSupport3D', () => {
  it('returns null for an unregistered kind rather than throwing', () => {
    expect(getCollisionSupport3D('acme.unregistered')).toBeNull();
  });

  it('finds every built-in after registration', () => {
    for (const kind of ['sphere', 'aabb', 'box', 'capsule', 'convex']) {
      expect(getCollisionSupport3D(kind)).not.toBeNull();
    }
  });
});

describe('registerBuiltInCollisionSupports3D', () => {
  it('registers exactly the five convex built-ins and no area-less or concave kind', () => {
    // A mesh or heightfield support would make GJK silently answer for the CONVEX HULL of a concave
    // shape, so their absence is the boundary rather than an omission.
    expect(getCollisionSupport3D('mesh')).toBeNull();
    expect(getCollisionSupport3D('heightfield')).toBeNull();
  });
});

describe('registerCollisionPairTest3D', () => {
  it('is last-write-wins so a caller can override a binding', () => {
    const first = () => true;
    const second = () => false;
    registerCollisionPairTest3D('acme.a', 'acme.b', first);
    registerCollisionPairTest3D('acme.a', 'acme.b', second);
    expect(getCollisionPairTest3D('acme.a', 'acme.b')).toBe(second);
  });
});

describe('registerCollisionSupport3D', () => {
  it('is last-write-wins so a caller can override a built-in', () => {
    const custom = () => {};
    registerCollisionSupport3D('sphere', custom);
    expect(getCollisionSupport3D('sphere')).toBe(custom);
    registerBuiltInCollisionSupports3D();
    expect(getCollisionSupport3D('sphere')).toBe(supportCollisionSphere3D);
  });
});

describe('supportCollisionAabb3D', () => {
  it('picks the corner the direction signs select', () => {
    const box: CollisionShape3D = { kind: 'aabb', minX: -1, minY: -2, minZ: -3, maxX: 1, maxY: 2, maxZ: 3 };
    supportCollisionAabb3D(box, 1, 1, 1, out);
    expect(out.slice(0, 3)).toEqual([1, 2, 3]);
    supportCollisionAabb3D(box, -1, -1, -1, out);
    expect(out.slice(0, 3)).toEqual([-1, -2, -3]);
    supportCollisionAabb3D(box, 1, -1, 1, out);
    expect(out.slice(0, 3)).toEqual([1, -2, 3]);
  });
});

describe('supportCollisionBox3D', () => {
  it('matches an aabb when the rotation is identity', () => {
    const box: CollisionShape3D = {
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
    supportCollisionBox3D(box, 1, 1, 1, out);
    expect(out[0]).toBeCloseTo(1, 12);
    expect(out[1]).toBeCloseTo(2, 12);
    expect(out[2]).toBeCloseTo(3, 12);
  });

  it('reaches the spun corner for a box rotated 45 degrees about z', () => {
    const box: CollisionShape3D = {
      kind: 'box',
      x: 0,
      y: 0,
      z: 0,
      halfX: 1,
      halfY: 1,
      halfZ: 1,
      rotationX: 0,
      rotationY: 0,
      rotationZ: Math.sin(Math.PI / 8),
      rotationW: Math.cos(Math.PI / 8),
    };
    supportCollisionBox3D(box, 1, 0, 0, out);
    // A unit cube spun 45 degrees reaches sqrt(2) along x rather than 1.
    expect(out[0]).toBeCloseTo(Math.SQRT2, 10);
  });

  it('honours the centre offset', () => {
    const box: CollisionShape3D = {
      kind: 'box',
      x: 10,
      y: 20,
      z: 30,
      halfX: 1,
      halfY: 1,
      halfZ: 1,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      rotationW: 1,
    };
    supportCollisionBox3D(box, 1, 1, 1, out);
    expect(out[0]).toBeCloseTo(11, 12);
    expect(out[1]).toBeCloseTo(21, 12);
    expect(out[2]).toBeCloseTo(31, 12);
  });
});

describe('supportCollisionCapsule3D', () => {
  it('takes the further endpoint and pushes one radius along the direction', () => {
    const capsule: CollisionShape3D = { kind: 'capsule', x0: 0, y0: 0, z0: 0, x1: 0, y1: 4, z1: 0, radius: 0.5 };
    supportCollisionCapsule3D(capsule, 0, 1, 0, out);
    expect(out.slice(0, 3)).toEqual([0, 4.5, 0]);
    supportCollisionCapsule3D(capsule, 0, -1, 0, out);
    expect(out.slice(0, 3)).toEqual([0, -0.5, 0]);
  });

  it('degenerates to a sphere when the segment has zero length', () => {
    const capsule: CollisionShape3D = { kind: 'capsule', x0: 1, y0: 1, z0: 1, x1: 1, y1: 1, z1: 1, radius: 2 };
    supportCollisionCapsule3D(capsule, 1, 0, 0, out);
    expect(out.slice(0, 3)).toEqual([3, 1, 1]);
  });

  it('returns an endpoint for a zero direction rather than dividing by zero', () => {
    const capsule: CollisionShape3D = { kind: 'capsule', x0: 5, y0: 6, z0: 7, x1: 8, y1: 9, z1: 10, radius: 1 };
    supportCollisionCapsule3D(capsule, 0, 0, 0, out);
    expect(out.every(Number.isFinite)).toBe(true);
  });
});

describe('supportCollisionConvex3D', () => {
  it('finds the furthest vertex of a hull', () => {
    const hull: CollisionShape3D = { kind: 'convex', points: [0, 0, 0, 5, 0, 0, 0, 5, 0, 0, 0, 5] };
    supportCollisionConvex3D(hull, 1, 0, 0, out);
    expect(out.slice(0, 3)).toEqual([5, 0, 0]);
    supportCollisionConvex3D(hull, 0, 0, 1, out);
    expect(out.slice(0, 3)).toEqual([0, 0, 5]);
  });
});

describe('supportCollisionSphere3D', () => {
  it('pushes the centre one radius along a normalized direction', () => {
    const ball: CollisionShape3D = { kind: 'sphere', x: 1, y: 2, z: 3, radius: 2 };
    supportCollisionSphere3D(ball, 1, 0, 0, out);
    expect(out.slice(0, 3)).toEqual([3, 2, 3]);
  });

  it('normalizes an unnormalized direction', () => {
    const ball: CollisionShape3D = { kind: 'sphere', x: 0, y: 0, z: 0, radius: 1 };
    supportCollisionSphere3D(ball, 100, 0, 0, out);
    expect(out.slice(0, 3)).toEqual([1, 0, 0]);
  });

  it('returns the centre for a zero direction rather than dividing by zero', () => {
    const ball: CollisionShape3D = { kind: 'sphere', x: 4, y: 5, z: 6, radius: 1 };
    supportCollisionSphere3D(ball, 0, 0, 0, out);
    expect(out.slice(0, 3)).toEqual([4, 5, 6]);
  });
});

describe('writeVertexListSupport3D', () => {
  it('reads a flat triple list and returns the furthest point', () => {
    const vertices = [0, 0, 0, 1, 1, 1, -1, -1, -1];
    writeVertexListSupport3D(vertices, 3, 1, 1, 1, out);
    expect(out.slice(0, 3)).toEqual([1, 1, 1]);
    writeVertexListSupport3D(vertices, 3, -1, -1, -1, out);
    expect(out.slice(0, 3)).toEqual([-1, -1, -1]);
  });

  it('returns the first vertex when a single one is offered', () => {
    writeVertexListSupport3D([7, 8, 9], 1, 1, 0, 0, out);
    expect(out.slice(0, 3)).toEqual([7, 8, 9]);
  });
});
