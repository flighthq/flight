// Generated from crates/flight-velocity/src/transform_velocity.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { copyMatrix, createMatrix } from '@flighthq/geometry/contract';
import { ensureNodeWorldMatrix, getNodeChildAt, getNodeChildCount, getNodeWorldMatrix } from '@flighthq/node/contract';
import type { NodeRef } from '@flighthq/node/contract';

import type { VelocityField } from './velocityStore.ts';
import { ensureNodeVelocitySample } from './velocityStore.ts';

/**
 * The default velocity contributor. Walks `root`'s subtree top-down, deriving each node's
 * screen-space velocity from the delta of its world transform since the previous frame, then
 * commits the current world transform as the new previous. This is the "any transform is
 * velocity" baseline: a tween, physics step, camera move, or manual edit all change world
 * transforms and so produce velocity here for free.
 *
 * Nodes an explicit contributor already set this frame keep that velocity (their
 * `explicitFrameId` matches), but still have their previous transform updated, so order
 * relative to explicit contributors does not matter. Run once per frame after
 * `beginVelocityFrame`. Velocity is in node units; a producer scales by the render pixel ratio.
 */
export function contributeTransformVelocity(field: VelocityField, root: Readonly<NodeRef>): void {
  visitTransformVelocity(field, root);
}

function visitTransformVelocity(field: VelocityField, node: Readonly<NodeRef>): void {
  ensureNodeWorldMatrix(node);
  const world = getNodeWorldMatrix(node);
  const frameId = field.frameId;
  const sample = ensureNodeVelocitySample(field, node);
  if (sample.explicitFrameId !== frameId) {
    if (sample.previousWorldTransform !== null) {
      const previous = sample.previousWorldTransform;
      sample.velocity.x = world.tx - previous.tx;
      sample.velocity.y = world.ty - previous.ty;
    } else {
      sample.velocity.x = 0.0;
      sample.velocity.y = 0.0;
    }
    sample.lastFrameId = frameId;
  }
  if (sample.previousWorldTransform === null) {
    sample.previousWorldTransform = createMatrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0);
  }
  if (sample.previousWorldTransform !== null) {
    const previous = sample.previousWorldTransform;
    copyMatrix(previous, world);
  }
  const count = getNodeChildCount(node);
  for (let i = 0; i < count; i += 1) {
    if (getNodeChildAt(node, i | 0) !== null) {
      const child = getNodeChildAt(node, i | 0);
      visitTransformVelocity(field, child);
    }
  }
}
