import type { CollisionBuiltInShape3D, Physics3DCollider, RigidBody3D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import {
  combinePhysics3DMassData,
  computePhysics3DBoxMassData,
  computePhysics3DColliderMassData,
  computePhysics3DConvexHullMassData,
  computePhysics3DCapsuleMassData,
  computePhysics3DSphereMassData,
  createPhysics3DMassData,
  updateRigidBody3DMassData,
  setRigidBody3DMassData,
} from './massProperties';
import { addPhysics3DBody, createPhysics3DCollider, createPhysics3DWorld, createRigidBody3D } from './world';

describe('combinePhysics3DMassData', () => {
  it('starts from the zero identity, adopting the addend outright', () => {
    const target = createPhysics3DMassData();
    const sphere = createPhysics3DMassData();
    computePhysics3DSphereMassData(1, 1, sphere);

    combinePhysics3DMassData(target, sphere);

    expect(target.mass).toBeCloseTo(sphere.mass, 12);
    expect(target.inertiaXX).toBeCloseTo(sphere.inertiaXX, 12);
  });

  it('puts the combined centre between two equal masses', () => {
    const target = createPhysics3DMassData();
    const left = createPhysics3DMassData();
    const right = createPhysics3DMassData();
    computePhysics3DSphereMassData(1, 1, left);
    computePhysics3DSphereMassData(1, 1, right);
    left.centerX = -2;
    right.centerX = 2;

    combinePhysics3DMassData(target, left);
    combinePhysics3DMassData(target, right);

    expect(target.centerX).toBeCloseTo(0, 12);
    expect(target.mass).toBeCloseTo(left.mass + right.mass, 12);
  });

  it('shifts the ALREADY-ACCUMULATED tensor too, not only the addend', () => {
    // Two unit spheres offset along x. About the combined centre, each contributes its own moment plus
    // mass * d^2 for the y and z axes. A version that shifted only the addend would report half of it.
    const target = createPhysics3DMassData();
    const left = createPhysics3DMassData();
    const right = createPhysics3DMassData();
    computePhysics3DSphereMassData(1, 1, left);
    computePhysics3DSphereMassData(1, 1, right);
    left.centerX = -2;
    right.centerX = 2;

    combinePhysics3DMassData(target, left);
    combinePhysics3DMassData(target, right);

    const each = left.mass;
    const expectedYY = 2 * (0.4 * each * 1 + each * 4);
    expect(target.inertiaYY).toBeCloseTo(expectedYY, 8);
    // The x axis runs through both centres, so it gains no parallel-axis term.
    expect(target.inertiaXX).toBeCloseTo(2 * 0.4 * each, 8);
  });

  it('is order-independent for the combined mass and centre', () => {
    const forward = createPhysics3DMassData();
    const backward = createPhysics3DMassData();
    const a = createPhysics3DMassData();
    const b = createPhysics3DMassData();
    computePhysics3DSphereMassData(1, 1, a);
    computePhysics3DBoxMassData(1, 2, 3, 2, b);
    a.centerY = 1;
    b.centerY = -3;

    combinePhysics3DMassData(forward, a);
    combinePhysics3DMassData(forward, b);
    combinePhysics3DMassData(backward, b);
    combinePhysics3DMassData(backward, a);

    expect(backward.mass).toBeCloseTo(forward.mass, 10);
    expect(backward.centerY).toBeCloseTo(forward.centerY, 10);
    expect(backward.inertiaXX).toBeCloseTo(forward.inertiaXX, 8);
  });

  it('zeroes the result when both sides are massless rather than dividing by zero', () => {
    const target = createPhysics3DMassData();
    combinePhysics3DMassData(target, createPhysics3DMassData());
    expect(target.mass).toBe(0);
    expect(Number.isNaN(target.centerX)).toBe(false);
  });
});

describe('computePhysics3DBoxMassData', () => {
  it('derives mass from volume and density', () => {
    const out = createPhysics3DMassData();
    computePhysics3DBoxMassData(1, 2, 3, 5, out);
    expect(out.mass).toBeCloseTo(8 * 1 * 2 * 3 * 5, 10);
  });

  it('gives a cube one moment on every axis', () => {
    const out = createPhysics3DMassData();
    computePhysics3DBoxMassData(2, 2, 2, 1, out);
    expect(out.inertiaYY).toBeCloseTo(out.inertiaXX, 10);
    expect(out.inertiaZZ).toBeCloseTo(out.inertiaXX, 10);
  });

  it('resists rotation least about its longest axis', () => {
    const out = createPhysics3DMassData();
    computePhysics3DBoxMassData(4, 1, 1, 1, out);
    expect(out.inertiaXX).toBeLessThan(out.inertiaYY);
    expect(out.inertiaYY).toBeCloseTo(out.inertiaZZ, 10);
  });

  it('leaves the off-diagonal terms zero for an axis-aligned box', () => {
    const out = createPhysics3DMassData();
    computePhysics3DBoxMassData(1, 2, 3, 1, out);
    expect(out.inertiaXY).toBe(0);
    expect(out.inertiaXZ).toBe(0);
    expect(out.inertiaYZ).toBe(0);
  });
});

describe('computePhysics3DCapsuleMassData', () => {
  it('degenerates exactly to a sphere at zero half-height', () => {
    const capsule = createPhysics3DMassData();
    const sphere = createPhysics3DMassData();
    computePhysics3DCapsuleMassData(2, 0, 3, capsule);
    computePhysics3DSphereMassData(2, 3, sphere);

    expect(capsule.mass).toBeCloseTo(sphere.mass, 10);
    expect(capsule.inertiaXX).toBeCloseTo(sphere.inertiaXX, 8);
    expect(capsule.inertiaYY).toBeCloseTo(sphere.inertiaYY, 8);
    expect(capsule.inertiaZZ).toBeCloseTo(sphere.inertiaZZ, 8);
  });

  it('derives mass as cylinder plus two hemispheres', () => {
    const out = createPhysics3DMassData();
    computePhysics3DCapsuleMassData(1, 2, 1, out);
    const expected = Math.PI * 1 * 4 + (4 / 3) * Math.PI * 1;
    expect(out.mass).toBeCloseTo(expected, 10);
  });

  it('resists rotation least about its own axis', () => {
    const out = createPhysics3DMassData();
    computePhysics3DCapsuleMassData(1, 4, 1, out);
    expect(out.inertiaYY).toBeLessThan(out.inertiaXX);
  });

  it('is symmetric across the two axes orthogonal to its own', () => {
    const out = createPhysics3DMassData();
    computePhysics3DCapsuleMassData(1.5, 3, 2, out);
    expect(out.inertiaZZ).toBeCloseTo(out.inertiaXX, 10);
  });
});

describe('computePhysics3DColliderMassData', () => {
  function colliderOf(local: CollisionBuiltInShape3D, density = 1): Physics3DCollider {
    return createPhysics3DCollider(local, { density, friction: 0.2, restitution: 0 });
  }

  it('places the centroid at an offset collider rather than at the body origin', () => {
    const out = createPhysics3DMassData();
    computePhysics3DColliderMassData(colliderOf({ kind: 'sphere', x: 3, y: -2, z: 1, radius: 1 }), out);
    expect(out.centerX).toBe(3);
    expect(out.centerY).toBe(-2);
    expect(out.centerZ).toBe(1);
  });

  it('gives an aabb the same tensor as the equivalent box', () => {
    const collider = createPhysics3DMassData();
    const box = createPhysics3DMassData();
    computePhysics3DColliderMassData(
      colliderOf({ kind: 'aabb', minX: -1, minY: -2, minZ: -3, maxX: 1, maxY: 2, maxZ: 3 }),
      collider,
    );
    computePhysics3DBoxMassData(1, 2, 3, 1, box);
    expect(collider.mass).toBeCloseTo(box.mass, 9);
    expect(collider.inertiaXX).toBeCloseTo(box.inertiaXX, 9);
  });

  it('makes a LOCALLY ROTATED box non-diagonal in the body frame', () => {
    // The silent-failure case the tensor representation exists for: skipping this rotation leaves the
    // mass and the diagonal both plausible and only the off-axis swing wrong.
    const out = createPhysics3DMassData();
    computePhysics3DColliderMassData(
      colliderOf({
        kind: 'box',
        x: 0,
        y: 0,
        z: 0,
        halfX: 3,
        halfY: 1,
        halfZ: 1,
        rotationX: 0,
        rotationY: 0,
        rotationZ: Math.sin(Math.PI / 8),
        rotationW: Math.cos(Math.PI / 8),
      }),
      out,
    );
    expect(Math.abs(out.inertiaXY)).toBeGreaterThan(0);
  });

  it('realigns a capsule that is not on the Y axis', () => {
    // The closed form is written for a Y-axis capsule. One lying along X must end up with its SMALL
    // moment on x, not on y.
    const out = createPhysics3DMassData();
    computePhysics3DColliderMassData(
      colliderOf({ kind: 'capsule', x0: -2, y0: 0, z0: 0, x1: 2, y1: 0, z1: 0, radius: 0.5 }),
      out,
    );
    expect(out.inertiaXX).toBeLessThan(out.inertiaYY);
    expect(out.inertiaYY).toBeCloseTo(out.inertiaZZ, 9);
  });

  it('integrates a convex hull rather than zeroing it', () => {
    const out = createPhysics3DMassData();
    computePhysics3DColliderMassData(colliderOf({ kind: 'convex', points: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] }), out);
    expect(out.mass).toBeCloseTo(1 / 6, 9);
  });
});

describe('computePhysics3DConvexHullMassData', () => {
  function boxPoints(halfX: number, halfY: number, halfZ: number, offsetX = 0): number[] {
    const points: number[] = [];
    for (const x of [-halfX, halfX]) {
      for (const y of [-halfY, halfY]) {
        for (const z of [-halfZ, halfZ]) points.push(x + offsetX, y, z);
      }
    }
    return points;
  }

  it('reproduces the closed-form box tensor exactly for a box-shaped hull', () => {
    // The strongest check available: two completely independent routes to the same six numbers. The
    // closed form is algebra on the extents; the hull integrates over a triangulation it derived itself.
    const hull = createPhysics3DMassData();
    const box = createPhysics3DMassData();
    computePhysics3DConvexHullMassData(boxPoints(1.5, 0.75, 2.25), 3, hull);
    computePhysics3DBoxMassData(1.5, 0.75, 2.25, 3, box);

    expect(hull.mass).toBeCloseTo(box.mass, 9);
    expect(hull.inertiaXX).toBeCloseTo(box.inertiaXX, 9);
    expect(hull.inertiaYY).toBeCloseTo(box.inertiaYY, 9);
    expect(hull.inertiaZZ).toBeCloseTo(box.inertiaZZ, 9);
    expect(hull.inertiaXY).toBeCloseTo(0, 9);
    expect(hull.inertiaXZ).toBeCloseTo(0, 9);
    expect(hull.inertiaYZ).toBeCloseTo(0, 9);
  });

  it('reports the tensor about the CENTRE OF MASS for an offset hull', () => {
    // The case a centred hull cannot test, and the one that caught the parallel-axis shift being applied
    // in the wrong direction: the tensor came out with twice the offset term rather than none of it,
    // which is invisible at an offset of zero.
    const hull = createPhysics3DMassData();
    const reference = createPhysics3DMassData();
    computePhysics3DConvexHullMassData(boxPoints(1, 1, 1, 5), 1, hull);
    computePhysics3DBoxMassData(1, 1, 1, 1, reference);

    expect(hull.centerX).toBeCloseTo(5, 9);
    expect(hull.centerY).toBeCloseTo(0, 9);
    // A cube's tensor about its own centre does not depend on where that centre is.
    expect(hull.inertiaXX).toBeCloseTo(reference.inertiaXX, 9);
    expect(hull.inertiaYY).toBeCloseTo(reference.inertiaYY, 9);
    expect(hull.inertiaZZ).toBeCloseTo(reference.inertiaZZ, 9);
  });

  it('approaches the closed-form sphere from below as the sample gets denser', () => {
    // An inscribed hull is strictly smaller than the sphere it samples, so this is a bound with a
    // direction rather than a tolerance — a formula that were merely close could sit on either side.
    const hull = createPhysics3DMassData();
    const sphere = createPhysics3DMassData();
    const points: number[] = [];
    for (let i = 0; i < 400; i += 1) {
      const z = 1 - (2 * i) / 399;
      const radius = Math.sqrt(Math.max(0, 1 - z * z));
      const theta = i * 2.399963;
      points.push(radius * Math.cos(theta), radius * Math.sin(theta), z);
    }
    computePhysics3DConvexHullMassData(points, 1, hull);
    computePhysics3DSphereMassData(1, 1, sphere);

    expect(hull.mass).toBeLessThan(sphere.mass);
    expect(hull.mass).toBeGreaterThan(sphere.mass * 0.98);
    expect(hull.inertiaXX).toBeLessThan(sphere.inertiaXX);
    expect(hull.inertiaXX).toBeGreaterThan(sphere.inertiaXX * 0.96);
  });

  it('scales linearly with density', () => {
    const single = createPhysics3DMassData();
    const triple = createPhysics3DMassData();
    computePhysics3DConvexHullMassData(boxPoints(1, 1, 1), 1, single);
    computePhysics3DConvexHullMassData(boxPoints(1, 1, 1), 3, triple);

    expect(triple.mass).toBeCloseTo(single.mass * 3, 9);
    expect(triple.inertiaXX).toBeCloseTo(single.inertiaXX * 3, 9);
  });

  it('gives a degenerate hull no mass rather than a plausible wrong one', () => {
    const out = createPhysics3DMassData();
    // Coplanar, so there is no solid.
    computePhysics3DConvexHullMassData([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 1, out);
    expect(out.mass).toBe(0);
    computePhysics3DConvexHullMassData([], 1, out);
    expect(out.mass).toBe(0);
  });
});

describe('computePhysics3DSphereMassData', () => {
  it('derives mass from volume and density', () => {
    const out = createPhysics3DMassData();
    computePhysics3DSphereMassData(2, 3, out);
    expect(out.mass).toBeCloseTo((4 / 3) * Math.PI * 8 * 3, 10);
  });

  it('uses the two-fifths moment on every axis', () => {
    const out = createPhysics3DMassData();
    computePhysics3DSphereMassData(2, 3, out);
    expect(out.inertiaXX).toBeCloseTo(0.4 * out.mass * 4, 10);
    expect(out.inertiaYY).toBeCloseTo(out.inertiaXX, 12);
    expect(out.inertiaZZ).toBeCloseTo(out.inertiaXX, 12);
  });
});

function testBody(type: RigidBody3D['type']): RigidBody3D {
  return {
    index: 0,
    type,
    x: 0,
    y: 0,
    z: 0,
    orientationX: 0,
    orientationY: 0,
    orientationZ: 0,
    orientationW: 1,
    velocityX: 0,
    velocityY: 0,
    velocityZ: 0,
    angularVelocityX: 0,
    angularVelocityY: 0,
    angularVelocityZ: 0,
    forceX: 0,
    forceY: 0,
    forceZ: 0,
    torqueX: 0,
    torqueY: 0,
    torqueZ: 0,
    mass: 0,
    inverseMass: 0,
    inertiaXX: 0,
    inertiaYY: 0,
    inertiaZZ: 0,
    inertiaXY: 0,
    inertiaXZ: 0,
    inertiaYZ: 0,
    inverseInertiaXX: 0,
    inverseInertiaYY: 0,
    inverseInertiaZZ: 0,
    inverseInertiaXY: 0,
    inverseInertiaXZ: 0,
    inverseInertiaYZ: 0,
    inverseInertiaWorldXX: 0,
    inverseInertiaWorldYY: 0,
    inverseInertiaWorldZZ: 0,
    inverseInertiaWorldXY: 0,
    inverseInertiaWorldXZ: 0,
    inverseInertiaWorldYZ: 0,
    centerX: 0,
    centerY: 0,
    centerZ: 0,
    linearDamping: 0,
    angularDamping: 0,
    gravityScale: 1,
    fixedRotation: false,
    bullet: false,
    sleeping: false,
    sleepEnabled: true,
    sleepTimer: 0,
    colliders: [],
  };
}

describe('createPhysics3DMassData', () => {
  it('is the additive identity — all zero', () => {
    const out = createPhysics3DMassData();
    expect(out.mass).toBe(0);
    expect(out.inertiaXX).toBe(0);
    expect(out.centerZ).toBe(0);
  });
});

describe('setRigidBody3DMassData', () => {
  it('derives the inverse mass and a non-zero inverse tensor for a dynamic body', () => {
    const body = testBody('dynamic');
    const data = createPhysics3DMassData();
    computePhysics3DSphereMassData(1, 1, data);

    setRigidBody3DMassData(body, data);

    expect(body.mass).toBeCloseTo(data.mass, 12);
    expect(body.inverseMass).toBeCloseTo(1 / data.mass, 10);
    expect(body.inverseInertiaXX).toBeCloseTo(1 / data.inertiaXX, 8);
  });

  it('gives a static body zero inverse mass and zero inverse inertia while keeping the forward values', () => {
    const body = testBody('static');
    const data = createPhysics3DMassData();
    computePhysics3DSphereMassData(1, 1, data);

    setRigidBody3DMassData(body, data);

    expect(body.mass).toBeCloseTo(data.mass, 12);
    expect(body.inverseMass).toBe(0);
    expect(body.inverseInertiaXX).toBe(0);
  });

  it('gives a kinematic body the same zero inverses as a static one', () => {
    const body = testBody('kinematic');
    const data = createPhysics3DMassData();
    computePhysics3DSphereMassData(1, 1, data);

    setRigidBody3DMassData(body, data);

    expect(body.inverseMass).toBe(0);
    expect(body.inverseInertiaZZ).toBe(0);
  });

  it('zeroes only the inverse inertia for a fixed-rotation dynamic body, keeping its inverse mass', () => {
    const body = testBody('dynamic');
    body.fixedRotation = true;
    const data = createPhysics3DMassData();
    computePhysics3DSphereMassData(1, 1, data);

    setRigidBody3DMassData(body, data);

    expect(body.inverseMass).toBeGreaterThan(0);
    expect(body.inverseInertiaXX).toBe(0);
    expect(body.inverseInertiaYY).toBe(0);
  });

  it('treats a zero-mass dynamic body as immovable rather than dividing by zero', () => {
    const body = testBody('dynamic');

    setRigidBody3DMassData(body, createPhysics3DMassData());

    expect(body.inverseMass).toBe(0);
    expect(body.inverseInertiaXX).toBe(0);
  });

  it('copies the centre of mass onto the body', () => {
    const body = testBody('dynamic');
    const data = createPhysics3DMassData();
    computePhysics3DSphereMassData(1, 1, data);
    data.centerY = 4;

    setRigidBody3DMassData(body, data);

    expect(body.centerY).toBe(4);
  });
});

describe('updateRigidBody3DMassData', () => {
  it('derives a body mass from its colliders', () => {
    const world = createPhysics3DWorld();
    const body = createRigidBody3D('dynamic');
    addPhysics3DBody(world, body);
    body.colliders.push(
      createPhysics3DCollider({ kind: 'aabb', minX: -0.5, minY: -0.5, minZ: -0.5, maxX: 0.5, maxY: 0.5, maxZ: 0.5 }),
    );

    updateRigidBody3DMassData(body);

    expect(body.mass).toBeCloseTo(1, 9);
    expect(body.inverseMass).toBeCloseTo(1, 9);
  });

  it('balances a body between two colliders', () => {
    const world = createPhysics3DWorld();
    const body = createRigidBody3D('dynamic');
    addPhysics3DBody(world, body);
    for (const offset of [-2, 2]) {
      body.colliders.push(
        createPhysics3DCollider({
          kind: 'aabb',
          minX: offset - 0.5,
          minY: -0.5,
          minZ: -0.5,
          maxX: offset + 0.5,
          maxY: 0.5,
          maxZ: 0.5,
        }),
      );
    }

    updateRigidBody3DMassData(body);

    expect(body.mass).toBeCloseTo(2, 9);
    expect(body.centerX).toBeCloseTo(0, 9);
    // Two masses held 2 apart swing far harder about y and z than one box does.
    expect(body.inertiaYY).toBeGreaterThan(body.inertiaXX);
  });

  it('leaves a body with no colliders massless', () => {
    const body = createRigidBody3D('dynamic');
    updateRigidBody3DMassData(body);
    expect(body.mass).toBe(0);
    expect(body.inverseMass).toBe(0);
  });

  it('gives a static body zero inverse mass while keeping its forward mass', () => {
    const body = createRigidBody3D('static');
    body.colliders.push(
      createPhysics3DCollider({ kind: 'aabb', minX: -0.5, minY: -0.5, minZ: -0.5, maxX: 0.5, maxY: 0.5, maxZ: 0.5 }),
    );

    updateRigidBody3DMassData(body);

    expect(body.mass).toBeCloseTo(1, 9);
    expect(body.inverseMass).toBe(0);
  });
});
