import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createSkeleton2D } from '@flighthq/skeleton2d/contract';
import type {
  ByteReader,
  ImportDiagnostic,
  Skeleton2DImport,
  SpineBinaryRegistry,
  SpineBinarySectionContext,
  SpineBinarySectionKind,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, SpineBinarySectionKind as SectionKind } from '@flighthq/types/contract';

import { skipSpineBinaryAnimationsSection } from './spineBinaryAnimationsHandler.ts';
import { skipSpineBinaryBonesSection } from './spineBinaryBonesHandler.ts';
import {
  SPINE_BINARY_BOUNDS_BYTES,
  SPINE_BINARY_DEFAULT_SKIN_NAME,
  SPINE_BINARY_FPS_BYTES,
  SPINE_BINARY_HASH_BYTES,
} from './spineBinaryParseHelpers.ts';
import {
  createSpineBinaryReader,
  isSpineBinaryReaderOverrun,
  readSpineBinaryBoolean,
  readSpineBinaryString,
  readSpineBinaryVarint,
  skipSpineBinaryBytes,
} from './spineBinaryReader.ts';
import { getSpineBinarySectionHandler } from './spineBinaryRegistry.ts';
import { skipSpineBinarySkinsSection } from './spineBinarySkinsHandler.ts';
import { skipSpineBinarySlotsSection } from './spineBinarySlotsHandler.ts';
import {
  skipSpineBinaryEventsSection,
  skipSpineBinaryIkConstraintsSection,
  skipSpineBinaryPathConstraintsSection,
  skipSpineBinaryTransformConstraintsSection,
} from './spineBinaryStubHandlers.ts';

export function parseSpineSkeletonBinaryWithRegistry(
  bytes: Readonly<Uint8Array>,
  registry: Readonly<SpineBinaryRegistry>,
  diagnostics?: ImportDiagnostic[],
): Skeleton2DImport | null {
  const reader = createSpineBinaryReader(bytes);
  skipSpineBinaryBytes(reader, SPINE_BINARY_HASH_BYTES);
  const version = readSpineBinaryString(reader);
  if (isSpineBinaryReaderOverrun(reader) || version === null) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'spine.binary-header-unreadable',
      'parseSpineSkeletonBinary',
      { bytes: bytes.byteLength },
    );
    return null;
  }
  if (!isSupportedSpineBinaryVersion(version)) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'spine.binary-version-unsupported',
      'parseSpineSkeletonBinary',
      { version },
    );
    return null;
  }
  skipSpineBinaryBytes(reader, SPINE_BINARY_BOUNDS_BYTES);
  const nonessential = readSpineBinaryBoolean(reader);
  if (nonessential) {
    skipSpineBinaryBytes(reader, SPINE_BINARY_FPS_BYTES);
    readSpineBinaryString(reader);
    readSpineBinaryString(reader);
  }
  const strings = readSpineBinaryStringTable(reader);
  const context: SpineBinarySectionContext = {
    animations: [],
    attachmentNames: [],
    bones: [],
    diagnostics,
    nonessential,
    reader,
    registry,
    skins: [],
    slots: [],
    strings,
  };
  dispatchSpineBinarySection(context, SectionKind.Bones, skipSpineBinaryBonesSection);
  dispatchSpineBinarySection(context, SectionKind.Slots, skipSpineBinarySlotsSection);
  dispatchSpineBinarySection(context, SectionKind.IkConstraints, skipSpineBinaryIkConstraintsSection);
  dispatchSpineBinarySection(context, SectionKind.TransformConstraints, skipSpineBinaryTransformConstraintsSection);
  dispatchSpineBinarySection(context, SectionKind.PathConstraints, skipSpineBinaryPathConstraintsSection);
  dispatchSpineBinarySection(context, SectionKind.Skins, skipSpineBinarySkinsSection);
  const setup = context.skins.find((skin) => skin.name === SPINE_BINARY_DEFAULT_SKIN_NAME);
  if (setup !== undefined) {
    for (const entry of setup.attachments) {
      if (entry.slotIndex < context.slots.length && context.attachmentNames[entry.slotIndex] === entry.name) {
        context.slots[entry.slotIndex].attachment = entry.attachment;
      }
    }
  }
  dispatchSpineBinarySection(context, SectionKind.Events, skipSpineBinaryEventsSection);
  dispatchSpineBinarySection(context, SectionKind.Animations, skipSpineBinaryAnimationsSection);
  if (isSpineBinaryReaderOverrun(reader)) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'spine.binary-truncated',
      'parseSpineSkeletonBinary',
      { bones: context.bones.length, slots: context.slots.length },
    );
  } else if (reader.offset < bytes.byteLength) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'spine.binary-tail-unparsed',
      'parseSpineSkeletonBinary',
      { bytes: bytes.byteLength - reader.offset },
    );
  }
  const skeleton = createSkeleton2D(context.bones, context.slots);
  if (context.skins.length > 0) skeleton.skins = context.skins;
  return { animations: context.animations, skeleton };
}

function dispatchSpineBinarySection(
  context: SpineBinarySectionContext,
  kind: SpineBinarySectionKind,
  skip: (context: SpineBinarySectionContext) => void,
): void {
  const handle = getSpineBinarySectionHandler(context.registry, kind);
  if (handle !== null) {
    handle(context);
    return;
  }
  skip(context);
  reportImportDiagnostic(
    context.diagnostics,
    ImportDiagnosticSeverity.Skip,
    'spine.binary-section-unregistered',
    'parseSpineSkeletonBinaryWithRegistry',
    { section: kind },
  );
}

function readSpineBinaryStringTable(reader: ByteReader): (string | null)[] {
  const count = readSpineBinaryVarint(reader);
  const strings: (string | null)[] = [];
  for (let i = 0; i < count && !isSpineBinaryReaderOverrun(reader); i++) strings.push(readSpineBinaryString(reader));
  return strings;
}

function isSupportedSpineBinaryVersion(version: string): boolean {
  const parts = version.split('.');
  if (parts.length < 2) return false;
  return SPINE_BINARY_SUPPORTED_LAYOUTS.includes(`${parts[0]}.${parts[1]}`);
}

const SPINE_BINARY_SUPPORTED_LAYOUTS: readonly string[] = ['4.1'];
