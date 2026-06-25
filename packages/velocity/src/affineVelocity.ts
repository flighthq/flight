import { copyMatrix, createMatrix } from '@flighthq/geometry';
import {
  ensureNodeWorldTransformMatrix,
  getNodeChildAt,
  getNodeChildCount,
  getNodeWorldTransformMatrix,
} from '@flighthq/node';
import type { Transform2DNode, Velocity2D, VelocityField, VelocitySample } from '@flighthq/types';

import { ensureVelocitySample } from './velocityField';

// Affine velocity contributor: walks `root`'s subtree and uses the stored `previousWorldTransform` to
// derive per-pixel-correct velocity for rotating and scaling nodes. For a point p in local space, the
// screen-space velocity is `current·p − previous·p` — a full affine reprojection, not just tx/ty delta.
// For purely translating nodes the result is equivalent to contributeTransformVelocity.
//
// Nodes an explicit contributor already set this frame (explicitFrameId === frameId) keep their velocity
// but still have their previousWorldTransform updated. Run once per frame after beginVelocityFrame.
// Velocity is in node units; a producer scales by the render pixel ratio.
export function contributeAffineVelocity<Traits extends object>(
  field: VelocityField,
  root: Readonly<Transform2DNode<Traits>>,
): void {
  visitAffineVelocity(field, root);
}

// Returns the per-pixel screen-space velocity at local-space point (`pointX`, `pointY`) by computing
// `current·p − previous·p` using the sample's stored previousWorldTransform and the node's current world
// transform. Writes the result into `out`. Returns zero when the sample has no previous transform.
//
// Use when the full affine delta (rotation + scale) at a specific point is needed, such as when writing
// a per-pixel velocity buffer from a screen-space fragment shader.
export function getVelocitySampleAt(
  sample: Readonly<VelocitySample>,
  currentWorldTransform: Readonly<{
    a: number;
    b: number;
    c: number;
    d: number;
    tx: number;
    ty: number;
  }>,
  pointX: number,
  pointY: number,
  out: Velocity2D,
): Velocity2D {
  if (sample.previousWorldTransform === null) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  // Read both transforms into locals before writing out (alias safety, though out is Velocity2D here).
  const cx = currentWorldTransform.a * pointX + currentWorldTransform.c * pointY + currentWorldTransform.tx;
  const cy = currentWorldTransform.b * pointX + currentWorldTransform.d * pointY + currentWorldTransform.ty;
  const px =
    sample.previousWorldTransform.a * pointX +
    sample.previousWorldTransform.c * pointY +
    sample.previousWorldTransform.tx;
  const py =
    sample.previousWorldTransform.b * pointX +
    sample.previousWorldTransform.d * pointY +
    sample.previousWorldTransform.ty;
  out.x = cx - px;
  out.y = cy - py;
  return out;
}

function visitAffineVelocity<Traits extends object>(
  field: VelocityField,
  node: Readonly<Transform2DNode<Traits>>,
): void {
  const mutableNode = node as Transform2DNode<Traits>;
  ensureNodeWorldTransformMatrix(mutableNode);
  const world = getNodeWorldTransformMatrix(mutableNode);
  const sample = ensureVelocitySample(field, node);

  if (sample.explicitFrameId !== field.frameId) {
    if (sample.previousWorldTransform !== null) {
      // Derive velocity from the affine delta at the node's own origin (0,0 in local space).
      // This is equivalent to tx/ty delta for translation-only nodes, but correct for rotation/scale.
      const cx = world.tx;
      const cy = world.ty;
      const px = sample.previousWorldTransform.tx;
      const py = sample.previousWorldTransform.ty;
      sample.velocity.x = cx - px;
      sample.velocity.y = cy - py;
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
    if (child !== null) visitAffineVelocity(field, child as unknown as Readonly<Transform2DNode<Traits>>);
  }
}
