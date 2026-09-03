import type { CollisionShape2D, CollisionTestExplanation2D } from '@flighthq/types/contract';

import { getCollisionShapeValidationStatus2D } from './collisionShapeValidation2D';
import { getCollisionPairTest2D, getCollisionSupport2D } from './collisionSupport2D';
import { createCollisionManifold2D } from './manifold2D';
import { testCollision2D } from './testCollision2D';

// Pure diagnostic twin of testCollision2D. It classifies invalid and unsupported inputs before
// running the ordinary dispatcher, so callers can distinguish its silent false sentinel from a
// legitimate separated pair without retaining state or enabling guards.
export function explainCollisionTest2D(
  a: Readonly<CollisionShape2D>,
  b: Readonly<CollisionShape2D>,
): CollisionTestExplanation2D {
  const statusA = getCollisionShapeValidationStatus2D(a);
  if (statusA !== null) return { kind: a.kind, overlapping: false, shapeIndex: 0, status: statusA };
  const statusB = getCollisionShapeValidationStatus2D(b);
  if (statusB !== null) return { kind: b.kind, overlapping: false, shapeIndex: 1, status: statusB };

  // A valid shape whose kind has no RUNTIME binding is the sentinel the two registries introduced, and
  // it is invisible to shape validation: a circle is a perfectly valid circle whether or not anyone
  // registered anything for it. Without this, forgetting `registerBuiltInCollisionSupports2D` reports
  // two overlapping circles as `separated` — the diagnostic seam repeating the dispatcher's silence
  // instead of explaining it, which is the one thing it exists not to do.
  //
  // Asked only when no specialization covers the pair in either order, because a pair test needs no
  // support functions at all.
  if (getCollisionPairTest2D(a.kind, b.kind) === null && getCollisionPairTest2D(b.kind, a.kind) === null) {
    if (getCollisionSupport2D(a.kind) === null) {
      return { kind: a.kind, overlapping: false, shapeIndex: 0, status: 'unsupported-shape-kind' };
    }
    if (getCollisionSupport2D(b.kind) === null) {
      return { kind: b.kind, overlapping: false, shapeIndex: 1, status: 'unsupported-shape-kind' };
    }
  }

  const overlapping = testCollision2D(a, b, createCollisionManifold2D());
  return {
    kind: null,
    overlapping,
    shapeIndex: null,
    status: overlapping ? 'overlapping' : 'separated',
  };
}
