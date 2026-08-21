import type { CollisionShape3D } from '@flighthq/types/contract';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerBuiltInCollisionSupports3D, registerCollisionPairTest3D } from './collisionSupport3D';
import { createCollisionManifold3D } from './manifold3D';
import { setCollisionTestGuard3D, testCollision3D } from './testCollision3D';

beforeEach(() => {
  registerBuiltInCollisionSupports3D();
});

afterEach(() => {
  setCollisionTestGuard3D(null);
});

function sphere(x: number, radius: number): CollisionShape3D {
  return { kind: 'sphere', x, y: 0, z: 0, radius };
}

describe('setCollisionTestGuard3D', () => {
  it('consults the installed guard on every dispatch and stops once cleared', () => {
    const seen: string[] = [];
    setCollisionTestGuard3D((a, b) => seen.push(`${a.kind}:${b.kind}`));

    testCollision3D(sphere(0, 1), sphere(1.5, 1), createCollisionManifold3D());
    expect(seen).toEqual(['sphere:sphere']);

    setCollisionTestGuard3D(null);
    testCollision3D(sphere(0, 1), sphere(1.5, 1), createCollisionManifold3D());
    expect(seen).toEqual(['sphere:sphere']);
  });

  it('runs the guard before dispatch, so an unresolvable pair still reaches it', () => {
    // The guard has to fire on the pairs that FAIL, which are the ones worth warning about. Consulting it
    // after dispatch would skip exactly the case it exists for.
    let called = false;
    setCollisionTestGuard3D(() => {
      called = true;
    });
    expect(testCollision3D({ kind: 'acme.unregistered' }, sphere(0, 1), createCollisionManifold3D())).toBe(false);
    expect(called).toBe(true);
  });
});

describe('testCollision3D', () => {
  it('falls through to the generic GJK/EPA floor when no specialization is registered', () => {
    const out = createCollisionManifold3D();
    expect(testCollision3D(sphere(0, 1), sphere(1.5, 1), out)).toBe(true);
    expect(out.depth).toBeCloseTo(0.5, 4);
  });

  it('prefers a specialization registered for the ordered pair', () => {
    const out = createCollisionManifold3D();
    registerCollisionPairTest3D('acme.left', 'acme.right', (_a, _b, manifold) => {
      manifold.overlapping = true;
      manifold.normalX = 0;
      manifold.normalY = 1;
      manifold.normalZ = 0;
      manifold.depth = 7;
      return true;
    });
    expect(testCollision3D({ kind: 'acme.left' }, { kind: 'acme.right' }, out)).toBe(true);
    expect(out.depth).toBe(7);
    expect(out.normalY).toBe(1);
  });

  it('negates the normal when only the reversed specialization exists', () => {
    const out = createCollisionManifold3D();
    registerCollisionPairTest3D('acme.forward', 'acme.backward', (_a, _b, manifold) => {
      manifold.overlapping = true;
      manifold.normalX = 1;
      manifold.normalY = 0;
      manifold.normalZ = 0;
      manifold.depth = 3;
      return true;
    });
    // Called in the order with no direct binding, so the reversed one answers B-out-of-A and the
    // normal has to come back into this call's sense. Depth is a distance and must NOT be negated.
    expect(testCollision3D({ kind: 'acme.backward' }, { kind: 'acme.forward' }, out)).toBe(true);
    expect(out.normalX).toBe(-1);
    expect(out.depth).toBe(3);
  });

  it('clears the manifold when a reversed specialization reports no overlap', () => {
    const out = createCollisionManifold3D();
    out.overlapping = true;
    out.normalX = 5;
    registerCollisionPairTest3D('acme.missA', 'acme.missB', () => false);
    expect(testCollision3D({ kind: 'acme.missB' }, { kind: 'acme.missA' }, out)).toBe(false);
    expect(out).toEqual({ overlapping: false, normalX: 0, normalY: 0, normalZ: 0, depth: 0 });
  });

  it('returns a silent false for an unregistered kind with no specialization', () => {
    const out = createCollisionManifold3D();
    expect(testCollision3D({ kind: 'acme.unknown' }, sphere(0, 1), out)).toBe(false);
    expect(out.overlapping).toBe(false);
  });

  it('reports disjoint shapes as not overlapping', () => {
    const out = createCollisionManifold3D();
    expect(testCollision3D(sphere(0, 1), sphere(50, 1), out)).toBe(false);
  });

  it('orients the generic normal to push A out of B, and reverses when the arguments swap', () => {
    const first = createCollisionManifold3D();
    const second = createCollisionManifold3D();
    testCollision3D(sphere(0, 1), sphere(1.5, 1), first);
    testCollision3D(sphere(1.5, 1), sphere(0, 1), second);
    expect(first.normalX).toBeCloseTo(-second.normalX, 2);
    expect(first.depth).toBeCloseTo(second.depth, 4);
  });
});
