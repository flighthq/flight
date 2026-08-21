import type { CollisionAabb3D, CollisionBox3D, CollisionCapsule3D, CollisionSphere3D } from '@flighthq/types/contract';

import { registerCollisionPairTest3D } from './collisionSupport3D';
import {
  testAabbAabbCollision3D,
  testCapsuleCapsuleCollision3D,
  testSphereAabbCollision3D,
  testSphereBoxCollision3D,
  testSphereCapsuleCollision3D,
  testSphereSphereCollision3D,
} from './shapeCollision3D';

// Registers the six closed-form 3D pairs over the generic GJK/EPA floor.
//
// Separable from `registerBuiltInCollisionSupports3D` on purpose, and the two answer different
// questions: registering supports is what makes a kind WORK AT ALL, while registering these makes six
// already-working pairs exact and fast. A caller who wants only the generic floor pays for neither this
// module nor the closed-form code it links.
//
// Only the canonical order of each pair is registered. `testCollision3D` tries the reversed key and
// negates the normal when it answers, because a manifold is oriented A-out-of-B and a specialization
// written for (sphere, aabb) computes exactly the same geometry for (aabb, sphere) mirrored.
//
// Each entry is a cast adapter, sound for the same reason as the 2D registrar: a pair test is reached
// only through the key it was registered against, so `kindA` having selected the entry IS the evidence
// that `a` carries that kind's parameters. A `Map` keyed by kind pair has one value type and cannot
// express that, so it is carried here once per entry rather than re-checked on every call.
export function registerBuiltInCollisionPairTests3D(): void {
  registerCollisionPairTest3D('aabb', 'aabb', (a, b, out) =>
    testAabbAabbCollision3D(a as CollisionAabb3D, b as CollisionAabb3D, out),
  );
  registerCollisionPairTest3D('capsule', 'capsule', (a, b, out) =>
    testCapsuleCapsuleCollision3D(a as CollisionCapsule3D, b as CollisionCapsule3D, out),
  );
  registerCollisionPairTest3D('sphere', 'aabb', (a, b, out) =>
    testSphereAabbCollision3D(a as CollisionSphere3D, b as CollisionAabb3D, out),
  );
  registerCollisionPairTest3D('sphere', 'box', (a, b, out) =>
    testSphereBoxCollision3D(a as CollisionSphere3D, b as CollisionBox3D, out),
  );
  registerCollisionPairTest3D('sphere', 'capsule', (a, b, out) =>
    testSphereCapsuleCollision3D(a as CollisionSphere3D, b as CollisionCapsule3D, out),
  );
  registerCollisionPairTest3D('sphere', 'sphere', (a, b, out) =>
    testSphereSphereCollision3D(a as CollisionSphere3D, b as CollisionSphere3D, out),
  );
}
