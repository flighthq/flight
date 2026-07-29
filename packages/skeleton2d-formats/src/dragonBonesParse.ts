import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createSkeleton2D } from '@flighthq/skeleton2d/contract';
import type { Bone2D, ImportDiagnostic, Skeleton2DImport } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, TransformMode2D } from '@flighthq/types/contract';

// Parses a DragonBones `.json` skeleton document (text) into a Skeleton2DImport. Tolerant and best-effort,
// mirroring parseSpineSkeleton: a malformed / non-DragonBones document returns the sentinel `null`, and a
// recognized document with unmodeled pieces yields best-effort data plus `ImportDiagnostic` Skip crumbs.
// Field names follow DragonBones' vocabulary (armature / bone / slot / skin / animation).
//
// This first landing parses the first armature's bone hierarchy. DragonBones differs from Spine in ways the
// charter (open-direction 4) records: an `armature` container (multiple armatures possible), a nested
// `transform` block with `skX`/`skY` (or newer `rotate`/`skew`) skew angles rather than Spine's flat fields,
// bones NOT guaranteed parent-before-child (so they are topologically sorted here), and a four-boolean
// inheritance model (inheritRotation/Scale/Reflection/Translation) mapped onto Flight's five-value
// TransformMode2D — the two combinations the enum cannot express are Skip-crumbed. Slots, skins, animation,
// and additional armatures are recognized-but-unmodeled in this increment and Skip-crumbed.
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
  skipCrumbDragonBonesGroup(diagnostics, armature.slot, 'dragonbones.slot-unsupported');
  skipCrumbDragonBonesGroup(diagnostics, armature.skin, 'dragonbones.skin-unsupported');
  skipCrumbDragonBonesGroup(diagnostics, armature.animation, 'dragonbones.animation-unsupported');
  return { animations: [], skeleton: createSkeleton2D(bones, null) };
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
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
