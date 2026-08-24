import { RAD_TO_DEG } from '@flighthq/math/contract';
import { invalidateNodeLocalTransform } from '@flighthq/node/contract';
import type { Node2D, RigidBody2D } from '@flighthq/types/contract';

// Copies a 2D rigid body's world pose onto a display object's local transform fields and invalidates
// its matrix cache. The body's `angle` (radians, math layer) is converted to the node's `rotation`
// (degrees, authoring layer) at this seam — the one place the SDK converts everywhere else.
export function updateNode2DFromPhysics2DBody(body: Readonly<RigidBody2D>, node: Node2D): void {
  node.x = body.x;
  node.y = body.y;
  node.rotation = body.angle * RAD_TO_DEG;
  invalidateNodeLocalTransform(node);
}
