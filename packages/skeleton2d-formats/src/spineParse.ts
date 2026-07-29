import { createSkeleton2D } from '@flighthq/skeleton2d/contract';
import type { Bone2D, ImportDiagnostic, Skeleton2DImport } from '@flighthq/types/contract';
import { TransformMode2D } from '@flighthq/types/contract';

// Parses a Spine skeleton `.json` document (text) into a Skeleton2DImport — the setup-pose Skeleton2D
// plus its named animations. Tolerant and best-effort: a malformed / non-Spine document returns the
// sentinel `null` (the expected "unrecognized format" failure); a recognized document with missing or
// unmodeled pieces yields best-effort data and reports `ImportDiagnostic`s through the optional
// `diagnostics` sink. Names mirror Spine's vocabulary (bone/slot/skin/attachment/timeline).
//
// This first landing parses the bone hierarchy; slots, attachments, skins, and animation timelines are
// layered on in the same tolerant shape, and Spine features Flight does not model (IK/transform/path
// constraints, clipping/path/point attachments, events) emit `ImportDiagnosticSeverity.Skip` crumbs.
export function parseSpineSkeleton(json: string, diagnostics?: ImportDiagnostic[]): Skeleton2DImport | null {
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch {
    return null;
  }
  if (doc === null || typeof doc !== 'object') return null;
  const record = doc as Record<string, unknown>;
  const bones = parseSpineBones(record.bones, diagnostics);
  return { animations: [], skeleton: createSkeleton2D(bones) };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

// Spine bones are authored parent-before-child, and reference their parent by name — so a parent's index
// is resolvable from the bones already accumulated. Returns -1 (a root) when there is no parent or it is
// not yet known (a forward reference, which a well-formed Spine file never produces).
function parseSpineBones(raw: unknown, _diagnostics?: ImportDiagnostic[]): Bone2D[] {
  const bones: Bone2D[] = [];
  if (!Array.isArray(raw)) return bones;
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue;
    const bone = entry as Record<string, unknown>;
    const name = typeof bone.name === 'string' ? bone.name : null;
    let parentIndex = -1;
    if (typeof bone.parent === 'string') {
      for (let i = bones.length - 1; i >= 0; i--) {
        if (bones[i].name === bone.parent) {
          parentIndex = i;
          break;
        }
      }
    }
    bones.push({
      length: numberOr(bone.length, 0),
      name,
      parentIndex,
      rotation: numberOr(bone.rotation, 0),
      scaleX: numberOr(bone.scaleX, 1),
      scaleY: numberOr(bone.scaleY, 1),
      shearX: numberOr(bone.shearX, 0),
      shearY: numberOr(bone.shearY, 0),
      transformMode: spineTransformMode(bone.transform),
      x: numberOr(bone.x, 0),
      y: numberOr(bone.y, 0),
    });
  }
  return bones;
}

// Maps a Spine bone `transform` string to a TransformMode2D. Spine omits the field for the default,
// so an absent/unknown value is `Normal`.
function spineTransformMode(value: unknown): TransformMode2D {
  switch (value) {
    case 'onlyTranslation':
      return TransformMode2D.OnlyTranslation;
    case 'noRotationOrReflection':
      return TransformMode2D.NoRotationOrReflection;
    case 'noScale':
      return TransformMode2D.NoScale;
    case 'noScaleOrReflection':
      return TransformMode2D.NoScaleOrReflection;
    default:
      return TransformMode2D.Normal;
  }
}
