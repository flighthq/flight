import { invalidateNodeLocalTransform } from '@flighthq/node/contract';
import type { Node3D, RigidBody3D } from '@flighthq/types/contract';

// Copies a rigid body's world pose (position + orientation quaternion) onto a node's local transform
// fields and invalidates its matrix cache. Call once per frame after `stepPhysics3D` to drive a scene
// node from a simulation body. Does NOT handle centre-of-mass offset or compound collider transforms —
// both body and node share the same origin convention (entity centre).
export function updateNode3DFromPhysics3DBody(body: Readonly<RigidBody3D>, node: Node3D): void {
  node.position.x = body.x;
  node.position.y = body.y;
  node.position.z = body.z;
  node.rotation.x = body.orientationX;
  node.rotation.y = body.orientationY;
  node.rotation.z = body.orientationZ;
  node.rotation.w = body.orientationW;
  invalidateNodeLocalTransform(node);
}
