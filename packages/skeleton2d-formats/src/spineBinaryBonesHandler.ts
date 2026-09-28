import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type { Bone2D, ByteReader, ImportDiagnostic, SpineBinarySectionContext } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, TransformMode2D } from '@flighthq/types/contract';

import { SPINE_BINARY_COLOR_BYTES } from './spineBinaryParseHelpers.ts';
import {
  isSpineBinaryReaderOverrun,
  readSpineBinaryBoolean,
  readSpineBinaryFloat,
  readSpineBinaryString,
  readSpineBinaryVarint,
  skipSpineBinaryBytes,
} from './spineBinaryReader.ts';

export function spineBinaryBonesSectionHandler(context: SpineBinarySectionContext): void {
  readSpineBinaryBonesSection(context);
}

export const spineBinaryBonesSectionReader: (context: SpineBinarySectionContext) => void =
  spineBinaryBonesSectionHandler;

function readSpineBinaryBonesSection(context: SpineBinarySectionContext): void {
  context.bones.push(...parseSpineBinaryBones(context.reader, context.nonessential, context.diagnostics));
}

function parseSpineBinaryBones(reader: ByteReader, nonessential: boolean, diagnostics?: ImportDiagnostic[]): Bone2D[] {
  const count = readSpineBinaryVarint(reader);
  const bones: Bone2D[] = [];
  for (let i = 0; i < count; i++) {
    if (isSpineBinaryReaderOverrun(reader)) break;
    const name = readSpineBinaryString(reader);
    const parentIndex = i === 0 ? -1 : readSpineBinaryVarint(reader);
    if (parentIndex >= i || parentIndex < -1) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'spine.binary-bone-parent-out-of-range',
        'parseSpineBinaryBones',
        { bone: name ?? '', declared: parentIndex, read: i },
      );
      skipSpineBinaryBytes(reader, reader.view.byteLength + 1);
      break;
    }
    const rotation = readSpineBinaryFloat(reader);
    const x = readSpineBinaryFloat(reader);
    const y = readSpineBinaryFloat(reader);
    const scaleX = readSpineBinaryFloat(reader);
    const scaleY = readSpineBinaryFloat(reader);
    const shearX = readSpineBinaryFloat(reader);
    const shearY = readSpineBinaryFloat(reader);
    const length = readSpineBinaryFloat(reader);
    const transformMode = spineBinaryTransformMode(readSpineBinaryVarint(reader));
    readSpineBinaryBoolean(reader);
    if (nonessential) skipSpineBinaryBytes(reader, SPINE_BINARY_COLOR_BYTES);
    bones.push({
      length,
      name,
      parentIndex,
      rotation,
      scaleX,
      scaleY,
      shearX,
      shearY,
      transformMode,
      x,
      y,
    });
  }
  return bones;
}

function skipSpineBinaryBonesSection(context: SpineBinarySectionContext): void {
  parseSpineBinaryBones(context.reader, context.nonessential);
}

function spineBinaryTransformMode(ordinal: number): (typeof SPINE_BINARY_TRANSFORM_MODES)[number] {
  return ordinal >= 0 && ordinal < SPINE_BINARY_TRANSFORM_MODES.length
    ? SPINE_BINARY_TRANSFORM_MODES[ordinal]
    : TransformMode2D.Normal;
}

export { skipSpineBinaryBonesSection };

const SPINE_BINARY_TRANSFORM_MODES = [
  TransformMode2D.Normal,
  TransformMode2D.OnlyTranslation,
  TransformMode2D.NoRotationOrReflection,
  TransformMode2D.NoScale,
  TransformMode2D.NoScaleOrReflection,
] as const;
