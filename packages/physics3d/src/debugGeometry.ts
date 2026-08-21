import type {
  CollisionBuiltInShape3D,
  Physics3DDebugFeature,
  Physics3DDebugGeometry,
  Physics3DDebugGeometryOptions,
  Physics3DWorld,
  RigidBody3D,
} from '@flighthq/types/contract';

import { writeRigidBody3DWorldCenter } from './world';

// Creates a reusable destination for `writePhysics3DDebugGeometry`. The arrays are capacity pools: the
// writer advances counts and overwrites existing entries before growing them, so a steady scene stops
// allocating after its first query.
export function createPhysics3DDebugGeometry(): Physics3DDebugGeometry {
  return { lines: [], lineCount: 0, spheres: [], sphereCount: 0 };
}

// Extracts the world's visible constraint geometry without choosing a renderer.
//
// Collider outlines are transformed from LOCAL geometry and the body's current pose rather than read
// from `collider.world`: that cache is the narrow phase's snapshot from the top of the step, so drawing
// from it puts every wireframe one pose behind the body it belongs to — a lag that reads as the
// simulation being wrong rather than the debug view being stale.
//
// Two primitive kinds only. Everything curved becomes spheres, everything flat becomes lines, and a
// capsule becomes both; a renderer therefore needs one line pipeline and one sphere pipeline no matter
// which collider kinds a scene uses.
export function writePhysics3DDebugGeometry(
  world: Readonly<Physics3DWorld>,
  out: Physics3DDebugGeometry,
  options: Readonly<Partial<Physics3DDebugGeometryOptions>> = DEFAULT_OPTIONS,
): void {
  out.lineCount = 0;
  out.sphereCount = 0;

  if (options.drawColliders ?? DEFAULT_OPTIONS.drawColliders) {
    for (const body of world.bodies) {
      for (const collider of body.colliders) writeCollider(out, collider.local, body);
    }
  }

  if (options.drawContacts ?? DEFAULT_OPTIONS.drawContacts) {
    const length = options.contactNormalLength ?? DEFAULT_OPTIONS.contactNormalLength;
    for (const contact of world.contacts) {
      if (!contact.touching) continue;
      for (let i = 0; i < contact.pointCount; i += 1) {
        const point = contact.points[i];
        writeLine(
          out,
          'contact-normal',
          contact.bodyA,
          contact.bodyB,
          point.x,
          point.y,
          point.z,
          point.x + contact.normalX * length,
          point.y + contact.normalY * length,
          point.z + contact.normalZ * length,
        );
      }
    }
  }

  if (options.drawJoints ?? DEFAULT_OPTIONS.drawJoints) {
    for (const joint of world.joints) {
      const bodyA = world.bodyByIndex.get(joint.bodyA);
      const bodyB = world.bodyByIndex.get(joint.bodyB);
      if (bodyA === undefined || bodyB === undefined) continue;
      writeBodyPoint(bodyA, joint.localAnchorAX, joint.localAnchorAY, joint.localAnchorAZ, scratchAnchorA);
      writeBodyPoint(bodyB, joint.localAnchorBX, joint.localAnchorBY, joint.localAnchorBZ, scratchAnchorB);
      // Drawn as the two anchors joined, so a joint that has drifted apart under load is visible as a
      // gap rather than as one line that looks correct from either end.
      writeLine(
        out,
        'joint',
        joint.bodyA,
        joint.bodyB,
        scratchAnchorA[0],
        scratchAnchorA[1],
        scratchAnchorA[2],
        scratchAnchorB[0],
        scratchAnchorB[1],
        scratchAnchorB[2],
      );
    }
  }

  if (options.drawCentersOfMass ?? DEFAULT_OPTIONS.drawCentersOfMass) {
    const radius = options.centerOfMassRadius ?? DEFAULT_OPTIONS.centerOfMassRadius;
    for (const body of world.bodies) {
      writeRigidBody3DWorldCenter(body, scratchCenter);
      writeSphere(out, 'center-of-mass', body.index, -1, scratchCenter[0], scratchCenter[1], scratchCenter[2], radius);
    }
  }
}

function writeCollider(
  out: Physics3DDebugGeometry,
  shape: Readonly<CollisionBuiltInShape3D>,
  body: Readonly<RigidBody3D>,
): void {
  switch (shape.kind) {
    case 'sphere': {
      writeBodyPoint(body, shape.x, shape.y, shape.z, scratchPoint);
      writeSphere(out, 'collider', body.index, -1, scratchPoint[0], scratchPoint[1], scratchPoint[2], shape.radius);
      return;
    }
    case 'aabb':
      writeBoxWireframe(
        out,
        body,
        (shape.minX + shape.maxX) / 2,
        (shape.minY + shape.maxY) / 2,
        (shape.minZ + shape.maxZ) / 2,
        (shape.maxX - shape.minX) / 2,
        (shape.maxY - shape.minY) / 2,
        (shape.maxZ - shape.minZ) / 2,
        0,
        0,
        0,
        1,
      );
      return;
    case 'box':
      writeBoxWireframe(
        out,
        body,
        shape.x,
        shape.y,
        shape.z,
        shape.halfX,
        shape.halfY,
        shape.halfZ,
        shape.rotationX,
        shape.rotationY,
        shape.rotationZ,
        shape.rotationW,
      );
      return;
    case 'capsule': {
      writeBodyPoint(body, shape.x0, shape.y0, shape.z0, scratchAnchorA);
      writeBodyPoint(body, shape.x1, shape.y1, shape.z1, scratchAnchorB);
      writeSphere(
        out,
        'collider',
        body.index,
        -1,
        scratchAnchorA[0],
        scratchAnchorA[1],
        scratchAnchorA[2],
        shape.radius,
      );
      writeSphere(
        out,
        'collider',
        body.index,
        -1,
        scratchAnchorB[0],
        scratchAnchorB[1],
        scratchAnchorB[2],
        shape.radius,
      );
      // The axis itself, so a capsule's orientation is legible when the two caps overlap on screen.
      writeLine(
        out,
        'collider',
        body.index,
        -1,
        scratchAnchorA[0],
        scratchAnchorA[1],
        scratchAnchorA[2],
        scratchAnchorB[0],
        scratchAnchorB[1],
        scratchAnchorB[2],
      );
      return;
    }
    case 'convex': {
      // A bare point list carries no edges, so a hull is drawn as its VERTICES rather than as a
      // wireframe. Inventing edges would need the same triangulation a hull's mass properties and
      // raycast are both waiting on, and a guessed edge set is worse than none: it draws a solid the
      // simulation does not have.
      const points = shape.points;
      for (let i = 0; i + 2 < points.length; i += 3) {
        writeBodyPoint(body, points[i], points[i + 1], points[i + 2], scratchPoint);
        writeSphere(
          out,
          'collider',
          body.index,
          -1,
          scratchPoint[0],
          scratchPoint[1],
          scratchPoint[2],
          HULL_VERTEX_RADIUS,
        );
      }
    }
  }
}

// The twelve edges of a box, each corner rotated by the collider's own rotation and then by the body's.
function writeBoxWireframe(
  out: Physics3DDebugGeometry,
  body: Readonly<RigidBody3D>,
  centerX: number,
  centerY: number,
  centerZ: number,
  halfX: number,
  halfY: number,
  halfZ: number,
  rotationX: number,
  rotationY: number,
  rotationZ: number,
  rotationW: number,
): void {
  for (let corner = 0; corner < 8; corner += 1) {
    const signX = (corner & 1) === 0 ? -1 : 1;
    const signY = (corner & 2) === 0 ? -1 : 1;
    const signZ = (corner & 4) === 0 ? -1 : 1;
    rotatePoint(rotationX, rotationY, rotationZ, rotationW, signX * halfX, signY * halfY, signZ * halfZ, scratchPoint);
    writeBodyPoint(
      body,
      centerX + scratchPoint[0],
      centerY + scratchPoint[1],
      centerZ + scratchPoint[2],
      scratchCorners[corner],
    );
  }

  // Corner index bits are (x, y, z), so two corners share an edge exactly when their indices differ in
  // ONE bit — which is what these pairs enumerate.
  for (const [a, b] of BOX_EDGES) {
    writeLine(
      out,
      'collider',
      body.index,
      -1,
      scratchCorners[a][0],
      scratchCorners[a][1],
      scratchCorners[a][2],
      scratchCorners[b][0],
      scratchCorners[b][1],
      scratchCorners[b][2],
    );
  }
}

// Takes a point in the body's LOCAL frame to world space.
function writeBodyPoint(body: Readonly<RigidBody3D>, x: number, y: number, z: number, out: number[]): void {
  rotatePoint(body.orientationX, body.orientationY, body.orientationZ, body.orientationW, x, y, z, out);
  out[0] += body.x;
  out[1] += body.y;
  out[2] += body.z;
}

function rotatePoint(
  qX: number,
  qY: number,
  qZ: number,
  qW: number,
  x: number,
  y: number,
  z: number,
  out: number[],
): void {
  const tX = 2 * (qY * z - qZ * y);
  const tY = 2 * (qZ * x - qX * z);
  const tZ = 2 * (qX * y - qY * x);
  out[0] = x + qW * tX + qY * tZ - qZ * tY;
  out[1] = y + qW * tY + qZ * tX - qX * tZ;
  out[2] = z + qW * tZ + qX * tY - qY * tX;
}

function writeLine(
  out: Physics3DDebugGeometry,
  feature: Physics3DDebugFeature,
  bodyA: number,
  bodyB: number,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
): void {
  const line = out.lines[out.lineCount];
  if (line === undefined) out.lines.push({ feature, bodyA, bodyB, x0, y0, z0, x1, y1, z1 });
  else {
    line.feature = feature;
    line.bodyA = bodyA;
    line.bodyB = bodyB;
    line.x0 = x0;
    line.y0 = y0;
    line.z0 = z0;
    line.x1 = x1;
    line.y1 = y1;
    line.z1 = z1;
  }
  out.lineCount += 1;
}

function writeSphere(
  out: Physics3DDebugGeometry,
  feature: Physics3DDebugFeature,
  bodyA: number,
  bodyB: number,
  x: number,
  y: number,
  z: number,
  radius: number,
): void {
  const sphere = out.spheres[out.sphereCount];
  if (sphere === undefined) out.spheres.push({ feature, bodyA, bodyB, x, y, z, radius });
  else {
    sphere.feature = feature;
    sphere.bodyA = bodyA;
    sphere.bodyB = bodyB;
    sphere.x = x;
    sphere.y = y;
    sphere.z = z;
    sphere.radius = radius;
  }
  out.sphereCount += 1;
}

const DEFAULT_OPTIONS: Readonly<Physics3DDebugGeometryOptions> = {
  drawCentersOfMass: true,
  drawColliders: true,
  drawContacts: true,
  drawJoints: true,
  centerOfMassRadius: 0.08,
  contactNormalLength: 0.5,
};

// The twelve pairs of corner indices differing in exactly one bit.
const BOX_EDGES: readonly (readonly [number, number])[] = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  [0, 2],
  [1, 3],
  [4, 6],
  [5, 7],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

const HULL_VERTEX_RADIUS = 0.02;

const scratchAnchorA = [0, 0, 0];

const scratchAnchorB = [0, 0, 0];

const scratchCenter = [0, 0, 0];

const scratchCorners = [
  [0, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
];

const scratchPoint = [0, 0, 0];
