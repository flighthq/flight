import { logOnce } from '@flighthq/log/contract';
import type { CollisionShape2D, CollisionTestExplanation2D, CollisionTestStatus } from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { getCollisionShapeValidationStatus2D } from './collisionShapeValidation';
import { setCollisionTestGuard2D } from './testCollision2D';

export function areCollisionGuardsEnabled(): boolean {
  return collisionGuardsEnabled;
}

export function disableCollisionGuards(): void {
  setCollisionTestGuard2D(null);
  collisionGuardsEnabled = false;
}

// Installs opt-in diagnostics for invalid generic manifold inputs. Direct typed pair functions stay
// logger-free, and applications that omit this module shed both the message text and @flighthq/log.
export function enableCollisionGuards(): void {
  setCollisionTestGuard2D(warnOnInvalidCollisionShapes);
  collisionGuardsEnabled = true;
}

// Warns on the first shape the generic dispatcher cannot resolve a manifold for.
//
// All three warnable statuses are reported, including `'unsupported-shape-kind'`, which is the one
// worth the most: a degenerate or non-convex shape at least LOOKS wrong at the callsite, while an
// unrecognized kind — a vendor collider, or a `segment` or `point`, which are area-less by design —
// returns a silent `false` that is indistinguishable from two shapes genuinely not touching. A missed
// collision is the worst sentinel this package can hand back, and it used to be the only one the
// guard stayed quiet about.
function warnOnInvalidCollisionShapes(a: Readonly<CollisionShape2D>, b: Readonly<CollisionShape2D>): void {
  const statusA = getCollisionShapeValidationStatus2D(a);
  if (isWarnableCollisionStatus(statusA)) {
    warnOnInvalidCollisionShape({ kind: a.kind, overlapping: false, shapeIndex: 0, status: statusA });
    return;
  }
  const statusB = getCollisionShapeValidationStatus2D(b);
  if (isWarnableCollisionStatus(statusB)) {
    warnOnInvalidCollisionShape({ kind: b.kind, overlapping: false, shapeIndex: 1, status: statusB });
  }
}

// Whether a validation status names a shape the dispatcher will refuse. `null` is a usable shape, and
// the two result statuses — `'overlapping'` and `'separated'` — describe an answer rather than an input,
// so neither reaches this seam.
function isWarnableCollisionStatus(
  status: CollisionTestStatus | null,
): status is 'degenerate-shape' | 'non-convex-polygon' | 'unsupported-shape-kind' {
  return status === 'degenerate-shape' || status === 'non-convex-polygon' || status === 'unsupported-shape-kind';
}

function warnOnInvalidCollisionShape(explanation: Readonly<CollisionTestExplanation2D>): void {
  const message = collisionGuardMessages[explanation.status] ?? collisionGuardMessages['degenerate-shape'];
  logOnce(
    `collision:${explanation.status}:${explanation.shapeIndex}:${explanation.kind}`,
    LogLevel.Warn,
    {
      kind: explanation.kind,
      message,
      shapeIndex: explanation.shapeIndex,
      status: explanation.status,
    },
    'collision',
  );
}

// One message per refusable status, each naming the explain seam and the repair rather than only the
// fault. A warning a caller cannot act on is noise.
const collisionGuardMessages: Partial<Record<CollisionTestStatus, string>> = {
  'degenerate-shape':
    'testCollision2D: a shape is degenerate and cannot produce a manifold — call explainCollisionTest2D(a, b) and replace the reported shape with a finite positive-area collider.',
  'non-convex-polygon':
    'testCollision2D: a polygon is non-convex and cannot produce a supported manifold — call explainCollisionTest2D(a, b) and replace the reported shape with a convex polygon.',
  'unsupported-shape-kind':
    'testCollision2D: a shape kind has no manifold path and was reported as not overlapping — call explainCollisionTest2D(a, b) for the kind. Segments and points are area-less by design and answer the boolean testSegment*Collision and getCollisionShapeContainsPoint2D lanes instead.',
};

let collisionGuardsEnabled = false;
