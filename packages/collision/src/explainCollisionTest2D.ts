import type { CollisionShape2D, CollisionTestExplanation2D } from '@flighthq/types/contract';

import { getCollisionShapeValidationStatus2D } from './collisionShapeValidation';
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
  const overlapping = testCollision2D(a, b, { depth: 0, normalX: 0, normalY: 0, overlapping: false });
  return {
    kind: null,
    overlapping,
    shapeIndex: null,
    status: overlapping ? 'overlapping' : 'separated',
  };
}
