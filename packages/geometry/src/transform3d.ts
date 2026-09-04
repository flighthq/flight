import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  Matrix4Like,
  Quaternion,
  Transform3D,
  Transform3DLike,
  Vector3,
} from '@flighthq/types/contract';

import { composeMatrix4, decomposeMatrix4 } from './matrix4';
import { createQuaternion } from './quaternion';
import { createVector3 } from './vector3';

// Composes a carrier's translation/rotation/scale into `out`. Canonical and lossless (TRS -> matrix).
export function composeMatrix4FromTransform3D(out: Matrix4Like, source: Readonly<Transform3DLike>): void {
  composeMatrix4(out, source.position, source.rotation, source.scale);
}

// Allocates a decomposed 3D transform carrier. Defaults are the identity transform (no translation,
// identity rotation, unit scale). The nested translation/rotation/scale are freshly allocated entities.
export function createTransform3D(): Transform3D {
  const position = createVector3();
  const rotation = createQuaternion();
  const scale = createVector3(1, 1, 1);
  const out = allocateEntity<Transform3D>();
  initializeTransform3D(out, position, rotation, scale);
  return finishEntity(out);
}

// Decomposes `m` into a carrier's translation/rotation/scale. Best-effort: lossy on shear, since a
// general affine's shear cannot be represented by quaternion-TRS.
export function decomposeMatrix4ToTransform3D(out: Transform3DLike, m: Readonly<Matrix4Like>): void {
  decomposeMatrix4(out.position, out.rotation, out.scale, m);
}

export function initializeTransform3D(
  out: EntityConstruction<Transform3D>,
  position: Vector3,
  rotation: Quaternion,
  scale: Vector3,
): void {
  out.position = position;
  out.rotation = rotation;
  out.scale = scale;
}
