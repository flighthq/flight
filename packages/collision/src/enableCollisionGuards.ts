import { logOnce } from '@flighthq/log/contract';
import type { CollisionShape2D, CollisionTestExplanation2D } from '@flighthq/types/contract';
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

function warnOnInvalidCollisionShapes(a: Readonly<CollisionShape2D>, b: Readonly<CollisionShape2D>): void {
  const statusA = getCollisionShapeValidationStatus2D(a);
  if (statusA === 'degenerate-shape' || statusA === 'non-convex-polygon') {
    warnOnInvalidCollisionShape({ kind: a.kind, overlapping: false, shapeIndex: 0, status: statusA });
    return;
  }
  const statusB = getCollisionShapeValidationStatus2D(b);
  if (statusB === 'degenerate-shape' || statusB === 'non-convex-polygon') {
    warnOnInvalidCollisionShape({ kind: b.kind, overlapping: false, shapeIndex: 1, status: statusB });
  }
}

function warnOnInvalidCollisionShape(explanation: Readonly<CollisionTestExplanation2D>): void {
  const message =
    explanation.status === 'non-convex-polygon'
      ? 'testCollision2D: a polygon is non-convex and cannot produce a supported manifold — call explainCollisionTest2D(a, b) and replace the reported shape with a convex polygon.'
      : 'testCollision2D: a shape is degenerate and cannot produce a manifold — call explainCollisionTest2D(a, b) and replace the reported shape with a finite positive-area collider.';
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

let collisionGuardsEnabled = false;
