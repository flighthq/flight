import {
  collideCollisionHeightfield3D,
  collideCollisionTriangleMesh3D,
  collideContactManifold3D,
  raycastCollisionHeightfield3D,
  raycastCollisionShape3D,
  raycastCollisionTriangleMesh3D,
  sweepCollisionHeightfield3D,
  sweepCollisionShape3D,
  sweepCollisionTriangleMesh3D,
} from '@flighthq/collision/contract';
import type {
  CollisionColliderShape3D,
  CollisionContactManifold3D,
  CollisionRaycastHit3D,
  CollisionTimeOfImpact3D,
} from '@flighthq/types/contract';

export function collidePhysics3DColliderShapes(
  shapeA: Readonly<CollisionColliderShape3D>,
  shapeB: Readonly<CollisionColliderShape3D>,
  out: CollisionContactManifold3D,
): boolean {
  if (shapeA.kind === 'triangle-mesh' || shapeA.kind === 'heightfield') {
    if (shapeB.kind === 'triangle-mesh' || shapeB.kind === 'heightfield') return false;
    const hit =
      shapeA.kind === 'triangle-mesh'
        ? collideCollisionTriangleMesh3D(shapeB, shapeA, out)
        : collideCollisionHeightfield3D(shapeB, shapeA, out);
    if (hit) reversePhysics3DManifoldNormal(out);
    return hit;
  }
  if (shapeB.kind === 'triangle-mesh') return collideCollisionTriangleMesh3D(shapeA, shapeB, out);
  if (shapeB.kind === 'heightfield') return collideCollisionHeightfield3D(shapeA, shapeB, out);
  return collideContactManifold3D(shapeA, shapeB, out);
}

export function raycastPhysics3DColliderShape(
  shape: Readonly<CollisionColliderShape3D>,
  originX: number,
  originY: number,
  originZ: number,
  directionX: number,
  directionY: number,
  directionZ: number,
  out: CollisionRaycastHit3D,
  maxFraction: number,
): boolean {
  if (shape.kind === 'triangle-mesh') {
    return raycastCollisionTriangleMesh3D(
      shape,
      originX,
      originY,
      originZ,
      directionX,
      directionY,
      directionZ,
      out,
      maxFraction,
    );
  }
  if (shape.kind === 'heightfield') {
    return raycastCollisionHeightfield3D(
      shape,
      originX,
      originY,
      originZ,
      directionX,
      directionY,
      directionZ,
      out,
      maxFraction,
    );
  }
  return raycastCollisionShape3D(
    shape,
    originX,
    originY,
    originZ,
    directionX,
    directionY,
    directionZ,
    out,
    maxFraction,
  );
}

export function sweepPhysics3DColliderShapes(
  shapeA: Readonly<CollisionColliderShape3D>,
  deltaAX: number,
  deltaAY: number,
  deltaAZ: number,
  shapeB: Readonly<CollisionColliderShape3D>,
  deltaBX: number,
  deltaBY: number,
  deltaBZ: number,
  out: CollisionTimeOfImpact3D,
  maxFraction: number,
): boolean {
  if (shapeA.kind === 'triangle-mesh' || shapeA.kind === 'heightfield') {
    if (shapeB.kind === 'triangle-mesh' || shapeB.kind === 'heightfield') return false;
    const hit =
      shapeA.kind === 'triangle-mesh'
        ? sweepCollisionTriangleMesh3D(
            shapeB,
            deltaBX - deltaAX,
            deltaBY - deltaAY,
            deltaBZ - deltaAZ,
            shapeA,
            out,
            maxFraction,
          )
        : sweepCollisionHeightfield3D(
            shapeB,
            deltaBX - deltaAX,
            deltaBY - deltaAY,
            deltaBZ - deltaAZ,
            shapeA,
            out,
            maxFraction,
          );
    if (hit) {
      out.normalX = -out.normalX;
      out.normalY = -out.normalY;
      out.normalZ = -out.normalZ;
    }
    return hit;
  }
  if (shapeB.kind === 'triangle-mesh') {
    return sweepCollisionTriangleMesh3D(
      shapeA,
      deltaAX - deltaBX,
      deltaAY - deltaBY,
      deltaAZ - deltaBZ,
      shapeB,
      out,
      maxFraction,
    );
  }
  if (shapeB.kind === 'heightfield') {
    return sweepCollisionHeightfield3D(
      shapeA,
      deltaAX - deltaBX,
      deltaAY - deltaBY,
      deltaAZ - deltaBZ,
      shapeB,
      out,
      maxFraction,
    );
  }
  return sweepCollisionShape3D(shapeA, deltaAX, deltaAY, deltaAZ, shapeB, deltaBX, deltaBY, deltaBZ, out, maxFraction);
}

function reversePhysics3DManifoldNormal(out: CollisionContactManifold3D): void {
  out.normalX = -out.normalX;
  out.normalY = -out.normalY;
  out.normalZ = -out.normalZ;
}
