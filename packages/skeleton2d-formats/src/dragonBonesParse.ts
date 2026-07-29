import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createSkeleton2D } from '@flighthq/skeleton2d/contract';
import type {
  Attachment2D,
  Bone2D,
  ImportDiagnostic,
  RegionAttachment2D,
  Skeleton2DImport,
  Slot2D,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, RegionAttachment2DKind, TransformMode2D } from '@flighthq/types/contract';

// Parses a DragonBones `.json` skeleton document (text) into a Skeleton2DImport. Tolerant and best-effort,
// mirroring parseSpineSkeleton: a malformed / non-DragonBones document returns the sentinel `null`, and a
// recognized document with unmodeled pieces yields best-effort data plus `ImportDiagnostic` Skip crumbs.
// Field names follow DragonBones' vocabulary (armature / bone / slot / skin / animation).
//
// Parses the first armature's bone hierarchy, slots, and default-skin displays. DragonBones differs from
// Spine in ways the charter (open-direction 4) records: an `armature` container (multiple armatures
// possible), a nested `transform` block with `skX`/`skY` (or newer `rotate`/`skew`) skew angles rather than
// Spine's flat fields, bones NOT guaranteed parent-before-child (so they are topologically sorted here), a
// four-boolean inheritance model (inheritRotation/Scale/Reflection/Translation) mapped onto Flight's
// five-value TransformMode2D (two inexpressible combinations Skip-crumbed), and slots whose shown attachment
// is a `displayIndex` into a per-slot display list (so that list is position-preserving — see
// parseDragonBonesDefaultSkin). Image displays become region attachments; mesh/armature/bounding-box/path
// displays, additional armatures, alternate skins, and animation are recognized-but-unmodeled and
// Skip-crumbed (mesh geometry + weights, with the topo-sort bone-index remap, is the next increment).
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
  const bones = parseDragonBonesBones(armature.bone, diagnostics);
  const boneIndexByName = buildBoneIndexByName(bones);
  const skin = parseDragonBonesDefaultSkin(armature.skin, diagnostics);
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
      if (typeof slot.name === 'string') table.set(slot.name, parseDragonBonesDisplayList(slot.display, diagnostics));
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
function parseDragonBonesDisplay(raw: unknown, diagnostics?: ImportDiagnostic[]): Attachment2D | null {
  if (raw === null || typeof raw !== 'object') return null;
  const display = raw as Record<string, unknown>;
  const type = typeof display.type === 'string' ? display.type : 'image';
  if (type === 'image') return parseDragonBonesRegionDisplay(display);
  reportImportDiagnostic(
    diagnostics,
    ImportDiagnosticSeverity.Skip,
    `dragonbones.${type}-display-unsupported`,
    'parseDragonBonesSkeleton',
    { displays: 1 },
  );
  return null;
}

// Maps a slot's `display` array to Flight attachments, POSITION-PRESERVING: result index i is displayIndex
// i. Image → RegionAttachment2D; every other display type is unmodeled in this increment and held as `null`
// + a Skip crumb (via parseDragonBonesDisplay), so displayIndex stays aligned.
function parseDragonBonesDisplayList(raw: unknown, diagnostics?: ImportDiagnostic[]): (Attachment2D | null)[] {
  const displays: (Attachment2D | null)[] = [];
  if (!Array.isArray(raw)) return displays;
  for (const rawDisplay of raw) displays.push(parseDragonBonesDisplay(rawDisplay, diagnostics));
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
function parseDragonBonesBones(raw: unknown, diagnostics?: ImportDiagnostic[]): Bone2D[] {
  if (!Array.isArray(raw)) return [];
  const pending: { bone: Bone2D; parentName: string | null }[] = [];
  for (const entry of raw) {
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
        transformMode: dragonBonesTransformMode(b, diagnostics),
        x: transform.x,
        y: transform.y,
      },
      parentName: typeof b.parent === 'string' ? b.parent : null,
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
      bones.push(entry.bone);
    }
  }
  return bones;
}

// Maps DragonBones' four inheritance booleans onto Flight's five-value TransformMode2D. Position always
// inherits in Flight (the local origin is placed by the parent), so `inheritTranslation:false` is
// unmodeled and Skip-crumbed. Two rotation/scale/reflection combinations have no TransformMode2D — keeping
// rotation+scale while stripping reflection, and keeping scale+reflection while stripping rotation — and are
// Skip-crumbed, falling back to the closest mode.
function dragonBonesTransformMode(bone: Record<string, unknown>, diagnostics?: ImportDiagnostic[]): TransformMode2D {
  const inheritRotation = boolOr(bone.inheritRotation, true);
  const inheritScale = boolOr(bone.inheritScale, true);
  const inheritReflection = boolOr(bone.inheritReflection, true);
  if (!boolOr(bone.inheritTranslation, true)) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'dragonbones.inherit-translation-unsupported',
      'parseDragonBonesSkeleton',
      { bones: 1 },
    );
  }
  if (inheritRotation && inheritScale) {
    if (inheritReflection) return TransformMode2D.Normal;
    skipCrumbUnmappedInheritMode(diagnostics);
    return TransformMode2D.Normal;
  }
  if (!inheritRotation && !inheritScale) return TransformMode2D.OnlyTranslation;
  if (inheritRotation && !inheritScale) {
    return inheritReflection ? TransformMode2D.NoScale : TransformMode2D.NoScaleOrReflection;
  }
  // !inheritRotation && inheritScale — NoRotationOrReflection also strips reflection, so keeping it is unmapped.
  if (!inheritReflection) return TransformMode2D.NoRotationOrReflection;
  skipCrumbUnmappedInheritMode(diagnostics);
  return TransformMode2D.NoRotationOrReflection;
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

function skipCrumbUnmappedInheritMode(diagnostics: ImportDiagnostic[] | undefined): void {
  reportImportDiagnostic(
    diagnostics,
    ImportDiagnosticSeverity.Skip,
    'dragonbones.inherit-mode-unmapped',
    'parseDragonBonesSkeleton',
    { bones: 1 },
  );
}
