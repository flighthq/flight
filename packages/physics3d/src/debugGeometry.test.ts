import {
  createCollisionHeightfield3D,
  createCollisionTriangleMesh3D,
  registerBuiltInCollisionFaceQueries3D,
  registerBuiltInCollisionSupports3D,
} from '@flighthq/collision/contract';
import type { CollisionBuiltInShape3D, Physics3DWorld, RigidBody3D } from '@flighthq/types/contract';
import { beforeEach, describe, expect, it } from 'vitest';

import { buildPhysics3DContacts } from './contactIntake';
import { createPhysics3DDebugGeometry, writePhysics3DDebugGeometry } from './debugGeometry';
import { createPhysics3DBallAndSocketJoint } from './jointFactories';
import { addPhysics3DJoint } from './jointRegistry';
import { registerBuiltInPhysics3DJointSolvers } from './registerBuiltInPhysics3DJointSolvers';
import {
  addPhysics3DBody,
  addPhysics3DCollider,
  createPhysics3DCollider,
  createPhysics3DWorld,
  createRigidBody3D,
} from './world';

beforeEach(() => {
  registerBuiltInCollisionSupports3D();
  registerBuiltInCollisionFaceQueries3D();
});

function addBody(world: Physics3DWorld, local: CollisionBuiltInShape3D, y = 0): RigidBody3D {
  const body = createRigidBody3D('dynamic');
  body.y = y;
  addPhysics3DBody(world, body);
  addPhysics3DCollider(world, body, createPhysics3DCollider(local));
  return body;
}

const unitBox: CollisionBuiltInShape3D = {
  kind: 'aabb',
  minX: -0.5,
  minY: -0.5,
  minZ: -0.5,
  maxX: 0.5,
  maxY: 0.5,
  maxZ: 0.5,
};

function liveLines(out: ReturnType<typeof createPhysics3DDebugGeometry>) {
  return out.lines.slice(0, out.lineCount);
}

function liveSpheres(out: ReturnType<typeof createPhysics3DDebugGeometry>) {
  return out.spheres.slice(0, out.sphereCount);
}

describe('createPhysics3DDebugGeometry', () => {
  it('starts empty', () => {
    expect(createPhysics3DDebugGeometry()).toEqual({ lines: [], lineCount: 0, spheres: [], sphereCount: 0 });
  });
});

describe('writePhysics3DDebugGeometry', () => {
  it('draws explicit mesh triangles and heightfield grid edges', () => {
    const world = createPhysics3DWorld();
    const mesh = createRigidBody3D('static');
    mesh.colliders.push(createPhysics3DCollider(createCollisionTriangleMesh3D([0, 0, 0, 1, 0, 0, 0, 0, 1], [0, 1, 2])));
    addPhysics3DBody(world, mesh);
    const heightfield = createRigidBody3D('static');
    heightfield.colliders.push(createPhysics3DCollider(createCollisionHeightfield3D(2, 2, [0, 0, 0, 0])));
    addPhysics3DBody(world, heightfield);
    const out = createPhysics3DDebugGeometry();

    writePhysics3DDebugGeometry(world, out, { drawColliders: true, drawCentersOfMass: false });

    expect(liveLines(out).filter((line) => line.feature === 'collider')).toHaveLength(8);
  });

  it('draws a box as its twelve edges', () => {
    const world = createPhysics3DWorld();
    addBody(world, unitBox);
    const out = createPhysics3DDebugGeometry();

    writePhysics3DDebugGeometry(world, out, { drawColliders: true, drawCentersOfMass: false });

    expect(liveLines(out).filter((line) => line.feature === 'collider')).toHaveLength(12);
  });

  it('gives every box edge unit length for a unit cube', () => {
    // Twelve lines that are not all edges — a diagonal, a repeat — would still count twelve.
    const world = createPhysics3DWorld();
    addBody(world, unitBox);
    const out = createPhysics3DDebugGeometry();

    writePhysics3DDebugGeometry(world, out, { drawCentersOfMass: false, drawContacts: false });

    for (const line of liveLines(out)) {
      expect(Math.hypot(line.x1 - line.x0, line.y1 - line.y0, line.z1 - line.z0)).toBeCloseTo(1, 9);
    }
  });

  it('follows the body pose rather than drawing at the origin', () => {
    const world = createPhysics3DWorld();
    const body = addBody(world, unitBox);
    const out = createPhysics3DDebugGeometry();

    body.x = 100;
    writePhysics3DDebugGeometry(world, out, { drawCentersOfMass: false });

    for (const line of liveLines(out)) expect(line.x0).toBeGreaterThan(99);
  });

  it('turns a spun box into edges that are no longer axis-aligned', () => {
    const world = createPhysics3DWorld();
    const body = addBody(world, unitBox);
    body.orientationY = Math.sin(Math.PI / 8);
    body.orientationW = Math.cos(Math.PI / 8);
    const out = createPhysics3DDebugGeometry();

    writePhysics3DDebugGeometry(world, out, { drawCentersOfMass: false });

    // An eighth turn about Y leaves no edge lying along a world axis in both x and z.
    const axisAligned = liveLines(out).filter(
      (line) => Math.abs(line.x1 - line.x0) < 1e-9 && Math.abs(line.z1 - line.z0) < 1e-9,
    );
    // Only the four vertical edges stay axis-aligned under a Y rotation.
    expect(axisAligned).toHaveLength(4);
  });

  it('draws a sphere collider as one sphere', () => {
    const world = createPhysics3DWorld();
    addBody(world, { kind: 'sphere', x: 0, y: 0, z: 0, radius: 2 });
    const out = createPhysics3DDebugGeometry();

    writePhysics3DDebugGeometry(world, out, { drawCentersOfMass: false });

    const spheres = liveSpheres(out).filter((sphere) => sphere.feature === 'collider');
    expect(spheres).toHaveLength(1);
    expect(spheres[0].radius).toBe(2);
  });

  it('draws a capsule as two caps joined by its axis', () => {
    const world = createPhysics3DWorld();
    addBody(world, { kind: 'capsule', x0: -2, y0: 0, z0: 0, x1: 2, y1: 0, z1: 0, radius: 0.5 });
    const out = createPhysics3DDebugGeometry();

    writePhysics3DDebugGeometry(world, out, { drawCentersOfMass: false });

    expect(liveSpheres(out).filter((sphere) => sphere.feature === 'collider')).toHaveLength(2);
    const axis = liveLines(out).filter((line) => line.feature === 'collider');
    expect(axis).toHaveLength(1);
    expect(Math.hypot(axis[0].x1 - axis[0].x0, axis[0].y1 - axis[0].y0, axis[0].z1 - axis[0].z0)).toBeCloseTo(4, 9);
  });

  it('draws a hull as the wireframe of its own triangulation', () => {
    const world = createPhysics3DWorld();
    addBody(world, { kind: 'convex', points: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] });
    const out = createPhysics3DDebugGeometry();

    writePhysics3DDebugGeometry(world, out, { drawCentersOfMass: false });

    // A tetrahedron triangulates to four faces, three edges each.
    expect(liveLines(out).filter((line) => line.feature === 'collider')).toHaveLength(12);
    expect(liveSpheres(out).filter((sphere) => sphere.feature === 'collider')).toHaveLength(0);
  });

  it('falls back to vertices for a DEGENERATE hull, which has no surface to wire', () => {
    // Coplanar: there is no solid, so any edge drawn would bound a face the simulation does not have.
    const world = createPhysics3DWorld();
    addBody(world, { kind: 'convex', points: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0] });
    const out = createPhysics3DDebugGeometry();

    writePhysics3DDebugGeometry(world, out, { drawCentersOfMass: false });

    expect(liveLines(out).filter((line) => line.feature === 'collider')).toHaveLength(0);
    expect(liveSpheres(out).filter((sphere) => sphere.feature === 'collider')).toHaveLength(4);
  });

  it('draws a contact normal from each contact point', () => {
    const world = createPhysics3DWorld();
    const floor = createRigidBody3D('static');
    floor.y = -1;
    addPhysics3DBody(world, floor);
    addPhysics3DCollider(
      world,
      floor,
      createPhysics3DCollider({ kind: 'aabb', minX: -10, minY: -1, minZ: -10, maxX: 10, maxY: 1, maxZ: 10 }),
    );
    addBody(world, unitBox, -0.05);
    buildPhysics3DContacts(world);
    const out = createPhysics3DDebugGeometry();

    writePhysics3DDebugGeometry(world, out, {
      drawColliders: false,
      drawCentersOfMass: false,
      contactNormalLength: 2,
    });

    const normals = liveLines(out).filter((line) => line.feature === 'contact-normal');
    expect(normals).toHaveLength(world.contacts[0].pointCount);
    expect(
      Math.hypot(normals[0].x1 - normals[0].x0, normals[0].y1 - normals[0].y0, normals[0].z1 - normals[0].z0),
    ).toBeCloseTo(2, 6);
    expect(normals[0].bodyB).not.toBe(-1);
  });

  it('draws a joint as the gap between its two anchors', () => {
    const world = createPhysics3DWorld();
    registerBuiltInPhysics3DJointSolvers(world);
    const first = addBody(world, unitBox);
    const second = addBody(world, unitBox);
    second.x = 5;
    addPhysics3DJoint(world, createPhysics3DBallAndSocketJoint({ bodyA: first.index, bodyB: second.index }));
    const out = createPhysics3DDebugGeometry();

    writePhysics3DDebugGeometry(world, out, { drawColliders: false, drawCentersOfMass: false });

    const joints = liveLines(out).filter((line) => line.feature === 'joint');
    expect(joints).toHaveLength(1);
    // The two anchors have drifted 5 apart, and the line shows that rather than collapsing to a point.
    expect(
      Math.hypot(joints[0].x1 - joints[0].x0, joints[0].y1 - joints[0].y0, joints[0].z1 - joints[0].z0),
    ).toBeCloseTo(5, 9);
  });

  it('draws the centre of mass where the body actually balances', () => {
    const world = createPhysics3DWorld();
    const body = createRigidBody3D('dynamic');
    addPhysics3DBody(world, body);
    addPhysics3DCollider(
      world,
      body,
      createPhysics3DCollider({ kind: 'aabb', minX: 1.5, minY: -0.5, minZ: -0.5, maxX: 2.5, maxY: 0.5, maxZ: 0.5 }),
    );
    const out = createPhysics3DDebugGeometry();

    writePhysics3DDebugGeometry(world, out, { drawColliders: false });

    const centers = liveSpheres(out).filter((sphere) => sphere.feature === 'center-of-mass');
    expect(centers).toHaveLength(1);
    // The collider sits a full 2 units along +x, so the centre of mass is there and not at the origin.
    expect(centers[0].x).toBeCloseTo(2, 9);
  });

  it('honours each feature toggle independently', () => {
    const world = createPhysics3DWorld();
    addBody(world, unitBox);
    const out = createPhysics3DDebugGeometry();

    writePhysics3DDebugGeometry(world, out, {
      drawColliders: false,
      drawCentersOfMass: false,
      drawContacts: false,
      drawJoints: false,
    });

    expect(out.lineCount).toBe(0);
    expect(out.sphereCount).toBe(0);
  });

  it('reuses its records, so a per-frame debug draw allocates nothing after the first', () => {
    const world = createPhysics3DWorld();
    addBody(world, unitBox);
    const out = createPhysics3DDebugGeometry();

    writePhysics3DDebugGeometry(world, out);
    const line = out.lines[0];
    const sphere = out.spheres[0];
    const lineCapacity = out.lines.length;
    writePhysics3DDebugGeometry(world, out);

    expect(out.lines[0]).toBe(line);
    expect(out.spheres[0]).toBe(sphere);
    expect(out.lines.length).toBe(lineCapacity);
  });

  it('retains capacity above the live prefix when the scene shrinks', () => {
    const world = createPhysics3DWorld();
    const body = addBody(world, unitBox);
    const out = createPhysics3DDebugGeometry();
    writePhysics3DDebugGeometry(world, out, { drawCentersOfMass: false });
    const capacity = out.lines.length;
    expect(capacity).toBe(12);

    body.colliders.length = 0;
    writePhysics3DDebugGeometry(world, out, { drawCentersOfMass: false });

    expect(out.lineCount).toBe(0);
    expect(out.lines.length).toBe(capacity);
  });
});
