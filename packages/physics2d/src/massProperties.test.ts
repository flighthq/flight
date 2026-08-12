import type { CollisionShape, Physics2DCollider, Physics2DMassData, RigidBody2D } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { computePhysics2DColliderMassData, updateRigidBody2DMassData } from './massProperties';
import { createPhysics2DCollider, createRigidBody2D } from './world';

function collider(local: CollisionShape, density = 1): Physics2DCollider {
  return createPhysics2DCollider(local, { density, friction: 0.2, restitution: 0 });
}

// The constructor, not a literal that happens to match the fields: a body grows fields (sleep state, for
// one) and a literal silently goes stale the moment it does.
function body(colliders: Physics2DCollider[], type: RigidBody2D['type'] = 'dynamic'): RigidBody2D {
  const created = createRigidBody2D(type, 0, 0);
  created.index = 0;
  created.colliders.push(...colliders);
  return created;
}

function massData(): Physics2DMassData {
  return { mass: 0, inertia: 0, centerX: 0, centerY: 0 };
}

describe('computePhysics2DColliderMassData', () => {
  it('derives a disc from its area and half its mass-radius-squared', () => {
    const out = massData();
    computePhysics2DColliderMassData(collider({ kind: 'circle', x: 3, y: -2, radius: 2 }, 4), out);
    expect(out.mass).toBeCloseTo(Math.PI * 4 * 4);
    expect(out.inertia).toBeCloseTo(0.5 * Math.PI * 4 * 4 * 4);
    expect(out.centerX).toBe(3);
    expect(out.centerY).toBe(-2);
  });

  it('derives a box from its extents and centres it on the box', () => {
    const out = massData();
    computePhysics2DColliderMassData(collider({ kind: 'aabb', minX: 0, minY: 0, maxX: 4, maxY: 2 }, 3), out);
    expect(out.mass).toBeCloseTo(24);
    expect(out.inertia).toBeCloseTo((24 * (16 + 4)) / 12);
    expect(out.centerX).toBeCloseTo(2);
    expect(out.centerY).toBeCloseTo(1);
  });

  it('gives an oriented box the same inertia as the axis-aligned box of equal extents', () => {
    // Rotation about z does not change a rectangle's second moment about its own centre. Pinned
    // because assuming otherwise is a natural mistake, and it would make a tilted crate swing wrong.
    const upright = massData();
    const tilted = massData();
    computePhysics2DColliderMassData(collider({ kind: 'aabb', minX: -2, minY: -1, maxX: 2, maxY: 1 }), upright);
    computePhysics2DColliderMassData(collider({ kind: 'obb', x: 0, y: 0, halfW: 2, halfH: 1, rotation: 0.7 }), tilted);
    expect(tilted.mass).toBeCloseTo(upright.mass);
    expect(tilted.inertia).toBeCloseTo(upright.inertia);
  });

  it('agrees with the box formula when the same square is given as a polygon', () => {
    // Cross-validation between two independent derivations: the closed-form rectangle expression and
    // the general polygon accumulation. Agreement is evidence neither is quietly wrong.
    const asBox = massData();
    const asPolygon = massData();
    computePhysics2DColliderMassData(
      collider({ kind: 'aabb', minX: -1.5, minY: -0.5, maxX: 1.5, maxY: 0.5 }, 2),
      asBox,
    );
    computePhysics2DColliderMassData(
      collider({ kind: 'polygon', points: [-1.5, -0.5, 1.5, -0.5, 1.5, 0.5, -1.5, 0.5] }, 2),
      asPolygon,
    );
    expect(asPolygon.mass).toBeCloseTo(asBox.mass);
    expect(asPolygon.inertia).toBeCloseTo(asBox.inertia);
    expect(asPolygon.centerX).toBeCloseTo(asBox.centerX);
    expect(asPolygon.centerY).toBeCloseTo(asBox.centerY);
  });

  it('gives a polygon the same mass whichever winding it is given in', () => {
    const counterClockwise = massData();
    const clockwise = massData();
    computePhysics2DColliderMassData(collider({ kind: 'polygon', points: [0, 0, 4, 0, 4, 2, 0, 2] }), counterClockwise);
    computePhysics2DColliderMassData(collider({ kind: 'polygon', points: [0, 0, 0, 2, 4, 2, 4, 0] }), clockwise);
    expect(clockwise.mass).toBeCloseTo(counterClockwise.mass);
    expect(clockwise.inertia).toBeCloseTo(counterClockwise.inertia);
    expect(clockwise.centerX).toBeCloseTo(counterClockwise.centerX);
    expect(clockwise.centerY).toBeCloseTo(counterClockwise.centerY);
  });

  it('offsets a polygon centroid without changing its inertia about that centroid', () => {
    // The parallel-axis subtraction is the step most easily got wrong, and the wrongness is invisible
    // in a shape centred on the origin. Translating the same square must move the centroid and leave
    // the inertia untouched.
    const atOrigin = massData();
    const shifted = massData();
    computePhysics2DColliderMassData(collider({ kind: 'polygon', points: [-1, -1, 1, -1, 1, 1, -1, 1] }), atOrigin);
    computePhysics2DColliderMassData(collider({ kind: 'polygon', points: [9, 19, 11, 19, 11, 21, 9, 21] }), shifted);
    expect(shifted.centerX).toBeCloseTo(10);
    expect(shifted.centerY).toBeCloseTo(20);
    expect(shifted.inertia).toBeCloseTo(atOrigin.inertia);
  });

  it('gives area-less and degenerate shapes no mass', () => {
    const out = massData();
    computePhysics2DColliderMassData(collider({ kind: 'segment', x0: 0, y0: 0, x1: 5, y1: 5 }), out);
    expect(out.mass).toBe(0);
    computePhysics2DColliderMassData(collider({ kind: 'point', x: 1, y: 1 }), out);
    expect(out.mass).toBe(0);
    // Collinear vertices enclose no area; dividing the centroid by it would be a NaN body.
    computePhysics2DColliderMassData(collider({ kind: 'polygon', points: [0, 0, 1, 1, 2, 2] }), out);
    expect(out.mass).toBe(0);
    expect(Number.isNaN(out.centerX)).toBe(false);
  });
});

describe('updateRigidBody2DMassData', () => {
  it('keeps collider mass scratch isolated when a body getter updates another body', () => {
    const target = body([collider({ kind: 'aabb', minX: -1, minY: -1, maxX: 1, maxY: 1 })]);
    const nested = body([collider({ kind: 'circle', x: 10, y: 20, radius: 5 })]);
    let centerX = 0;
    let centerXReads = 0;
    let nestedCalls = 0;
    Object.defineProperty(target, 'centerX', {
      configurable: true,
      enumerable: true,
      get() {
        centerXReads++;
        if (centerXReads === 1) {
          nestedCalls++;
          updateRigidBody2DMassData(nested);
        }
        return centerX;
      },
      set(value: number) {
        centerX = value;
      },
    });

    updateRigidBody2DMassData(target);

    expect(nestedCalls).toBe(1);
    expect(target.mass).toBeCloseTo(4);
    expect(target.centerX).toBeCloseTo(0);
    expect(target.centerY).toBeCloseTo(0);
    expect(target.inertia).toBeCloseTo(8 / 3);
  });

  it('combines two colliders into one centre of mass and shifts their inertia onto it', () => {
    const left = collider({ kind: 'aabb', minX: -3, minY: -1, maxX: -1, maxY: 1 });
    const right = collider({ kind: 'aabb', minX: 1, minY: -1, maxX: 3, maxY: 1 });
    const target = body([left, right]);
    updateRigidBody2DMassData(target);

    expect(target.mass).toBeCloseTo(8);
    expect(target.centerX).toBeCloseTo(0);
    expect(target.centerY).toBeCloseTo(0);
    // Each 2x2 box contributes its own inertia plus mass times the square of its 2-unit offset.
    const own = (4 * (4 + 4)) / 12;
    expect(target.inertia).toBeCloseTo(2 * (own + 4 * 4));
    expect(target.inverseMass).toBeCloseTo(1 / 8);
  });

  it('gives a static body zero inverse mass and inertia while keeping its centre', () => {
    // Zero inverse mass is the arithmetic that makes a static body immovable without a branch in the
    // solver, so it must hold even though the shape has real area.
    const ground = body([collider({ kind: 'aabb', minX: -5, minY: -1, maxX: 5, maxY: 0 })], 'static');
    updateRigidBody2DMassData(ground);
    expect(ground.inverseMass).toBe(0);
    expect(ground.inverseInertia).toBe(0);
    expect(ground.mass).toBe(0);
    expect(ground.centerX).toBeCloseTo(0);
    expect(ground.centerY).toBeCloseTo(-0.5);
  });

  it('gives a kinematic body zero inverse mass even though it moves', () => {
    const platform = body([collider({ kind: 'aabb', minX: 0, minY: 0, maxX: 4, maxY: 1 })], 'kinematic');
    updateRigidBody2DMassData(platform);
    expect(platform.inverseMass).toBe(0);
    expect(platform.inverseInertia).toBe(0);
  });

  it('gives fixed rotation zero inverse inertia without discarding derived inertia or linear mass', () => {
    const target = body([collider({ kind: 'aabb', minX: -2, minY: -1, maxX: 2, maxY: 1 })]);
    target.fixedRotation = true;
    updateRigidBody2DMassData(target);

    expect(target.mass).toBeGreaterThan(0);
    expect(target.inverseMass).toBeGreaterThan(0);
    expect(target.inertia).toBeGreaterThan(0);
    expect(target.inverseInertia).toBe(0);
  });

  it('leaves a dynamic body with no area finite rather than dividing by its zero mass', () => {
    // A body whose only collider is a sensor point has no mass. Inverting it would seed NaN into the
    // velocity of everything it later touches, which is unrecoverable rather than merely wrong.
    const ghost = body([collider({ kind: 'point', x: 0, y: 0 })]);
    updateRigidBody2DMassData(ghost);
    expect(ghost.inverseMass).toBe(0);
    expect(ghost.inverseInertia).toBe(0);
    expect(Number.isFinite(ghost.centerX)).toBe(true);
  });

  it('scales mass with density but leaves the centre of mass where it was', () => {
    const light = body([collider({ kind: 'aabb', minX: 0, minY: 0, maxX: 2, maxY: 2 }, 1)]);
    const heavy = body([collider({ kind: 'aabb', minX: 0, minY: 0, maxX: 2, maxY: 2 }, 7)]);
    updateRigidBody2DMassData(light);
    updateRigidBody2DMassData(heavy);
    expect(heavy.mass).toBeCloseTo(light.mass * 7);
    expect(heavy.inertia).toBeCloseTo(light.inertia * 7);
    expect(heavy.centerX).toBeCloseTo(light.centerX);
  });
});
