import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type { Bone2D, DragonBonesSectionContext, ImportDiagnostic, TransformInherit2D } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { numberOr, parseDragonBonesBoneTransform } from './dragonBonesParseHelpers.ts';

export function dragonBonesBonesSectionHandler(context: DragonBonesSectionContext): void {
  const { bones, rawIndexToOutput } = parseDragonBonesBones(context.armature.bone, context.diagnostics);
  for (const bone of bones) context.bones.push(bone);
  for (let i = 0; i < rawIndexToOutput.length; i++) context.rawIndexToOutput[i] = rawIndexToOutput[i];
  const byName = buildBoneIndexByName(bones);
  for (const [name, index] of byName) context.boneIndexByName.set(name, index);
}

export const dragonBonesBonesSectionReader: (context: DragonBonesSectionContext) => void =
  dragonBonesBonesSectionHandler;

function buildBoneIndexByName(bones: readonly Bone2D[]): Map<string, number> {
  const byName = new Map<string, number>();
  for (let i = 0; i < bones.length; i++) {
    const name = bones[i].name;
    if (typeof name === 'string') byName.set(name, i);
  }
  return byName;
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function dragonBonesTransformMode(bone: Record<string, unknown>): TransformInherit2D {
  return {
    reflection: boolOr(bone.inheritReflection, true),
    rotation: boolOr(bone.inheritRotation, true),
    scale: boolOr(bone.inheritScale, true),
    translation: boolOr(bone.inheritTranslation, true),
  };
}

function parseDragonBonesBones(
  raw: unknown,
  diagnostics?: ImportDiagnostic[],
): { bones: Bone2D[]; rawIndexToOutput: number[] } {
  const rawArray = Array.isArray(raw) ? raw : [];
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
      ImportDiagnosticSeverity.Drop,
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
