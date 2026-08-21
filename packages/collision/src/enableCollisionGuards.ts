import { logOnce } from '@flighthq/log/contract';
import type {
  CollisionShape2D,
  CollisionShape3D,
  CollisionTestExplanation2D,
  CollisionTestExplanation3D,
  CollisionTestStatus,
} from '@flighthq/types/contract';
import { LogLevel } from '@flighthq/types/contract';

import { getCollisionShapeValidationStatus2D } from './collisionShapeValidation2D';
import { getCollisionShapeValidationStatus3D } from './collisionShapeValidation3D';
import { setCollisionTestGuard2D } from './testCollision2D';
import { setCollisionTestGuard3D } from './testCollision3D';

export function areCollisionGuardsEnabled(): boolean {
  return collisionGuardsEnabled;
}

export function disableCollisionGuards(): void {
  setCollisionTestGuard2D(null);
  setCollisionTestGuard3D(null);
  collisionGuardsEnabled = false;
}

// Installs opt-in diagnostics for invalid generic manifold inputs, in BOTH dimensions. Direct typed
// pair functions stay logger-free, and applications that omit this module shed both the message text
// and @flighthq/log.
//
// One switch covers 2D and 3D rather than a suffixed pair, because the thing being turned on is a
// diagnostic posture rather than a dimension-specific capability, and a caller who wanted warnings and
// got them for only half the package would have no way to notice. The two dispatchers keep separate
// guard slots underneath; only the caller-facing verb is shared.
export function enableCollisionGuards(): void {
  setCollisionTestGuard2D(warnOnInvalidCollisionShapes);
  setCollisionTestGuard3D(warnOnInvalidCollisionShapes3D);
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
    warnOnInvalidCollisionShape({ kind: a.kind, overlapping: false, shapeIndex: 0, status: statusA }, '2D');
    return;
  }
  const statusB = getCollisionShapeValidationStatus2D(b);
  if (isWarnableCollisionStatus(statusB)) {
    warnOnInvalidCollisionShape({ kind: b.kind, overlapping: false, shapeIndex: 1, status: statusB }, '2D');
  }
}

// The 3D twin. It reports one status fewer than the 2D form, because `'non-convex-polygon'` cannot
// arise in 3D at all — a convex hull is reached only through its support scan, which never returns an
// interior vertex. See `getCollisionShapeValidationStatus3D`.
function warnOnInvalidCollisionShapes3D(a: Readonly<CollisionShape3D>, b: Readonly<CollisionShape3D>): void {
  const statusA = getCollisionShapeValidationStatus3D(a);
  if (isWarnableCollisionStatus(statusA)) {
    warnOnInvalidCollisionShape({ kind: a.kind, overlapping: false, shapeIndex: 0, status: statusA }, '3D');
    return;
  }
  const statusB = getCollisionShapeValidationStatus3D(b);
  if (isWarnableCollisionStatus(statusB)) {
    warnOnInvalidCollisionShape({ kind: b.kind, overlapping: false, shapeIndex: 1, status: statusB }, '3D');
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

// The dimension is carried in the log key as well as the message, so a caller running both 2D and 3D
// worlds does not have one dimension's first warning suppress the other's.
function warnOnInvalidCollisionShape(
  explanation: Readonly<CollisionTestExplanation2D | CollisionTestExplanation3D>,
  dimension: '2D' | '3D',
): void {
  const messages = dimension === '2D' ? collisionGuardMessages : collisionGuardMessages3D;
  const message = messages[explanation.status] ?? messages['degenerate-shape'];
  logOnce(
    `collision:${dimension}:${explanation.status}:${explanation.shapeIndex}:${explanation.kind}`,
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

// The 3D messages, and the `unsupported-shape-kind` one is the most valuable warning this package
// emits. Unlike 2D, where segments and points are area-less kinds a caller chose deliberately, the
// overwhelmingly likely cause in 3D is that NOTHING was ever registered: nothing registers at module
// load, so a world that never called `registerBuiltInCollisionSupports3D` reports every pair as not
// overlapping and its bodies fall through its floors in silence.
//
// There is no `non-convex-polygon` entry, because no 3D validation path can produce that status.
const collisionGuardMessages3D: Partial<Record<CollisionTestStatus, string>> = {
  'degenerate-shape':
    'testCollision3D: a shape is degenerate and cannot produce a manifold — call explainCollisionTest3D(a, b) and replace the reported shape with a finite collider of positive extent.',
  'unsupported-shape-kind':
    'testCollision3D: a shape kind has no registered support function and was reported as not overlapping — call registerBuiltInCollisionSupports3D() once at startup, or registerCollisionSupport3D(kind, support) for a vendor kind. Call explainCollisionTest3D(a, b) for which shape it was.',
};

let collisionGuardsEnabled = false;
