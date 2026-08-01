import type { CollisionShape, CollisionTestExplanation } from '@flighthq/types/contract';

import { getCollisionShapeValidationStatus } from './collisionShapeValidation';
import { testCollision } from './testCollision';

// Pure diagnostic twin of testCollision. It classifies invalid and unsupported inputs before
// running the ordinary dispatcher, so callers can distinguish its silent false sentinel from a
// legitimate separated pair without retaining state or enabling guards.
export function explainCollisionTest(
  a: Readonly<CollisionShape>,
  b: Readonly<CollisionShape>,
): CollisionTestExplanation {
  const statusA = getCollisionShapeValidationStatus(a);
  if (statusA !== null) return { kind: a.kind, overlapping: false, shapeIndex: 0, status: statusA };
  const statusB = getCollisionShapeValidationStatus(b);
  if (statusB !== null) return { kind: b.kind, overlapping: false, shapeIndex: 1, status: statusB };
  const overlapping = testCollision(a, b, { depth: 0, normalX: 0, normalY: 0, overlapping: false });
  return {
    kind: null,
    overlapping,
    shapeIndex: null,
    status: overlapping ? 'overlapping' : 'separated',
  };
}
