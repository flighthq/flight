import { allocateEntity } from '@flighthq/entity/contract';
import { RAD_TO_DEG } from '@flighthq/math/contract';
import { getPathLength, getPathPositionAtDistance } from '@flighthq/path/contract';
import type {
  EntityConstruction,
  Path,
  PathAttachment2D,
  Skeleton2D,
  Skeleton2DConstraint,
  Skeleton2DPathConstraint,
} from '@flighthq/types/contract';
import {
  PathAttachment2DKind,
  Skeleton2DConstraintKind,
  Skeleton2DPathPositionMode,
  Skeleton2DPathRotateMode,
  Skeleton2DPathSpacingMode,
} from '@flighthq/types/contract';

import { deformSkeleton2DPathAttachment } from './deformPathAttachment2D';
import { computeSkeleton2DBoneWorldTransform } from './skeleton2d';
import { registerSkeleton2DConstraintSolver } from './skeleton2dConstraint';

// 6 floats per bone in the flat world-transform buffer (a, b, c, d, tx, ty).
const MATRIX_STRIDE = 6;

function assignPathFields(
  out: EntityConstruction<Path>,
  commands: number[],
  data: number[],
  winding: Path['winding'],
): void {
  out.commands = commands;
  out.data = data;
  out.winding = winding;
}

// Opts a bundle into path constraints. This is the only module in skeleton2d that reaches for
// `@flighthq/path`, and a consumer that never calls this registrar never imports it — measured, not
// assumed: a rig bundle importing skeleton2d and nothing path-related is byte-identical (2051 gzip bytes)
// with and without this module and its package edge present. A package.json edge is a RESOLUTION fact, not
// a bundle fact, which is why path constraints live here beside the other solvers rather than in a
// separate cell.
export function registerSkeleton2DPathConstraintSolver(): void {
  registerSkeleton2DConstraintSolver(Skeleton2DConstraintKind.Path, solveSkeleton2DPathConstraint);
}

// Lays a bone chain along the path attached to the constraint's target slot, writing bone LOCAL
// transforms and refreshing each bone it moves. Descendants are left for the caller's world pass.
//
// The path is deformed into world space first, through the same deformer the display layer uses, so the
// bones follow the path AS POSED rather than as authored — a path that is itself skinned to bones drags
// the chain with it, which is the whole point of attaching one to a slot.
//
// A missing slot, a non-path attachment, or a zero-length path is skipped: a rig carrying a constraint
// whose target is not currently wearing a path is an expected state, not an error.
export function solveSkeleton2DPathConstraint(skeleton: Skeleton2D, constraint: Readonly<Skeleton2DConstraint>): void {
  const pathConstraint = constraint as Readonly<Skeleton2DPathConstraint>;
  const attachment = resolveSkeleton2DPathAttachment(skeleton, pathConstraint.targetSlotIndex);
  if (attachment === null) return;
  const slot = skeleton.slots![pathConstraint.targetSlotIndex];

  deformSkeleton2DPathAttachment(_path, attachment, skeleton, slot.boneIndex);
  const total = getPathLength(_path);
  if (!(total > 0)) return;

  const bones = skeleton.bones;
  const chain = pathConstraint.boneIndices;
  const mix = pathConstraint.mix;
  const rotateMix = pathConstraint.mixRotate * mix;
  const translateXMix = pathConstraint.mixX * mix;
  const translateYMix = pathConstraint.mixY * mix;

  let distance =
    pathConstraint.positionMode === Skeleton2DPathPositionMode.Percent
      ? pathConstraint.position * total
      : pathConstraint.position;

  // Chain rotation needs the NEXT bone's position, so every position is sampled before any bone moves.
  // Sampling and writing in one pass would have each bone aim at a sibling that had already been
  // displaced, which bends the chain progressively rather than laying it along the path.
  const count = chain.length;
  if (count === 0) return;
  ensureSkeleton2DPathScratch(count);
  for (let i = 0; i < count; i++) {
    const boneIndex = chain[i];
    getPathPositionAtDistance(_path, clampSkeleton2DPathDistance(distance, total), _point, _tangent);
    _positions[i * 2] = _point.x;
    _positions[i * 2 + 1] = _point.y;
    _tangents[i * 2] = _tangent.x;
    _tangents[i * 2 + 1] = _tangent.y;
    distance += resolveSkeleton2DPathSpacing(
      pathConstraint,
      boneIndex >= 0 && boneIndex < bones.length ? bones[boneIndex].length : 0,
      total,
    );
  }

  for (let i = 0; i < count; i++) {
    const boneIndex = chain[i];
    if (boneIndex < 0 || boneIndex >= bones.length) continue;
    const bone = bones[boneIndex];
    const o = boneIndex * MATRIX_STRIDE;

    if (translateXMix !== 0 || translateYMix !== 0) {
      const wantedX = world(skeleton, o + 4) + (_positions[i * 2] - world(skeleton, o + 4)) * translateXMix;
      const wantedY = world(skeleton, o + 5) + (_positions[i * 2 + 1] - world(skeleton, o + 5)) * translateYMix;
      const local = toSkeleton2DParentSpace(skeleton, boneIndex, wantedX, wantedY);
      if (local !== null) {
        bone.x = local.x;
        bone.y = local.y;
      }
      computeSkeleton2DBoneWorldTransform(skeleton, boneIndex);
    }

    if (rotateMix !== 0) {
      // Tangent follows the path's own direction; Chain aims at where the next bone was sampled, and the
      // last bone of a chain has no next, so it falls back to the tangent rather than keeping a stale angle.
      let dirX: number;
      let dirY: number;
      if (pathConstraint.rotateMode === Skeleton2DPathRotateMode.Chain && i + 1 < count) {
        dirX = _positions[(i + 1) * 2] - _positions[i * 2];
        dirY = _positions[(i + 1) * 2 + 1] - _positions[i * 2 + 1];
        if (dirX === 0 && dirY === 0) {
          dirX = _tangents[i * 2];
          dirY = _tangents[i * 2 + 1];
        }
      } else {
        dirX = _tangents[i * 2];
        dirY = _tangents[i * 2 + 1];
      }
      const current = Math.atan2(world(skeleton, o + 1), world(skeleton, o)) * RAD_TO_DEG;
      const wanted = Math.atan2(dirY, dirX) * RAD_TO_DEG;
      bone.rotation += wrapSkeleton2DAngle(wanted - current) * rotateMix;
      computeSkeleton2DBoneWorldTransform(skeleton, boneIndex);
    }
  }
}

// Grows the sample buffers to fit a chain, reusing them across calls so a per-frame solve allocates
// nothing once the longest chain in the rig has been seen.
function ensureSkeleton2DPathScratch(count: number): void {
  if (_positions.length >= count * 2) return;
  _positions = new Float64Array(count * 2);
  _tangents = new Float64Array(count * 2);
}

// Clamps rather than wraps: a chain that runs off the end of an open path piles up at the endpoint, which
// is what a real linkage does, where wrapping would teleport its tail to the other end.
function clampSkeleton2DPathDistance(distance: number, total: number): number {
  return distance < 0 ? 0 : distance > total ? total : distance;
}

// The slot's attachment when it is a path, or null for a missing slot, an empty slot, or one wearing
// something else.
function resolveSkeleton2DPathAttachment(
  skeleton: Readonly<Skeleton2D>,
  slotIndex: number,
): Readonly<PathAttachment2D> | null {
  const slots = skeleton.slots;
  if (slots === undefined || slots === null) return null;
  if (slotIndex < 0 || slotIndex >= slots.length) return null;
  const attachment = slots[slotIndex].attachment;
  if (attachment === undefined || attachment === null) return null;
  return attachment.kind === PathAttachment2DKind ? (attachment as Readonly<PathAttachment2D>) : null;
}

function resolveSkeleton2DPathSpacing(
  constraint: Readonly<Skeleton2DPathConstraint>,
  boneLength: number,
  total: number,
): number {
  if (constraint.spacingMode === Skeleton2DPathSpacingMode.Percent) return constraint.spacing * total;
  if (constraint.spacingMode === Skeleton2DPathSpacingMode.Length) return constraint.spacing * boneLength;
  return constraint.spacing;
}

// A world point in the space a bone's local transform is expressed in — its parent's.
function toSkeleton2DParentSpace(
  skeleton: Readonly<Skeleton2D>,
  boneIndex: number,
  x: number,
  y: number,
): { x: number; y: number } | null {
  const parentIndex = skeleton.bones[boneIndex].parentIndex;
  if (parentIndex < 0) return { x, y };
  const matrices = skeleton.worldMatrices;
  const p = parentIndex * MATRIX_STRIDE;
  const a = matrices[p];
  const b = matrices[p + 1];
  const c = matrices[p + 2];
  const d = matrices[p + 3];
  const determinant = a * d - c * b;
  if (Math.abs(determinant) < MINIMUM_DETERMINANT) return null;
  const wx = x - matrices[p + 4];
  const wy = y - matrices[p + 5];
  return { x: (d * wx - c * wy) / determinant, y: (a * wy - b * wx) / determinant };
}

function world(skeleton: Readonly<Skeleton2D>, offset: number): number {
  return skeleton.worldMatrices[offset];
}

// The shortest signed way round from one angle to another, in degrees.
function wrapSkeleton2DAngle(degrees: number): number {
  let value = degrees % 360;
  if (value > 180) value -= 360;
  else if (value < -180) value += 360;
  return value;
}

const MINIMUM_DETERMINANT = 1e-9;
function createScratchPath(): Path {
  const out = allocateEntity<Path>();
  assignPathFields(out, [] as number[], [] as number[], 'nonZero');
  return out;
}
const _path = createScratchPath();
const _point = { x: 0, y: 0 };
const _tangent = { x: 0, y: 0 };
let _positions = new Float64Array(0);
let _tangents = new Float64Array(0);
