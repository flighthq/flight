import type { CollisionShape3D, CollisionTestExplanation3D } from '@flighthq/types/contract';

import { getCollisionShapeValidationStatus3D } from './collisionShapeValidation3D';
import { getCollisionPairTest3D, getCollisionSupport3D } from './collisionSupport3D';
import { createCollisionManifold3D } from './manifold3D';
import { testCollision3D } from './testCollision3D';

// Pure diagnostic twin of testCollision3D. It classifies invalid and unsupported inputs before running
// the ordinary dispatcher, so a caller can tell the silent false sentinel apart from a genuinely
// separated pair without retaining state or enabling guards.
export function explainCollisionTest3D(
  a: Readonly<CollisionShape3D>,
  b: Readonly<CollisionShape3D>,
): CollisionTestExplanation3D {
  const statusA = getCollisionShapeValidationStatus3D(a);
  if (statusA !== null) return { kind: a.kind, overlapping: false, shapeIndex: 0, status: statusA };
  const statusB = getCollisionShapeValidationStatus3D(b);
  if (statusB !== null) return { kind: b.kind, overlapping: false, shapeIndex: 1, status: statusB };

  // A valid shape whose kind has no RUNTIME binding is the sentinel the registries introduce, and shape
  // validation cannot see it: a sphere is a perfectly good sphere whether or not anyone registered a
  // support function for it. Without this, forgetting `registerBuiltInCollisionSupports3D` reports two
  // interpenetrating spheres as `separated` — the diagnostic seam repeating the dispatcher's silence
  // instead of explaining it, which is the one thing it exists not to do. This is the trap
  // `agents/packages/physics3d/status.md` names as the package's sharpest usability edge: a world whose
  // supports were never registered steps perfectly and detects nothing.
  //
  // Asked only when no specialization covers the pair in either order, because a pair test reaches its
  // answer without consulting a support function at all.
  if (getCollisionPairTest3D(a.kind, b.kind) === null && getCollisionPairTest3D(b.kind, a.kind) === null) {
    if (getCollisionSupport3D(a.kind) === null) {
      return { kind: a.kind, overlapping: false, shapeIndex: 0, status: 'unsupported-shape-kind' };
    }
    if (getCollisionSupport3D(b.kind) === null) {
      return { kind: b.kind, overlapping: false, shapeIndex: 1, status: 'unsupported-shape-kind' };
    }
  }

  const overlapping = testCollision3D(a, b, createCollisionManifold3D());
  return {
    kind: null,
    overlapping,
    shapeIndex: null,
    status: overlapping ? 'overlapping' : 'separated',
  };
}
