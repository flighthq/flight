import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  CollisionBuiltInShape2D,
  EntityConstruction,
  Physics2DDebugCircle,
  Physics2DDebugFeature,
  Physics2DDebugGeometry,
  Physics2DDebugGeometryOptions,
  Physics2DDebugLine,
  Physics2DJoint,
  Physics2DMouseJoint,
  Physics2DPulleyJoint,
  Physics2DWorld,
  RigidBody2D,
} from '@flighthq/types/contract';

import { findPhysics2DBody } from './world';

const DEFAULT_OPTIONS: Readonly<Physics2DDebugGeometryOptions> = {
  drawCentersOfMass: true,
  drawColliders: true,
  drawContacts: true,
  drawJoints: true,
  centerOfMassRadius: 0.08,
  contactNormalLength: 0.5,
  pointRadius: 0.04,
};

export function createPhysics2DDebugGeometry(): Physics2DDebugGeometry {
  const out = allocateEntity<Physics2DDebugGeometry>();
  initializePhysics2DDebugGeometry(out);
  return finishEntity(out);
}

// Creates a reusable destination for writePhysics2DDebugGeometry. The arrays are capacity pools: the
// writer advances counts and overwrites existing entries before growing them, so a steady scene stops
// allocating after its first query.
export function initializePhysics2DDebugGeometry(out: EntityConstruction<Physics2DDebugGeometry>): void {
  out.circles = [];
  out.circleCount = 0;
  out.lines = [];
  out.lineCount = 0;
}

// Extracts the world's visible constraint geometry without choosing a renderer. Collider outlines are
// transformed from local geometry and the body's CURRENT pose rather than read from collider.world:
// that cache is the narrow phase's pre-integration snapshot and may be one pose behind immediately after
// a step. Every output object is reused; consumers read only entries below lineCount/circleCount.
export function writePhysics2DDebugGeometry(
  world: Readonly<Physics2DWorld>,
  out: Physics2DDebugGeometry,
  options: Readonly<Partial<Physics2DDebugGeometryOptions>> = DEFAULT_OPTIONS,
): void {
  out.lineCount = 0;
  out.circleCount = 0;

  if (options.drawColliders ?? DEFAULT_OPTIONS.drawColliders) {
    for (const body of world.bodies) {
      for (const collider of body.colliders) writeCollider(out, collider.local, body, options);
    }
  }

  if (options.drawContacts ?? DEFAULT_OPTIONS.drawContacts) {
    const length = options.contactNormalLength ?? DEFAULT_OPTIONS.contactNormalLength;
    for (const contact of world.contacts) {
      if (!contact.touching) continue;
      for (let i = 0; i < contact.pointCount; i++) {
        const point = contact.points[i];
        writeLine(
          out,
          'contact-normal',
          contact.bodyA,
          contact.bodyB,
          point.x,
          point.y,
          point.x + contact.normalX * length,
          point.y + contact.normalY * length,
        );
      }
    }
  }

  if (options.drawJoints ?? DEFAULT_OPTIONS.drawJoints) {
    for (const joint of world.joints) writeJoint(out, world, joint);
  }

  if (options.drawCentersOfMass ?? DEFAULT_OPTIONS.drawCentersOfMass) {
    const radius = options.centerOfMassRadius ?? DEFAULT_OPTIONS.centerOfMassRadius;
    for (const body of world.bodies) {
      const cos = Math.cos(body.angle);
      const sin = Math.sin(body.angle);
      writeCircle(
        out,
        'center-of-mass',
        body.index,
        -1,
        body.x + body.centerX * cos - body.centerY * sin,
        body.y + body.centerX * sin + body.centerY * cos,
        radius,
      );
    }
  }
}

function writeCollider(
  out: Physics2DDebugGeometry,
  shape: Readonly<CollisionBuiltInShape2D>,
  body: Readonly<RigidBody2D>,
  options: Readonly<Partial<Physics2DDebugGeometryOptions>>,
): void {
  const cos = Math.cos(body.angle);
  const sin = Math.sin(body.angle);
  switch (shape.kind) {
    case 'circle': {
      const x = body.x + shape.x * cos - shape.y * sin;
      const y = body.y + shape.x * sin + shape.y * cos;
      writeCircle(out, 'collider', body.index, -1, x, y, shape.radius);
      return;
    }
    case 'aabb': {
      const centerX = (shape.minX + shape.maxX) / 2;
      const centerY = (shape.minY + shape.maxY) / 2;
      writeOrientedBox(
        out,
        body.index,
        body.x + centerX * cos - centerY * sin,
        body.y + centerX * sin + centerY * cos,
        (shape.maxX - shape.minX) / 2,
        (shape.maxY - shape.minY) / 2,
        body.angle,
      );
      return;
    }
    case 'obb': {
      writeOrientedBox(
        out,
        body.index,
        body.x + shape.x * cos - shape.y * sin,
        body.y + shape.x * sin + shape.y * cos,
        shape.halfW,
        shape.halfH,
        body.angle + shape.rotation,
      );
      return;
    }
    case 'polygon': {
      const points = shape.points;
      if (points.length < 4) return;
      let localX = points[points.length - 2];
      let localY = points[points.length - 1];
      let previousX = body.x + localX * cos - localY * sin;
      let previousY = body.y + localX * sin + localY * cos;
      for (let i = 0; i < points.length; i += 2) {
        localX = points[i];
        localY = points[i + 1];
        const x = body.x + localX * cos - localY * sin;
        const y = body.y + localX * sin + localY * cos;
        writeLine(out, 'collider', body.index, -1, previousX, previousY, x, y);
        previousX = x;
        previousY = y;
      }
      return;
    }
    case 'capsule': {
      // Drawn as its two end discs plus the two lines that bound the body between them, which is the
      // capsule's actual silhouette. A single line with two circles would leave the straight sides
      // missing, and a bounding box would draw a shape the collider does not have.
      const x0 = body.x + shape.x0 * cos - shape.y0 * sin;
      const y0 = body.y + shape.x0 * sin + shape.y0 * cos;
      const x1 = body.x + shape.x1 * cos - shape.y1 * sin;
      const y1 = body.y + shape.x1 * sin + shape.y1 * cos;
      writeCircle(out, 'collider', body.index, -1, x0, y0, shape.radius);
      writeCircle(out, 'collider', body.index, -1, x1, y1, shape.radius);
      const axisX = x1 - x0;
      const axisY = y1 - y0;
      const length = Math.sqrt(axisX * axisX + axisY * axisY);
      if (length > 0) {
        // The outward perpendicular, scaled to the radius: the two sides sit exactly one radius either
        // side of the axis, which is what makes them tangent to both end discs.
        const offsetX = (-axisY / length) * shape.radius;
        const offsetY = (axisX / length) * shape.radius;
        writeLine(out, 'collider', body.index, -1, x0 + offsetX, y0 + offsetY, x1 + offsetX, y1 + offsetY);
        writeLine(out, 'collider', body.index, -1, x0 - offsetX, y0 - offsetY, x1 - offsetX, y1 - offsetY);
      }
      return;
    }
    case 'segment': {
      const x0 = body.x + shape.x0 * cos - shape.y0 * sin;
      const y0 = body.y + shape.x0 * sin + shape.y0 * cos;
      const x1 = body.x + shape.x1 * cos - shape.y1 * sin;
      const y1 = body.y + shape.x1 * sin + shape.y1 * cos;
      writeLine(out, 'collider', body.index, -1, x0, y0, x1, y1);
      return;
    }
    case 'point': {
      const x = body.x + shape.x * cos - shape.y * sin;
      const y = body.y + shape.x * sin + shape.y * cos;
      writeCircle(out, 'collider', body.index, -1, x, y, options.pointRadius ?? DEFAULT_OPTIONS.pointRadius);
    }
  }
}

function writeOrientedBox(
  out: Physics2DDebugGeometry,
  bodyIndex: number,
  centerX: number,
  centerY: number,
  halfW: number,
  halfH: number,
  rotation: number,
): void {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const x0 = centerX - halfW * cos + halfH * sin;
  const y0 = centerY - halfW * sin - halfH * cos;
  const x1 = centerX + halfW * cos + halfH * sin;
  const y1 = centerY + halfW * sin - halfH * cos;
  const x2 = centerX + halfW * cos - halfH * sin;
  const y2 = centerY + halfW * sin + halfH * cos;
  const x3 = centerX - halfW * cos - halfH * sin;
  const y3 = centerY - halfW * sin + halfH * cos;
  writeLine(out, 'collider', bodyIndex, -1, x0, y0, x1, y1);
  writeLine(out, 'collider', bodyIndex, -1, x1, y1, x2, y2);
  writeLine(out, 'collider', bodyIndex, -1, x2, y2, x3, y3);
  writeLine(out, 'collider', bodyIndex, -1, x3, y3, x0, y0);
}

function writeJoint(
  out: Physics2DDebugGeometry,
  world: Readonly<Physics2DWorld>,
  joint: Readonly<Physics2DJoint>,
): void {
  const bodyB = findPhysics2DBody(world, joint.bodyB);
  if (bodyB === null) return;
  const anchorBX = jointAnchorX(bodyB, joint.localAnchorBX, joint.localAnchorBY);
  const anchorBY = jointAnchorY(bodyB, joint.localAnchorBX, joint.localAnchorBY);
  if (joint.kind === 'Mouse') {
    const mouse = joint as Physics2DMouseJoint;
    writeLine(out, 'joint', joint.bodyA, joint.bodyB, mouse.targetX, mouse.targetY, anchorBX, anchorBY);
    return;
  }
  if (world.jointSolvers.get(joint.kind)?.usesBodyA === false) return;
  const bodyA = findPhysics2DBody(world, joint.bodyA);
  if (bodyA === null) return;
  const anchorAX = jointAnchorX(bodyA, joint.localAnchorAX, joint.localAnchorAY);
  const anchorAY = jointAnchorY(bodyA, joint.localAnchorAX, joint.localAnchorAY);
  if (joint.kind === 'Pulley') {
    const pulley = joint as Physics2DPulleyJoint;
    writeLine(out, 'joint', joint.bodyA, joint.bodyB, pulley.groundAnchorAX, pulley.groundAnchorAY, anchorAX, anchorAY);
    writeLine(out, 'joint', joint.bodyA, joint.bodyB, pulley.groundAnchorBX, pulley.groundAnchorBY, anchorBX, anchorBY);
    writeLine(
      out,
      'joint',
      joint.bodyA,
      joint.bodyB,
      pulley.groundAnchorAX,
      pulley.groundAnchorAY,
      pulley.groundAnchorBX,
      pulley.groundAnchorBY,
    );
    return;
  }
  writeLine(out, 'joint', joint.bodyA, joint.bodyB, anchorAX, anchorAY, anchorBX, anchorBY);
}

function jointAnchorX(body: Readonly<RigidBody2D>, localX: number, localY: number): number {
  const x = localX - body.centerX;
  const y = localY - body.centerY;
  return body.x + x * Math.cos(body.angle) - y * Math.sin(body.angle);
}

function jointAnchorY(body: Readonly<RigidBody2D>, localX: number, localY: number): number {
  const x = localX - body.centerX;
  const y = localY - body.centerY;
  return body.y + x * Math.sin(body.angle) + y * Math.cos(body.angle);
}

function writeLine(
  out: Physics2DDebugGeometry,
  feature: Physics2DDebugFeature,
  bodyA: number,
  bodyB: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  let line: Physics2DDebugLine;
  if (out.lineCount < out.lines.length) line = out.lines[out.lineCount];
  else {
    line = { bodyA: -1, bodyB: -1, feature: 'collider', x0: 0, x1: 0, y0: 0, y1: 0 };
    out.lines.push(line);
  }
  out.lineCount++;
  line.feature = feature;
  line.bodyA = bodyA;
  line.bodyB = bodyB;
  line.x0 = x0;
  line.y0 = y0;
  line.x1 = x1;
  line.y1 = y1;
}

function writeCircle(
  out: Physics2DDebugGeometry,
  feature: Physics2DDebugFeature,
  bodyA: number,
  bodyB: number,
  x: number,
  y: number,
  radius: number,
): void {
  let circle: Physics2DDebugCircle;
  if (out.circleCount < out.circles.length) circle = out.circles[out.circleCount];
  else {
    circle = { bodyA: -1, bodyB: -1, feature: 'collider', radius: 0, x: 0, y: 0 };
    out.circles.push(circle);
  }
  out.circleCount++;
  circle.feature = feature;
  circle.bodyA = bodyA;
  circle.bodyB = bodyB;
  circle.x = x;
  circle.y = y;
  circle.radius = radius;
}
