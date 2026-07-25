import { createEntity } from '@flighthq/entity';
import { inverseMatrix, multiplyMatrix } from '@flighthq/geometry';
import { DEG_TO_RAD } from '@flighthq/math';
import type { Bone2D, MatrixLike, Skeleton2D } from '@flighthq/types';
import { TransformMode2D } from '@flighthq/types';

// 6 floats per bone in the flat 2×3 affine buffers (a, b, c, d, tx, ty), matching the Matrix field order.
const MATRIX_STRIDE = 6;

// Deep-copies the bone array (each Bone2D cloned) and the transform buffers, producing an independently
// posable skeleton. Slots and their attachments are SHARED (attachments are immutable setup data); use a
// skin/slot editing layer for per-instance attachment swaps.
export function cloneSkeleton2D(skeleton: Readonly<Skeleton2D>): Skeleton2D {
  return createEntity({
    boneMatrices: skeleton.boneMatrices.slice(),
    bones: skeleton.bones.map((bone) => ({ ...bone })),
    inverseBindMatrices: skeleton.inverseBindMatrices.slice(),
    slots:
      skeleton.slots === null || skeleton.slots === undefined ? skeleton.slots : skeleton.slots.map((s) => ({ ...s })),
    worldMatrices: skeleton.worldMatrices.slice(),
  });
}

// Fills the skin palette `boneMatrices[i] = worldMatrices[i] × inverseBindMatrices[i]` — the matrix that
// takes a bind-pose (setup) mesh vertex to its posed position. Call after `computeSkeleton2DWorldTransforms`
// and once `setSkeleton2DBindPose` has captured the inverse-bind. Out-parameter (writes `boneMatrices`),
// allocation-free (module scratch).
export function computeSkeleton2DBoneMatrices(skeleton: Readonly<Skeleton2D>): void {
  const world = skeleton.worldMatrices;
  const invBind = skeleton.inverseBindMatrices;
  const out = skeleton.boneMatrices;
  const count = skeleton.bones.length;
  for (let i = 0; i < count; i++) {
    const o = i * MATRIX_STRIDE;
    readMatrix(_scratchA, world, o);
    readMatrix(_scratchB, invBind, o);
    multiplyMatrix(_scratchC, _scratchA, _scratchB);
    writeMatrix(out, o, _scratchC);
  }
}

// Propagates each bone's world transform from its local setup transform (x/y/rotation/scale/shear) and its
// parent's world transform, honoring the bone's inherit mode. One linear pass over the parent-before-child
// ordered array (`worldMatrices[i]` reads `worldMatrices[parentIndex]`, already written). Out-parameter,
// allocation-free. Angles are converted degrees→radians at this seam. Position always inherits fully (the
// local origin is placed by the parent); the inherit mode only changes the linear (rotation/scale) part.
export function computeSkeleton2DWorldTransforms(skeleton: Readonly<Skeleton2D>): void {
  const bones = skeleton.bones;
  const world = skeleton.worldMatrices;
  const count = bones.length;
  for (let i = 0; i < count; i++) {
    const bone = bones[i];
    // Local linear part (Spine bone matrix, transposed b↔c into Flight's x'=a·x+c·y convention):
    // a=cos(rot+shearX)·scaleX, b=sin(rot+shearX)·scaleX, c=cos(rot+90°+shearY)·scaleY, d=sin(…)·scaleY.
    const rotX = (bone.rotation + bone.shearX) * DEG_TO_RAD;
    const rotY = (bone.rotation + 90 + bone.shearY) * DEG_TO_RAD;
    const la = Math.cos(rotX) * bone.scaleX;
    const lb = Math.sin(rotX) * bone.scaleX;
    const lc = Math.cos(rotY) * bone.scaleY;
    const ld = Math.sin(rotY) * bone.scaleY;
    const o = i * MATRIX_STRIDE;
    if (bone.parentIndex < 0) {
      world[o] = la;
      world[o + 1] = lb;
      world[o + 2] = lc;
      world[o + 3] = ld;
      world[o + 4] = bone.x;
      world[o + 5] = bone.y;
      continue;
    }
    const p = bone.parentIndex * MATRIX_STRIDE;
    const pa = world[p];
    const pb = world[p + 1];
    const pc = world[p + 2];
    const pd = world[p + 3];
    // Local origin placed by the parent — the same for every inherit mode.
    world[o + 4] = pa * bone.x + pc * bone.y + world[p + 4];
    world[o + 5] = pb * bone.x + pd * bone.y + world[p + 5];
    switch (bone.transformMode) {
      case TransformMode2D.OnlyTranslation:
        // Rotation/scale come from the bone's own local transform; only position inherits (set above).
        world[o] = la;
        world[o + 1] = lb;
        world[o + 2] = lc;
        world[o + 3] = ld;
        break;
      case TransformMode2D.NoRotationOrReflection: {
        // Inherit the parent's SCALE (its column lengths) but strip rotation + reflection: compose the
        // local transform with a diagonal, axis-aligned scale-only parent.
        const psx = Math.hypot(pa, pb);
        const psy = Math.hypot(pc, pd);
        world[o] = psx * la;
        world[o + 1] = psy * lb;
        world[o + 2] = psx * lc;
        world[o + 3] = psy * ld;
        break;
      }
      case TransformMode2D.NoScale:
      case TransformMode2D.NoScaleOrReflection: {
        // Inherit the parent's ORIENTATION but not its scale: normalize the parent's columns to unit
        // length, then compose with the local transform. NoScale keeps the parent's reflection (its
        // normalized columns as-is); NoScaleOrReflection strips it, forcing the y-axis to the +90°
        // rotation of the x-axis (det = +1) so the child never flips under a negatively-scaled parent.
        const psx = Math.hypot(pa, pb) || 1;
        const nax = pa / psx;
        const nay = pb / psx;
        let ncx: number;
        let ncy: number;
        if (bone.transformMode === TransformMode2D.NoScaleOrReflection) {
          ncx = -nay;
          ncy = nax;
        } else {
          const psy = Math.hypot(pc, pd) || 1;
          ncx = pc / psy;
          ncy = pd / psy;
        }
        world[o] = nax * la + ncx * lb;
        world[o + 1] = nay * la + ncy * lb;
        world[o + 2] = nax * lc + ncx * ld;
        world[o + 3] = nay * lc + ncy * ld;
        break;
      }
      default:
        // Normal: full inherit — world linear part = parent × local.
        world[o] = pa * la + pc * lb;
        world[o + 1] = pb * la + pd * lb;
        world[o + 2] = pa * lc + pc * ld;
        world[o + 3] = pb * lc + pd * ld;
        break;
    }
  }
}

// Allocates a Skeleton2D from a parent-before-child ordered bone array. Sizes the flat world/inverse-bind/
// palette buffers to the bone count. `computeSkeleton2DWorldTransforms` fills `worldMatrices`;
// `setSkeleton2DBindPose` captures `inverseBindMatrices`; `computeSkeleton2DBoneMatrices` fills the palette.
// Pass `slots` for a drawable skeleton (null for a pure bone rig). Bones must be topologically ordered
// (each bone's `parentIndex` < its own index); `validateSkeleton2D` checks this.
export function createSkeleton2D(bones: Bone2D[], slots: Skeleton2D['slots'] = null): Skeleton2D {
  const count = bones.length;
  return createEntity({
    boneMatrices: new Float32Array(count * MATRIX_STRIDE),
    bones,
    inverseBindMatrices: new Float32Array(count * MATRIX_STRIDE),
    slots,
    worldMatrices: new Float32Array(count * MATRIX_STRIDE),
  });
}

// Detaches bones/slots so the skeleton is GC-eligible. `dispose*` (not `destroy*`): a Skeleton2D owns no
// GPU or native resource — its buffers are plain GC memory — so this only clears references.
export function disposeSkeleton2D(skeleton: Skeleton2D): void {
  skeleton.bones = [];
  skeleton.slots = null;
}

export function equalsSkeleton2D(a: Readonly<Skeleton2D>, b: Readonly<Skeleton2D>): boolean {
  if (a === b) return true;
  if (a.bones.length !== b.bones.length) return false;
  for (let i = 0; i < a.bones.length; i++) {
    const x = a.bones[i];
    const y = b.bones[i];
    if (
      x.parentIndex !== y.parentIndex ||
      x.x !== y.x ||
      x.y !== y.y ||
      x.rotation !== y.rotation ||
      x.scaleX !== y.scaleX ||
      x.scaleY !== y.scaleY ||
      x.shearX !== y.shearX ||
      x.shearY !== y.shearY ||
      x.length !== y.length ||
      x.transformMode !== y.transformMode
    ) {
      return false;
    }
  }
  return true;
}

// Returns the index of the bone named `name`, or the sentinel -1 when no bone has that name.
export function getSkeleton2DBoneIndexByName(skeleton: Readonly<Skeleton2D>, name: string): number {
  const bones = skeleton.bones;
  for (let i = 0; i < bones.length; i++) {
    if (bones[i].name === name) return i;
  }
  return -1;
}

// Writes bone `boneIndex`'s world transform into `out`, returning true; returns the sentinel false (leaving
// `out` untouched) when `boneIndex` is out of range. Requires `computeSkeleton2DWorldTransforms` to have run.
export function getSkeleton2DBoneWorldMatrix(
  out: MatrixLike,
  skeleton: Readonly<Skeleton2D>,
  boneIndex: number,
): boolean {
  if (boneIndex < 0 || boneIndex >= skeleton.bones.length) return false;
  readMatrix(out, skeleton.worldMatrices, boneIndex * MATRIX_STRIDE);
  return true;
}

// Captures the current world transforms as the bind (setup) pose: `inverseBindMatrices[i] =
// inverse(worldMatrices[i])`. Call after posing the bones to setup and running
// `computeSkeleton2DWorldTransforms`. A non-invertible (degenerate, zero-scale) bone leaves its
// inverse-bind at identity (`inverseMatrix` returns false) rather than producing NaNs.
export function setSkeleton2DBindPose(skeleton: Readonly<Skeleton2D>): void {
  const world = skeleton.worldMatrices;
  const out = skeleton.inverseBindMatrices;
  const count = skeleton.bones.length;
  for (let i = 0; i < count; i++) {
    const o = i * MATRIX_STRIDE;
    readMatrix(_scratchA, world, o);
    if (!inverseMatrix(_scratchB, _scratchA)) setMatrixIdentityLocal(_scratchB);
    writeMatrix(out, o, _scratchB);
  }
}

// Checks the parent-before-child ordering invariant (each bone's parentIndex is -1 or < its own index) and
// buffer sizing. Returns null when valid, or a message describing the first violation (sentinel over throw).
export function validateSkeleton2D(skeleton: Readonly<Skeleton2D>): string | null {
  const count = skeleton.bones.length;
  const expected = count * MATRIX_STRIDE;
  if (skeleton.worldMatrices.length !== expected)
    return `worldMatrices length ${skeleton.worldMatrices.length} != ${expected}`;
  if (skeleton.inverseBindMatrices.length !== expected) {
    return `inverseBindMatrices length ${skeleton.inverseBindMatrices.length} != ${expected}`;
  }
  if (skeleton.boneMatrices.length !== expected)
    return `boneMatrices length ${skeleton.boneMatrices.length} != ${expected}`;
  for (let i = 0; i < count; i++) {
    const parentIndex = skeleton.bones[i].parentIndex;
    if (parentIndex >= i)
      return `bone ${i} parentIndex ${parentIndex} is not < its own index (bones must be parent-before-child ordered)`;
    if (parentIndex < -1) return `bone ${i} parentIndex ${parentIndex} < -1`;
  }
  return null;
}

function readMatrix(out: MatrixLike, buffer: Readonly<Float32Array>, offset: number): void {
  out.a = buffer[offset];
  out.b = buffer[offset + 1];
  out.c = buffer[offset + 2];
  out.d = buffer[offset + 3];
  out.tx = buffer[offset + 4];
  out.ty = buffer[offset + 5];
}

function setMatrixIdentityLocal(out: MatrixLike): void {
  out.a = 1;
  out.b = 0;
  out.c = 0;
  out.d = 1;
  out.tx = 0;
  out.ty = 0;
}

function writeMatrix(buffer: Float32Array, offset: number, source: Readonly<MatrixLike>): void {
  buffer[offset] = source.a;
  buffer[offset + 1] = source.b;
  buffer[offset + 2] = source.c;
  buffer[offset + 3] = source.d;
  buffer[offset + 4] = source.tx;
  buffer[offset + 5] = source.ty;
}

const _scratchA: MatrixLike = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const _scratchB: MatrixLike = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const _scratchC: MatrixLike = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
