import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type { Bone2D, ImportDiagnostic, SpineJsonSectionContext, TransformInherit2D } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, TransformMode2D } from '@flighthq/types/contract';

import { numberOr } from './spineParseHelpers.ts';

export function spineJsonBonesSectionHandler(context: SpineJsonSectionContext): void {
  for (const bone of parseSpineBones(context.doc.bones, context.diagnostics)) {
    context.bones.push(bone);
  }
}

export const spineJsonBonesSectionReader = spineJsonBonesSectionHandler;

// Spine bones are authored parent-before-child, and reference their parent by name — so a parent's index
// is resolvable from the bones already accumulated. Returns -1 (a root) when there is no parent or it is
// not yet known (a forward reference, which a well-formed Spine file never produces).
//
// The bone array is POSITIONALLY REFERENCED — a weighted mesh's vertex influences carry file-order bone
// indices into it (see parseSpineWeightedVertices). So a malformed entry must NOT be dropped: dropping it
// would shift every later bone down one slot and silently re-point every weighted-mesh influence at the
// wrong bone. Instead an inert placeholder bone holds the slot, keeping all indices aligned, and the
// recovery is recorded.
function parseSpineBones(raw: unknown, diagnostics?: ImportDiagnostic[]): Bone2D[] {
  const bones: Bone2D[] = [];
  if (!Array.isArray(raw)) return bones;
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Recover,
        'spine.malformed-bone-recovered',
        'parseSpineSkeleton',
        { bones: 1 },
      );
      bones.push(createPlaceholderBone2D());
      continue;
    }
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

// An inert root bone that holds a slot in the bone array when an entry is malformed, so file-order bone
// indices (weighted-mesh influences) stay aligned. Identity transform, no parent, no name.
function createPlaceholderBone2D(): Bone2D {
  return {
    length: 0,
    name: null,
    parentIndex: -1,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    shearX: 0,
    shearY: 0,
    transformMode: TransformMode2D.Normal,
    x: 0,
    y: 0,
  };
}

function spineTransformMode(value: unknown): TransformInherit2D {
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
