import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createSkeleton2D } from '@flighthq/skeleton2d/contract';
import type {
  Attachment2D,
  Bone2D,
  ImportDiagnostic,
  MeshAttachment2D,
  RegionAttachment2D,
  Skeleton2DImport,
  Slot2D,
  TransformInherit2D,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, MeshAttachment2DKind, RegionAttachment2DKind } from '@flighthq/types/contract';

// Resolves a DragonBones armature-file-order bone index to the topo-sorted output index (the axis-12 remap).
// Local to this file — a value, not an exported API type.
type DragonBonesBoneRemap = (rawBoneIndex: number) => number;

// Parses a DragonBones `.json` skeleton document (text) into a Skeleton2DImport. Tolerant and best-effort,
// mirroring parseSpineSkeleton: a malformed / non-DragonBones document returns the sentinel `null`, and a
// recognized document with unmodeled pieces yields best-effort data plus `ImportDiagnostic` Skip crumbs.
// Field names follow DragonBones' vocabulary (armature / bone / slot / skin / animation).
//
// Parses the first armature's bone hierarchy, slots, and default-skin displays. DragonBones differs from
// Spine in ways the charter (open-direction 4) records: an `armature` container (multiple armatures
// possible), a nested `transform` block with `skX`/`skY` (or newer `rotate`/`skew`) skew angles rather than
// Spine's flat fields, bones NOT guaranteed parent-before-child (so they are topologically sorted here), a
// four-boolean inheritance model (inheritRotation/Scale/Reflection/Translation) mapped straight onto Flight's
// vendor-neutral TransformInherit2D (every combination expressible — no gap), and slots whose shown attachment
// is a `displayIndex` into a per-slot display list (so that list is position-preserving — see
// parseDragonBonesDefaultSkin). Image displays become region attachments; unweighted AND weighted mesh
// displays become mesh attachments (weighted via bonePose/slotPose → Skin2D offsets with the topo-sort
// bone-index remap — see parseDragonBonesWeightedMesh); armature/bounding-box/path displays, shared and
// legacy-weighted meshes, additional armatures, alternate skins, and animation are recognized-but-unmodeled
// and Skip-crumbed (frame timelines are next).
export function parseDragonBonesSkeleton(json: string, diagnostics?: ImportDiagnostic[]): Skeleton2DImport | null {
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch {
    return null;
  }
  if (doc === null || typeof doc !== 'object') return null;
  const armatures = (doc as Record<string, unknown>).armature;
  if (!Array.isArray(armatures) || armatures.length === 0) return null; // not a DragonBones document
  if (armatures.length > 1) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'dragonbones.multi-armature-unsupported',
      'parseDragonBonesSkeleton',
      { armatures: armatures.length - 1 },
    );
  }
  const first = armatures[0];
  if (first === null || typeof first !== 'object') return null;
  const armature = first as Record<string, unknown>;
  const { bones, rawIndexToOutput } = parseDragonBonesBones(armature.bone, diagnostics);
  const boneIndexByName = buildBoneIndexByName(bones);
  const remapBoneIndex = buildDragonBonesBoneRemap(rawIndexToOutput);
  const skin = parseDragonBonesDefaultSkin(armature.skin, remapBoneIndex, diagnostics);
  const slots = parseDragonBonesSlots(armature.slot, boneIndexByName, skin, diagnostics);
  skipCrumbDragonBonesGroup(diagnostics, armature.animation, 'dragonbones.animation-unsupported');
  return { animations: [], skeleton: createSkeleton2D(bones, slots) };
}

// Rebuilds the bone-name → output-index lookup from the (already topologically sorted) bone array, so slot
// `parent` references and future weighted-mesh bone indices resolve to the FINAL emitted position rather
// than the file's authoring order.
function buildBoneIndexByName(bones: readonly Bone2D[]): Map<string, number> {
  const byName = new Map<string, number>();
  for (let i = 0; i < bones.length; i++) {
    const name = bones[i].name;
    if (typeof name === 'string') byName.set(name, i);
  }
  return byName;
}

// Maps a DragonBones armature-FILE-ORDER bone index (the space weighted-mesh `weights`/`bonePose` reference
// bones in) to the FINAL topo-sorted OUTPUT bone index — the read-integrity axis-12 remap the topo-sort
// makes necessary. Backed by the identity-preserving `rawIndexToOutput` table built during emit (NOT
// reconstructed by name, which would collide duplicate names). Returns -1 for an out-of-range or dropped
// raw index; callers must treat -1 as an unresolved influence and drop it, never emit it as a bone index.
function buildDragonBonesBoneRemap(rawIndexToOutput: readonly number[]): DragonBonesBoneRemap {
  return (rawBoneIndex) =>
    rawBoneIndex >= 0 && rawBoneIndex < rawIndexToOutput.length ? rawIndexToOutput[rawBoneIndex] : -1;
}

// Maps a DragonBones slot ColorTransform to a packed RGBA int (Slot2D.color). DragonBones color is the
// multiply channels aM/rM/gM/bM (0–100 percent) plus additive offsets aO/rO/gO/bO. Only the multiply tint
// maps to a packed color; a nonzero offset cannot be represented and is Skip-crumbed. Absent color = opaque
// white (0xffffffff), matching the packed RR GG BB AA convention parseSpineColor uses.
function parseDragonBonesColor(raw: unknown, diagnostics?: ImportDiagnostic[]): number {
  if (raw === null || typeof raw !== 'object') return 0xffffffff;
  const color = raw as Record<string, unknown>;
  const r = colorChannel(color.rM);
  const g = colorChannel(color.gM);
  const b = colorChannel(color.bM);
  const a = colorChannel(color.aM);
  if (
    numberOr(color.rO, 0) !== 0 ||
    numberOr(color.gO, 0) !== 0 ||
    numberOr(color.bO, 0) !== 0 ||
    numberOr(color.aO, 0) !== 0
  ) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'dragonbones.color-offset-unsupported',
      'parseDragonBonesSkeleton',
      { slots: 1 },
    );
  }
  return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}

// The default skin's per-slot display table: slotName → the ordered list of that slot's displays
// (attachments), addressed by `displayIndex`. DragonBones names its default skin "default" (or leaves it
// empty); alternate named skins are the skin-set feature and are Skip-crumbed. The display list is
// POSITIONALLY REFERENCED by displayIndex, so an unmodeled/malformed display holds its slot as `null` (never
// dropped) — mirroring the DragonBones runtime's own addDisplay(slot, null) — so indices stay aligned.
function parseDragonBonesDefaultSkin(
  raw: unknown,
  remapBoneIndex: DragonBonesBoneRemap,
  diagnostics?: ImportDiagnostic[],
): Map<string, (Attachment2D | null)[]> {
  const table = new Map<string, (Attachment2D | null)[]>();
  if (!Array.isArray(raw)) return table;
  let alternateSkins = 0;
  for (const rawSkin of raw) {
    if (rawSkin === null || typeof rawSkin !== 'object') continue;
    const skin = rawSkin as Record<string, unknown>;
    const skinName = typeof skin.name === 'string' && skin.name.length > 0 ? skin.name : 'default';
    if (skinName !== 'default') {
      alternateSkins++;
      continue;
    }
    if (!Array.isArray(skin.slot)) continue;
    for (const rawSlot of skin.slot) {
      if (rawSlot === null || typeof rawSlot !== 'object') continue;
      const slot = rawSlot as Record<string, unknown>;
      if (typeof slot.name === 'string') {
        table.set(slot.name, parseDragonBonesDisplayList(slot.display, remapBoneIndex, diagnostics));
      }
    }
  }
  if (alternateSkins > 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'dragonbones.alternate-skin-unsupported',
      'parseDragonBonesSkeleton',
      { skins: alternateSkins },
    );
  }
  return table;
}

// Parses one DragonBones display into an Attachment2D, or `null` (holding its displayIndex slot) for a
// malformed entry or an unmodeled type. DragonBones omits `type` for an image display (the default).
function parseDragonBonesDisplay(
  raw: unknown,
  remapBoneIndex: DragonBonesBoneRemap,
  diagnostics?: ImportDiagnostic[],
): Attachment2D | null {
  if (raw === null || typeof raw !== 'object') return null;
  const display = raw as Record<string, unknown>;
  const type = typeof display.type === 'string' ? display.type : 'image';
  if (type === 'image') return parseDragonBonesRegionDisplay(display);
  if (type === 'mesh') return parseDragonBonesMeshDisplay(display, remapBoneIndex, diagnostics);
  reportImportDiagnostic(
    diagnostics,
    ImportDiagnosticSeverity.Skip,
    `dragonbones.${type}-display-unsupported`,
    'parseDragonBonesSkeleton',
    { displays: 1 },
  );
  return null;
}

// A DragonBones mesh display → MeshAttachment2D. UNWEIGHTED (rigid, single-slot-bone): its `vertices` are
// positions in the slot bone's local space, mapped directly like a Spine unweighted mesh. WEIGHTED (a
// `weights` stream with `bonePose`/`slotPose` bind matrices): converted to Skin2D per-bone offsets (see
// parseDragonBonesWeightedMesh). A `share`d mesh (geometry borrowed from another display) is not modeled and
// is Skip-crumbed, held at its displayIndex (returns null).
function parseDragonBonesMeshDisplay(
  display: Record<string, unknown>,
  remapBoneIndex: DragonBonesBoneRemap,
  diagnostics?: ImportDiagnostic[],
): MeshAttachment2D | null {
  if ('share' in display) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'dragonbones.shared-mesh-unsupported',
      'parseDragonBonesSkeleton',
      { displays: 1 },
    );
    return null;
  }
  if ('weights' in display) {
    if ('bonePose' in display) return parseDragonBonesWeightedMesh(display, remapBoneIndex, diagnostics);
    // A `weights` stream without `bonePose` is DragonBones' older bind-matrix-less weighting; not modeled.
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'dragonbones.legacy-weighted-mesh-unsupported',
      'parseDragonBonesSkeleton',
      { displays: 1 },
    );
    return null;
  }
  const uvs = toFloat32Array(display.uvs);
  return {
    kind: MeshAttachment2DKind,
    name: typeof display.name === 'string' ? display.name : null,
    skin: null,
    triangles: toUint16Array(display.triangles),
    uvs,
    vertexCount: uvs.length >> 1,
    vertices: toFloat32Array(display.vertices),
  };
}

// Converts a DragonBones WEIGHTED mesh to a MeshAttachment2D whose Skin2D carries per-bone LOCAL offsets, by
// replicating the DragonBones runtime's geometry bake (ObjectDataParser._parseGeometry): each raw vertex is
// pushed through `slotPose`, then through the INVERSE of each influencing bone's `bonePose` bind matrix, and
// the result is that vertex expressed in the bone's bind-local frame — exactly what Skin2D + Flight's deform
// consume (Σ w·(boneWorld·localOffset)). All matrices share Flight's `x'=a·x+c·y` convention (as does
// DragonBones), so no transposition; the offsets are computed wholly within DragonBones' own space, so the
// global y-down↔y-up question (charter #4) is orthogonal and unaffected here.
//
// The `weights` stream references bones by ARMATURE FILE-ORDER index; `remapBoneIndex` re-points each
// influence at the topo-sorted OUTPUT bone (the axis-12 remap). Every read is bounded against the actual
// stream length (axis 13); a truncated stream, an unresolvable bone, or a degenerate bind matrix drops that
// influence/vertex best-effort and emits a Recover crumb.
function parseDragonBonesWeightedMesh(
  display: Record<string, unknown>,
  remapBoneIndex: DragonBonesBoneRemap,
  diagnostics?: ImportDiagnostic[],
): MeshAttachment2D {
  const uvs = toFloat32Array(display.uvs);
  const vertexCount = uvs.length >> 1;
  const verts = numberArray(display.vertices);
  const weights = numberArray(display.weights);
  const bonePose = numberArray(display.bonePose);
  const slotPose = numberArray(display.slotPose);
  const spA = numAt(slotPose, 0, 1);
  const spB = numAt(slotPose, 1, 0);
  const spC = numAt(slotPose, 2, 0);
  const spD = numAt(slotPose, 3, 1);
  const spTx = numAt(slotPose, 4, 0);
  const spTy = numAt(slotPose, 5, 0);
  const usedBoneCount = Math.floor(bonePose.length / 7);
  const influenceCounts = new Uint16Array(vertexCount);
  const influences: number[] = [];
  let recovered = false;
  let iW = 0;
  for (let v = 0; v < vertexCount; v++) {
    if (iW >= weights.length) {
      recovered = true;
      break;
    }
    const declaredCount = weights[iW++] | 0;
    const vx = numAt(verts, v * 2, 0);
    const vy = numAt(verts, v * 2 + 1, 0);
    const sx = spA * vx + spC * vy + spTx;
    const sy = spB * vx + spD * vy + spTy;
    let realCount = 0;
    for (let j = 0; j < declaredCount; j++) {
      if (iW + 1 >= weights.length) {
        recovered = true;
        break;
      }
      const rawBoneIndex = weights[iW++] | 0;
      const weight = weights[iW++];
      // The influence pair is consumed above, so every early-out below keeps the flat stream aligned. Drop
      // (recover) an influence that: targets no output bone (remap −1 — never emit −1, the deformer would
      // index the world buffer from a negative offset and produce NaNs); references a bone this mesh's bind
      // pose omits (ordinal −1); has a degenerate bind matrix (det 0); or would overflow the Uint16 count
      // (an influence past the representable maximum, which would wrap influenceCounts and break the
      // deformer's `influences.length === 4 × Σ influenceCounts` invariant).
      const outputBone = remapBoneIndex(rawBoneIndex);
      const ordinal = findBonePoseOrdinal(bonePose, usedBoneCount, rawBoneIndex);
      if (outputBone < 0 || ordinal < 0 || realCount >= MAX_INFLUENCES_PER_VERTEX) {
        recovered = true;
        continue;
      }
      const o = ordinal * 7;
      const ba = bonePose[o + 1];
      const bb = bonePose[o + 2];
      const bc = bonePose[o + 3];
      const bd = bonePose[o + 4];
      const btx = bonePose[o + 5];
      const bty = bonePose[o + 6];
      const det = ba * bd - bb * bc;
      if (det === 0) {
        recovered = true;
        continue;
      }
      const inv = 1 / det;
      // Inverse of the bind matrix, then apply it to the slotPose-transformed vertex → bind-local offset.
      const ia = bd * inv;
      const ib = -bb * inv;
      const ic = -bc * inv;
      const id = ba * inv;
      const itx = (bc * bty - bd * btx) * inv;
      const ity = (bb * btx - ba * bty) * inv;
      influences.push(outputBone, ia * sx + ic * sy + itx, ib * sx + id * sy + ity, weight);
      realCount++;
    }
    influenceCounts[v] = realCount;
  }
  if (recovered) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Recover,
      'dragonbones.weighted-mesh-recovered',
      'parseDragonBonesSkeleton',
      { meshes: 1 },
    );
  }
  return {
    kind: MeshAttachment2DKind,
    name: typeof display.name === 'string' ? display.name : null,
    skin: { influenceCounts, influences: Float32Array.from(influences) },
    triangles: toUint16Array(display.triangles),
    uvs,
    vertexCount,
    vertices: null,
  };
}

// Maps a slot's `display` array to Flight attachments, POSITION-PRESERVING: result index i is displayIndex
// i. Image → RegionAttachment2D; every other display type is unmodeled in this increment and held as `null`
// + a Skip crumb (via parseDragonBonesDisplay), so displayIndex stays aligned.
function parseDragonBonesDisplayList(
  raw: unknown,
  remapBoneIndex: DragonBonesBoneRemap,
  diagnostics?: ImportDiagnostic[],
): (Attachment2D | null)[] {
  const displays: (Attachment2D | null)[] = [];
  if (!Array.isArray(raw)) return displays;
  for (const rawDisplay of raw) displays.push(parseDragonBonesDisplay(rawDisplay, remapBoneIndex, diagnostics));
  return displays;
}

// A DragonBones image display → RegionAttachment2D. Its `transform` places the region in the slot's local
// space; width/height come from the texture atlas (the `.atlas` sidecar, spritesheet-formats' domain) and
// are left 0 here to be resolved at atlas-binding time, mirroring how a display references its region by name.
function parseDragonBonesRegionDisplay(display: Record<string, unknown>): RegionAttachment2D {
  const transform = parseDragonBonesBoneTransform(display.transform);
  return {
    height: 0,
    kind: RegionAttachment2DKind,
    name: typeof display.name === 'string' ? display.name : null,
    rotation: transform.rotation,
    scaleX: transform.scaleX,
    scaleY: transform.scaleY,
    width: 0,
    x: transform.x,
    y: transform.y,
  };
}

// DragonBones slots bind a bone to their shown display; `slot` array order is the draw order. `boneIndex`
// resolves the slot's `parent` (a bone name) to the output bone index; the shown attachment is the display
// at `displayIndex` (default 0; negative = none) in the default skin's display list for this slot; `color`
// is the slot's ColorTransform tint.
function parseDragonBonesSlots(
  raw: unknown,
  boneIndexByName: ReadonlyMap<string, number>,
  skin: ReadonlyMap<string, readonly (Attachment2D | null)[]>,
  diagnostics?: ImportDiagnostic[],
): Slot2D[] {
  const slots: Slot2D[] = [];
  if (!Array.isArray(raw)) return slots;
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue;
    const slot = entry as Record<string, unknown>;
    const name = typeof slot.name === 'string' ? slot.name : null;
    const boneIndex = typeof slot.parent === 'string' ? (boneIndexByName.get(slot.parent) ?? -1) : -1;
    const displayIndex = numberOr(slot.displayIndex, 0) | 0;
    let attachment: Attachment2D | null = null;
    if (name !== null && displayIndex >= 0) {
      const displays = skin.get(name);
      if (displays !== undefined && displayIndex < displays.length) attachment = displays[displayIndex];
    }
    slots.push({ attachment, boneIndex, color: parseDragonBonesColor(slot.color, diagnostics), name });
  }
  return slots;
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

// One DragonBones multiply-color channel (0–100 percent) → an 0–255 byte, clamped.
function colorChannel(value: unknown): number {
  return Math.max(0, Math.min(255, Math.round((numberOr(value, 100) / 100) * 255)));
}

// The ordinal (0-based position in `bonePose`, 7 numbers each: [rawBoneIndex, a, b, c, d, tx, ty]) of the
// used bone whose armature file-order index is `rawBoneIndex`, or -1 if this mesh's bind pose omits it.
function findBonePoseOrdinal(bonePose: readonly number[], usedBoneCount: number, rawBoneIndex: number): number {
  for (let i = 0; i < usedBoneCount; i++) {
    if (bonePose[i * 7] === rawBoneIndex) return i;
  }
  return -1;
}

function numAt(values: readonly number[], index: number, fallback: number): number {
  return index >= 0 && index < values.length && typeof values[index] === 'number' ? values[index] : fallback;
}

function numberArray(value: unknown): readonly number[] {
  return Array.isArray(value) ? (value as number[]) : [];
}

function toFloat32Array(value: unknown): Float32Array {
  return Array.isArray(value) ? Float32Array.from(value as number[]) : new Float32Array();
}

function toUint16Array(value: unknown): Uint16Array {
  return Array.isArray(value) ? Uint16Array.from(value as number[]) : new Uint16Array();
}

// Maps a DragonBones bone's nested `transform` block to Flight's local TRS + shear fields. DragonBones stores
// two skew angles in degrees: `skX`/`skY` (older) or `rotate`/`skew` (5.x) — its `Transform` reads
// rotation = rotate (else skY) and skew = skew (else skX − skY). Its toMatrix
// (a=sX·cos(rotation), b=sX·sin(rotation), c=−sY·sin(rotation+skew), d=sY·cos(rotation+skew)) equals Flight's
// Bone2D local matrix under `Bone2D.rotation = rotation`, `shearX = 0`, `shearY = skew` (see charter #4).
function parseDragonBonesBoneTransform(raw: unknown): {
  rotation: number;
  scaleX: number;
  scaleY: number;
  shearY: number;
  x: number;
  y: number;
} {
  const t = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  let rotation: number;
  let shearY: number;
  if ('rotate' in t || 'skew' in t) {
    rotation = numberOr(t.rotate, 0);
    shearY = numberOr(t.skew, 0);
  } else {
    rotation = numberOr(t.skY, 0);
    shearY = numberOr(t.skX, 0) - rotation;
  }
  return {
    rotation,
    scaleX: numberOr(t.scX, 1),
    scaleY: numberOr(t.scY, 1),
    shearY,
    x: numberOr(t.x, 0),
    y: numberOr(t.y, 0),
  };
}

// DragonBones lists bones in no guaranteed parent order and references parents by name, so bones are emitted
// in topological order (each parent before its children) with `parentIndex` resolved against the already-
// emitted set — the invariant `computeSkeleton2DWorldTransforms` and `validateSkeleton2D` require. Bones whose
// parent never resolves (a dangling reference or a cycle) are emitted last as roots and Skip-crumbed.
function parseDragonBonesBones(
  raw: unknown,
  diagnostics?: ImportDiagnostic[],
): { bones: Bone2D[]; rawIndexToOutput: number[] } {
  const rawArray = Array.isArray(raw) ? raw : [];
  // rawIndexToOutput[fileOrderIndex] = the bone's final output index (-1 for a dropped/malformed raw entry).
  // Carrying each raw entry's IDENTITY through to its output position — rather than reconstructing the map
  // by name — is what keeps weighted-mesh bone references correct when two bones share a name (a name-based
  // remap is last-write-wins, so both would collide onto one output bone). Parent links still resolve by
  // name, which is DragonBones' own reference model.
  const rawIndexToOutput = new Array<number>(rawArray.length).fill(-1);
  const pending: { bone: Bone2D; parentName: string | null; rawIndex: number }[] = [];
  for (let ri = 0; ri < rawArray.length; ri++) {
    const entry = rawArray[ri];
    if (entry === null || typeof entry !== 'object') continue;
    const b = entry as Record<string, unknown>;
    const transform = parseDragonBonesBoneTransform(b.transform);
    pending.push({
      bone: {
        length: numberOr(b.length, 0),
        name: typeof b.name === 'string' ? b.name : null,
        parentIndex: -1,
        rotation: transform.rotation,
        scaleX: transform.scaleX,
        scaleY: transform.scaleY,
        shearX: 0,
        shearY: transform.shearY,
        transformMode: dragonBonesTransformMode(b),
        x: transform.x,
        y: transform.y,
      },
      parentName: typeof b.parent === 'string' ? b.parent : null,
      rawIndex: ri,
    });
  }
  const bones: Bone2D[] = [];
  const indexByName = new Map<string, number>();
  let advanced = true;
  while (pending.length > 0 && advanced) {
    advanced = false;
    for (let i = 0; i < pending.length; ) {
      const entry = pending[i];
      if (entry.parentName === null || indexByName.has(entry.parentName)) {
        entry.bone.parentIndex = entry.parentName === null ? -1 : (indexByName.get(entry.parentName) as number);
        if (typeof entry.bone.name === 'string') indexByName.set(entry.bone.name, bones.length);
        rawIndexToOutput[entry.rawIndex] = bones.length;
        bones.push(entry.bone);
        pending.splice(i, 1);
        advanced = true;
      } else {
        i++;
      }
    }
  }
  if (pending.length > 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'dragonbones.unresolved-bone-parent',
      'parseDragonBonesSkeleton',
      { count: pending.length },
    );
    for (const entry of pending) {
      entry.bone.parentIndex = -1;
      if (typeof entry.bone.name === 'string') indexByName.set(entry.bone.name, bones.length);
      rawIndexToOutput[entry.rawIndex] = bones.length;
      bones.push(entry.bone);
    }
  }
  return { bones, rawIndexToOutput };
}

// Maps DragonBones' four independent inheritance booleans straight to the vendor-neutral TransformInherit2D
// (all default true = Normal). Every combination is now expressible — the two rotation/scale/reflection
// combos that had no value in the old five-mode enum, and `inheritTranslation:false` — so nothing is
// Skip-crumbed here; the factoring of the inherit axes removed the per-vendor gap.
function dragonBonesTransformMode(bone: Record<string, unknown>): TransformInherit2D {
  return {
    reflection: boolOr(bone.inheritReflection, true),
    rotation: boolOr(bone.inheritRotation, true),
    scale: boolOr(bone.inheritScale, true),
    translation: boolOr(bone.inheritTranslation, true),
  };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

// Reports one aggregated Skip crumb for an unmodeled DragonBones section (slot / skin / animation), with its
// element count. An absent or empty section is silent.
function skipCrumbDragonBonesGroup(diagnostics: ImportDiagnostic[] | undefined, raw: unknown, kind: string): void {
  let count = 0;
  if (Array.isArray(raw)) count = raw.length;
  else if (raw !== null && typeof raw === 'object') count = Object.keys(raw as Record<string, unknown>).length;
  if (count > 0)
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Skip, kind, 'parseDragonBonesSkeleton', { count });
}

// Skin2D stores per-vertex influence counts in a Uint16Array, so a vertex cannot carry more influences than
// this without wrapping the count (and breaking `influences.length === 4 × Σ influenceCounts`). No real rig
// approaches it; the cap only guards adversarial input.
const MAX_INFLUENCES_PER_VERTEX = 0xffff;
