import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { inverseMatrix, multiplyMatrix } from '@flighthq/geometry/contract';
import { DEG_TO_RAD } from '@flighthq/math/contract';
import type { AttachmentSkin2D, Bone2D, MatrixLike, Skeleton2D } from '@flighthq/types/contract';

// 6 floats per bone in the flat 2×3 affine buffers (a, b, c, d, tx, ty), matching the Matrix field order.
const MATRIX_STRIDE = 6;

// Deep-copies the bone array (each Bone2D cloned) and the transform buffers, producing an independently
// posable skeleton. Slots and their attachments are SHARED (attachments are immutable setup data); use a
// skin/slot editing layer for per-instance attachment swaps.
export function cloneSkeleton2D(skeleton: Readonly<Skeleton2D>): Skeleton2D {
  const out = allocateEntity<Skeleton2D>();
  out.boneMatrices = skeleton.boneMatrices.slice();
  out.bones = skeleton.bones.map((bone) => ({ ...bone }));
  out.inverseBindMatrices = skeleton.inverseBindMatrices.slice();
  out.skins = skeleton.skins;
  out.slots =
    skeleton.slots === null || skeleton.slots === undefined ? skeleton.slots : skeleton.slots.map((s) => ({ ...s }));
  out.worldMatrices = skeleton.worldMatrices.slice();
  return finishEntity(out);
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

// One bone's world transform, from its local setup transform and its parent's already-computed world
// matrix. This is the primitive `computeSkeleton2DWorldTransforms` is a linear pass over, exported because
// a constraint solver needs exactly it: having written a bone's local rotation, it refreshes that one bone
// rather than re-walking the skeleton. The parent must already be current, which the parent-before-child
// bone order guarantees for the full pass and which a solver working up a chain has to respect itself.
export function computeSkeleton2DBoneWorldTransform(skeleton: Readonly<Skeleton2D>, boneIndex: number): void {
  const bones = skeleton.bones;
  const world = skeleton.worldMatrices;
  if (boneIndex < 0 || boneIndex >= bones.length) return;
  {
    const i = boneIndex;
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
      return;
    }
    const p = bone.parentIndex * MATRIX_STRIDE;
    const pa = world[p];
    const pb = world[p + 1];
    const pc = world[p + 2];
    const pd = world[p + 3];
    const inherit = bone.transformMode;
    // Position: the parent places the bone's local origin — unless translation inheritance is stripped, in
    // which case the bone's local (x, y) is its world position directly.
    if (inherit.translation) {
      world[o + 4] = pa * bone.x + pc * bone.y + world[p + 4];
      world[o + 5] = pb * bone.x + pd * bone.y + world[p + 5];
    } else {
      world[o + 4] = bone.x;
      world[o + 5] = bone.y;
    }
    // Linear part: rotation, scale, and reflection are each inherited or stripped independently. When all
    // three are inherited (Normal — the common case) it is the fast path: the raw parent columns × local,
    // no decomposition. Otherwise the parent is decomposed into per-column scale (lengths) and a direction
    // basis, each axis kept or replaced per its flag, recomposed, then × local. Reproduces the five presets
    // exactly (NoScale keeps the parent's actual y-column, preserving shear; NoScaleOrReflection forces the
    // y-axis to the +90° perpendicular of the x-axis, det +1, dropping shear and reflection).
    let ea: number;
    let eb: number;
    let ec: number;
    let ed: number;
    if (inherit.rotation && inherit.scale && inherit.reflection) {
      ea = pa;
      eb = pb;
      ec = pc;
      ed = pd;
    } else {
      const psx = Math.hypot(pa, pb) || 1;
      const psy = Math.hypot(pc, pd) || 1;
      const d0x = inherit.rotation ? pa / psx : 1;
      const d0y = inherit.rotation ? pb / psx : 0;
      let d1x: number;
      let d1y: number;
      if (inherit.rotation && inherit.reflection) {
        d1x = pc / psy;
        d1y = pd / psy;
      } else if (inherit.rotation) {
        d1x = -d0y;
        d1y = d0x;
      } else {
        d1x = 0;
        d1y = inherit.reflection && pa * pd - pb * pc < 0 ? -1 : 1;
      }
      const sx = inherit.scale ? psx : 1;
      const sy = inherit.scale ? psy : 1;
      ea = d0x * sx;
      eb = d0y * sx;
      ec = d1x * sy;
      ed = d1y * sy;
    }
    world[o] = ea * la + ec * lb;
    world[o + 1] = eb * la + ed * lb;
    world[o + 2] = ea * lc + ec * ld;
    world[o + 3] = eb * lc + ed * ld;
  }
}

// Propagates each bone's world transform from its local setup transform (x/y/rotation/scale/shear) and its
// parent's world transform, honoring the bone's inherit mode. One linear pass over the parent-before-child
// ordered array (`worldMatrices[i]` reads `worldMatrices[parentIndex]`, already written). Out-parameter,
// allocation-free. Angles are converted degrees→radians at this seam. All four inherit axes are honored
// here, translation included: a bone whose `transformMode.translation` is false takes its local (x, y) as
// its world position outright rather than being placed by its parent. Every `TransformMode2D` preset
// inherits translation, so reaching that branch means a hand-built `TransformInherit2D`, which `Bone2D`
// admits by design.
export function computeSkeleton2DWorldTransforms(skeleton: Readonly<Skeleton2D>): void {
  const count = skeleton.bones.length;
  for (let i = 0; i < count; i++) computeSkeleton2DBoneWorldTransform(skeleton, i);
}

// Allocates a Skeleton2D from a parent-before-child ordered bone array. Sizes the flat world/inverse-bind/
// palette buffers to the bone count. `computeSkeleton2DWorldTransforms` fills `worldMatrices`;
// `setSkeleton2DBindPose` captures `inverseBindMatrices`; `computeSkeleton2DBoneMatrices` fills the palette.
// Pass `slots` for a drawable skeleton (null for a pure bone rig). Bones must be topologically ordered
// (each bone's `parentIndex` < its own index); `validateSkeleton2D` checks this.
export function createSkeleton2D(bones: Bone2D[], slots: Skeleton2D['slots'] = null): Skeleton2D {
  const count = bones.length;
  const out = allocateEntity<Skeleton2D>();
  out.boneMatrices = new Float32Array(count * MATRIX_STRIDE);
  out.bones = bones;
  out.inverseBindMatrices = new Float32Array(count * MATRIX_STRIDE);
  out.slots = slots;
  out.worldMatrices = new Float32Array(count * MATRIX_STRIDE);
  return finishEntity(out);
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
      x.transformMode.rotation !== y.transformMode.rotation ||
      x.transformMode.scale !== y.transformMode.scale ||
      x.transformMode.reflection !== y.transformMode.reflection ||
      x.transformMode.translation !== y.transformMode.translation
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

// The skeleton's named skin, or the `null` sentinel when it carries none by that name. Names are the rig's
// own (`"goblin"`, `"goblingirl"`); a rig with no wardrobe has no skins at all.
export function getSkeleton2DSkin(skeleton: Readonly<Skeleton2D>, name: string): AttachmentSkin2D | null {
  const skins = skeleton.skins;
  if (skins === undefined || skins === null) return null;
  for (const skin of skins) {
    if (skin.name === name) return skin;
  }
  return null;
}

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

// Captures the current world transforms as the bind (setup) pose: `inverseBindMatrices[i] =
// inverse(worldMatrices[i])`. Call after posing the bones to setup and running
// `computeSkeleton2DWorldTransforms`. A non-invertible (degenerate, zero-scale) bone leaves its
// Dresses `skeleton` in `skin`: writes each of the skin's attachments onto the slot it names, leaving every
// other slot untouched. This is the whole runtime cost of the wardrobe — skins are inert until applied, and
// applying one is a slot-array write, no re-binding and no world propagation (a skin changes what is DRAWN,
// never where bones are).
//
// Slots the skin does not mention keep whatever they were showing. That is deliberate and matches how rigs
// are authored: a "default" skin carries the shared pieces while `goblin`/`goblingirl` override only the
// parts that differ, so applying one over the other must not blank the shared art. A caller wanting a clean
// swap applies the base skin first. An entry naming a slot outside the skeleton is skipped rather than
// throwing — third-party rigs are untrusted input, and a stale index is a dropped attachment, not a crash.
export function setSkeleton2DSkin(skeleton: Skeleton2D, skin: Readonly<AttachmentSkin2D>): void {
  const slots = skeleton.slots;
  if (slots === undefined || slots === null) return;
  for (const entry of skin.attachments) {
    if (entry.slotIndex >= 0 && entry.slotIndex < slots.length) slots[entry.slotIndex].attachment = entry.attachment;
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
