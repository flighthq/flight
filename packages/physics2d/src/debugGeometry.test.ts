import { createEntity } from '@flighthq/entity/contract';
import type { Physics2DJoint, Physics2DMouseJoint, Physics2DPulleyJoint } from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { updatePhysics2DColliderWorldShape } from './colliderTransform';
import { createPhysics2DDebugGeometry, writePhysics2DDebugGeometry } from './debugGeometry';
import { addPhysics2DJoint } from './jointRegistry';
import { addPhysics2DBody, createPhysics2DCollider, createPhysics2DWorld, createRigidBody2D } from './world';

const STONE = { density: 1, friction: 0.3, restitution: 0 };
const ONLY_COLLIDERS = {
  drawCentersOfMass: false,
  drawColliders: true,
  drawContacts: false,
  drawJoints: false,
};

function baseJoint(kind: string, bodyA: number, bodyB: number): Physics2DJoint {
  return createEntity({
    bodyA,
    bodyB,
    collideConnected: false,
    breakForce: Number.POSITIVE_INFINITY,
    breakTorque: Number.POSITIVE_INFINITY,
    impulse0: 0,
    impulse1: 0,
    impulse2: 0,
    kind,
    localAnchorAX: 0,
    localAnchorAY: 0,
    localAnchorBX: 0,
    localAnchorBY: 0,
    rAX: 0,
    rAY: 0,
    rBX: 0,
    rBY: 0,
  });
}

describe('createPhysics2DDebugGeometry', () => {
  it('starts with empty reusable primitive pools', () => {
    const geometry = createPhysics2DDebugGeometry();
    expect(Object.hasOwn(geometry, EntityRuntimeKey)).toBe(true);
    expect(geometry).toMatchObject({
      circleCount: 0,
      circles: [],
      lineCount: 0,
      lines: [],
    });
  });
});

describe('writePhysics2DDebugGeometry', () => {
  it('draws a capsule as two end discs and the two lines tangent to them', () => {
    // Its actual silhouette. Two circles alone would leave the straight sides missing, and a single
    // line through the axis would draw a shape the collider does not have.
    const world = createPhysics2DWorld(0, 0);
    const body = createRigidBody2D('dynamic', 0, 0);
    body.colliders.push(createPhysics2DCollider({ kind: 'capsule', x0: -2, y0: 0, x1: 2, y1: 0, radius: 1 }, STONE));
    addPhysics2DBody(world, body);
    const out = createPhysics2DDebugGeometry();

    writePhysics2DDebugGeometry(world, out, ONLY_COLLIDERS);

    expect(out.circleCount).toBe(2);
    expect(out.lineCount).toBe(2);
    expect(out.circles.slice(0, 2).map((circle) => [circle.x, circle.y, circle.radius])).toEqual([
      [-2, 0, 1],
      [2, 0, 1],
    ]);
    // The sides sit one radius either side of the axis, which is what makes them tangent to both discs.
    const sides = out.lines.slice(0, 2).map((line) => line.y0);
    expect(sides.slice().sort((a, b) => a - b)).toEqual([-1, 1]);
  });

  it('draws only the two discs for a zero-length capsule, which has no sides', () => {
    const world = createPhysics2DWorld(0, 0);
    const body = createRigidBody2D('dynamic', 3, 4);
    body.colliders.push(createPhysics2DCollider({ kind: 'capsule', x0: 0, y0: 0, x1: 0, y1: 0, radius: 0.5 }, STONE));
    addPhysics2DBody(world, body);
    const out = createPhysics2DDebugGeometry();

    writePhysics2DDebugGeometry(world, out, ONLY_COLLIDERS);

    expect(out.circleCount).toBe(2);
    expect(out.lineCount).toBe(0);
  });

  it('extracts circle, box, and polygon collider outlines in world space', () => {
    const world = createPhysics2DWorld(0, 0);
    const circle = createRigidBody2D('dynamic', 2, 3);
    circle.colliders.push(createPhysics2DCollider({ kind: 'circle', radius: 0.5, x: 1, y: 0 }, STONE));
    addPhysics2DBody(world, circle);
    const box = createRigidBody2D('dynamic', -2, 0, Math.PI / 2);
    box.colliders.push(createPhysics2DCollider({ kind: 'aabb', maxX: 1, maxY: 0.5, minX: -1, minY: -0.5 }, STONE));
    addPhysics2DBody(world, box);
    const polygon = createRigidBody2D('dynamic', 0, 4);
    polygon.colliders.push(createPhysics2DCollider({ kind: 'polygon', points: [0, 0, 2, 0, 0, 1] }, STONE));
    addPhysics2DBody(world, polygon);
    for (const body of world.bodies) {
      for (const collider of body.colliders) updatePhysics2DColliderWorldShape(collider, body);
    }
    const out = createPhysics2DDebugGeometry();

    writePhysics2DDebugGeometry(world, out, ONLY_COLLIDERS);

    expect(out.circleCount).toBe(1);
    expect(out.circles[0]).toMatchObject({ bodyA: circle.index, feature: 'collider', radius: 0.5, x: 3, y: 3 });
    expect(out.lineCount).toBe(7);
    expect(out.lines.slice(0, out.lineCount).filter((line) => line.bodyA === box.index)).toHaveLength(4);
    expect(out.lines.slice(0, out.lineCount).filter((line) => line.bodyA === polygon.index)).toHaveLength(3);
  });

  it('uses the current body pose instead of the narrow-phase world-shape snapshot', () => {
    const world = createPhysics2DWorld(0, 0);
    const body = createRigidBody2D('dynamic', 0, 0);
    body.colliders.push(createPhysics2DCollider({ kind: 'circle', radius: 1, x: 0, y: 0 }, STONE));
    addPhysics2DBody(world, body);
    updatePhysics2DColliderWorldShape(body.colliders[0], body);
    body.x = 5;
    const out = createPhysics2DDebugGeometry();

    writePhysics2DDebugGeometry(world, out, ONLY_COLLIDERS);

    expect(body.colliders[0].world).toMatchObject({ x: 0 });
    expect(out.circles[0]).toMatchObject({ x: 5 });
  });

  it('writes live contact normals with their body identities and configured length', () => {
    const world = createPhysics2DWorld(0, 0);
    world.contacts.push({
      bodyA: 4,
      bodyB: 7,
      colliderA: 0,
      colliderB: 0,
      enabled: true,
      friction: 0,
      normalX: 0,
      normalY: 1,
      pointCount: 1,
      points: [
        {
          bias: 0,
          depth: 0.1,
          featureId: 3,
          normalImpulse: 0,
          normalMass: 0,
          rAX: 0,
          rAY: 0,
          rBX: 0,
          rBY: 0,
          tangentImpulse: 0,
          tangentMass: 0,
          x: 2,
          y: 3,
        },
      ],
      restitution: 0,
      sensor: false,
      touching: true,
    });
    const out = createPhysics2DDebugGeometry();

    writePhysics2DDebugGeometry(world, out, {
      contactNormalLength: 2,
      drawCentersOfMass: false,
      drawColliders: false,
      drawContacts: true,
      drawJoints: false,
    });

    expect(out.lineCount).toBe(1);
    expect(out.lines[0]).toEqual({
      bodyA: 4,
      bodyB: 7,
      feature: 'contact-normal',
      x0: 2,
      x1: 2,
      y0: 3,
      y1: 5,
    });
  });

  it('draws ordinary, mouse, and pulley joints using the anchors each solver constrains', () => {
    const world = createPhysics2DWorld(0, 0);
    const first = addPhysics2DBody(world, createRigidBody2D('dynamic', 0, 0));
    const second = addPhysics2DBody(world, createRigidBody2D('dynamic', 4, 0));
    addPhysics2DJoint(world, { ...baseJoint('acme.Custom', first.index, second.index), localAnchorAX: 1 });
    addPhysics2DJoint(world, {
      ...baseJoint('Mouse', 999, second.index),
      targetX: 8,
      targetY: 3,
    } as Physics2DMouseJoint);
    addPhysics2DJoint(world, {
      ...baseJoint('Pulley', first.index, second.index),
      constant: 4,
      groundAnchorAX: 0,
      groundAnchorAY: 2,
      groundAnchorBX: 4,
      groundAnchorBY: 2,
      ratio: 1,
    } as Physics2DPulleyJoint);
    const out = createPhysics2DDebugGeometry();

    writePhysics2DDebugGeometry(world, out, {
      drawCentersOfMass: false,
      drawColliders: false,
      drawContacts: false,
      drawJoints: true,
    });

    expect(out.lineCount).toBe(5);
    expect(out.lines[0]).toMatchObject({ feature: 'joint', x0: 1, x1: 4, y0: 0, y1: 0 });
    expect(out.lines[1]).toMatchObject({ x0: 8, x1: 4, y0: 3, y1: 0 });
    expect(out.lines[2]).toMatchObject({ x0: 0, x1: 0, y0: 2, y1: 0 });
    expect(out.lines[3]).toMatchObject({ x0: 4, x1: 4, y0: 2, y1: 0 });
    expect(out.lines[4]).toMatchObject({ x0: 0, x1: 4, y0: 2, y1: 2 });
  });

  it('places center markers at each rotated center of mass', () => {
    const world = createPhysics2DWorld(0, 0);
    const body = createRigidBody2D('dynamic', 10, 5, Math.PI / 2);
    body.colliders.push(createPhysics2DCollider({ kind: 'circle', radius: 1, x: 2, y: 0 }, STONE));
    addPhysics2DBody(world, body);
    const out = createPhysics2DDebugGeometry();

    writePhysics2DDebugGeometry(world, out, {
      centerOfMassRadius: 0.25,
      drawCentersOfMass: true,
      drawColliders: false,
      drawContacts: false,
      drawJoints: false,
    });

    expect(out.circleCount).toBe(1);
    expect(out.circles[0]).toMatchObject({ feature: 'center-of-mass', radius: 0.25, x: 10, y: 7 });
  });

  it('reuses its high-water primitive objects and exposes only entries below each count', () => {
    const world = createPhysics2DWorld(0, 0);
    const body = createRigidBody2D('dynamic', 0, 0);
    body.colliders.push(createPhysics2DCollider({ kind: 'aabb', maxX: 1, maxY: 1, minX: -1, minY: -1 }, STONE));
    addPhysics2DBody(world, body);
    updatePhysics2DColliderWorldShape(body.colliders[0], body);
    const out = createPhysics2DDebugGeometry();
    writePhysics2DDebugGeometry(world, out, ONLY_COLLIDERS);
    const firstLine = out.lines[0];

    writePhysics2DDebugGeometry(world, out, ONLY_COLLIDERS);
    expect(out.lines[0]).toBe(firstLine);
    expect(out.lineCount).toBe(4);

    writePhysics2DDebugGeometry(world, out, {
      drawCentersOfMass: false,
      drawColliders: false,
      drawContacts: false,
      drawJoints: false,
    });
    expect(out.lineCount).toBe(0);
    expect(out.lines).toHaveLength(4);
  });
});
