import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type { ByteReader, ImportDiagnostic, Slot2D, SpineBinarySectionContext } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { SPINE_BINARY_NO_DARK_COLOR, readSpineBinaryStringReference } from './spineBinaryParseHelpers.ts';
import {
  isSpineBinaryReaderOverrun,
  readSpineBinaryInt,
  readSpineBinaryString,
  readSpineBinaryVarint,
} from './spineBinaryReader.ts';

export function spineBinarySlotsSectionHandler(context: SpineBinarySectionContext): void {
  readSpineBinarySlotsSection(context);
}

export const spineBinarySlotsSectionReader: (context: SpineBinarySectionContext) => void =
  spineBinarySlotsSectionHandler;

function readSpineBinarySlotsSection(context: SpineBinarySectionContext): void {
  const result = parseSpineBinarySlots(context.reader, context.strings, context.diagnostics);
  context.attachmentNames.push(...result.attachmentNames);
  context.slots.push(...result.slots);
}

function parseSpineBinarySlots(
  reader: ByteReader,
  strings: readonly (string | null)[],
  diagnostics?: ImportDiagnostic[],
): { attachmentNames: (string | null)[]; slots: Slot2D[] } {
  const count = readSpineBinaryVarint(reader);
  const attachmentNames: (string | null)[] = [];
  const slots: Slot2D[] = [];
  let darkColors = 0;
  for (let i = 0; i < count; i++) {
    if (isSpineBinaryReaderOverrun(reader)) break;
    const name = readSpineBinaryString(reader);
    const boneIndex = readSpineBinaryVarint(reader);
    const color = readSpineBinaryInt(reader) >>> 0;
    if (readSpineBinaryInt(reader) !== SPINE_BINARY_NO_DARK_COLOR) darkColors++;
    attachmentNames.push(readSpineBinaryStringReference(reader, strings));
    readSpineBinaryVarint(reader);
    slots.push({ attachment: null, boneIndex, color, name });
  }
  if (darkColors > 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'spine.slot-dark-color-unsupported',
      'parseSpineSkeletonBinary',
      { slots: darkColors },
    );
  }
  return { attachmentNames, slots };
}

function skipSpineBinarySlotsSection(context: SpineBinarySectionContext): void {
  parseSpineBinarySlots(context.reader, context.strings);
}

export { skipSpineBinarySlotsSection };
