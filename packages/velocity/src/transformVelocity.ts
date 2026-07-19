import { copyMatrix, createMatrix } from '@flighthq/geometry';
import { ensureNodeWorldMatrix, getNodeChildAt, getNodeChildCount, getNodeWorldMatrix } from '@flighthq/node';
import type { Transform2DNode, VelocityField } from '@flighthq/types';

import { ensureVelocitySample } from './velocityField';

// The default velocity contributor. Walks `root`'s subtree top-down, deriving each node's screen-space
// velocity from the delta of its world transform since the previous frame, then commits the current world
// transform as the new previous. This is the "any transform is velocity" baseline — a tween, physics
// step, camera move, or manual edit all change world transforms and so produce velocity here for free.
//
// Nodes an explicit contributor already set this frame keep that velocity (their explicitFrameId matches),
// but still have their previous transform updated, so order relative to explicit contributors does not
// matter. Run once per frame after beginVelocityFrame. Velocity is in node units; a producer scales by
// the render pixel ratio.
export function contributeTransformVelocity<Traits extends object>(
  field: VelocityField,
  root: Readonly<Transform2DNode<Traits>>,
): void {
  visitTransformVelocity(field, root);
}

function visitTransformVelocity<Traits extends object>(
  field: VelocityField,
  node: Readonly<Transform2DNode<Traits>>,
): void {
  const mutableNode = node as Transform2DNode<Traits>;
  ensureNodeWorldMatrix(mutableNode);
  const world = getNodeWorldMatrix(mutableNode);
  const sample = ensureVelocitySample(field, node);

  if (sample.explicitFrameId !== field.frameId) {
    if (sample.previousWorldTransform !== null) {
      sample.velocity.x = world.tx - sample.previousWorldTransform.tx;
      sample.velocity.y = world.ty - sample.previousWorldTransform.ty;
    } else {
      sample.velocity.x = 0;
      sample.velocity.y = 0;
    }
    sample.lastFrameId = field.frameId;
  }

  if (sample.previousWorldTransform === null) sample.previousWorldTransform = createMatrix();
  copyMatrix(sample.previousWorldTransform, world);

  // Children of a transform node in a homogeneous display/sprite graph are themselves transform nodes;
  // the hierarchy type does not carry that, so the trait is asserted.
  const count = getNodeChildCount(mutableNode);
  for (let i = 0; i < count; i++) {
    const child = getNodeChildAt(mutableNode, i);
    if (child !== null) visitTransformVelocity(field, child as unknown as Readonly<Transform2DNode<Traits>>);
  }
}
