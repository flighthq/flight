import type { CollisionAabb2D, CollisionCircle2D, CollisionObb2D, CollisionPolygon2D } from '@flighthq/types/contract';

import { registerCollisionPairTest2D } from './collisionSupport2D';
import {
  testAabbAabbCollision2D,
  testAabbObbCollision2D,
  testAabbPolygonCollision2D,
  testCircleAabbCollision2D,
  testCircleCircleCollision2D,
  testCircleObbCollision2D,
  testCirclePolygonCollision2D,
  testObbObbCollision2D,
  testObbPolygonCollision2D,
  testPolygonPolygonCollision2D,
} from './shapeCollision2D';

// Registers the ten SAT pairs over the generic support-function floor.
//
// Kept in its own module rather than beside the registries, and explicit rather than part of module
// load, because these two costs are separable and a caller should be able to pay only one: registering
// supports links GJK/EPA, registering these links the SAT core and its contact clipping. A bundle that
// wants only the generic floor never reaches this file, and one that calls the direct typed pair
// functions reaches neither registry.
//
// Only the TEN canonical orders are registered, not all twenty. `testCollision2D` tries the reverse key
// and negates the normal when it answers, because a manifold is oriented A-out-of-B and a specialization
// written for (circle, aabb) computes exactly the same geometry for (aabb, circle) mirrored.
//
// Each entry is a cast adapter, and the cast is sound for one reason: a pair test is only ever reached
// through the key it was registered against, so `kindA` having selected this entry IS the evidence that
// `a` carries that kind's parameters. The registry cannot express that in its type — a `Map` keyed by
// kind pair has one value type — so it is carried here, once per entry, rather than re-checked at
// runtime on every call.
export function registerBuiltInCollisionPairTests2D(): void {
  registerCollisionPairTest2D('aabb', 'aabb', (a, b, out) =>
    testAabbAabbCollision2D(a as CollisionAabb2D, b as CollisionAabb2D, out),
  );
  registerCollisionPairTest2D('aabb', 'obb', (a, b, out) =>
    testAabbObbCollision2D(a as CollisionAabb2D, b as CollisionObb2D, out),
  );
  registerCollisionPairTest2D('aabb', 'polygon', (a, b, out) =>
    testAabbPolygonCollision2D(a as CollisionAabb2D, b as CollisionPolygon2D, out),
  );
  registerCollisionPairTest2D('circle', 'aabb', (a, b, out) =>
    testCircleAabbCollision2D(a as CollisionCircle2D, b as CollisionAabb2D, out),
  );
  registerCollisionPairTest2D('circle', 'circle', (a, b, out) =>
    testCircleCircleCollision2D(a as CollisionCircle2D, b as CollisionCircle2D, out),
  );
  registerCollisionPairTest2D('circle', 'obb', (a, b, out) =>
    testCircleObbCollision2D(a as CollisionCircle2D, b as CollisionObb2D, out),
  );
  registerCollisionPairTest2D('circle', 'polygon', (a, b, out) =>
    testCirclePolygonCollision2D(a as CollisionCircle2D, b as CollisionPolygon2D, out),
  );
  registerCollisionPairTest2D('obb', 'obb', (a, b, out) =>
    testObbObbCollision2D(a as CollisionObb2D, b as CollisionObb2D, out),
  );
  registerCollisionPairTest2D('obb', 'polygon', (a, b, out) =>
    testObbPolygonCollision2D(a as CollisionObb2D, b as CollisionPolygon2D, out),
  );
  registerCollisionPairTest2D('polygon', 'polygon', (a, b, out) =>
    testPolygonPolygonCollision2D(a as CollisionPolygon2D, b as CollisionPolygon2D, out),
  );
}
