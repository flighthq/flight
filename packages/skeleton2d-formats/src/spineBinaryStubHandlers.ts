import type { ByteReader, ImportDiagnostic, SpineBinarySectionContext } from '@flighthq/types/contract';

import { reportSpineBinaryCrumb } from './spineBinaryParseHelpers.ts';
import {
  isSpineBinaryReaderOverrun,
  readSpineBinaryBoolean,
  readSpineBinaryString,
  readSpineBinaryVarint,
  skipSpineBinaryBytes,
} from './spineBinaryReader.ts';

export function skipSpineBinaryEventsSection(context: SpineBinarySectionContext): void {
  consumeSpineBinaryEvents(context.reader);
}

export const spineBinaryEventsSectionReader: (context: SpineBinarySectionContext) => void =
  spineBinaryEventsSectionHandler;

export function skipSpineBinaryIkConstraintsSection(context: SpineBinarySectionContext): void {
  consumeSpineBinaryIkConstraints(context.reader);
}

export const spineBinaryIkConstraintsSectionReader: (context: SpineBinarySectionContext) => void =
  spineBinaryIkConstraintsSectionHandler;

export function skipSpineBinaryPathConstraintsSection(context: SpineBinarySectionContext): void {
  consumeSpineBinaryPathConstraints(context.reader);
}

export const spineBinaryPathConstraintsSectionReader: (context: SpineBinarySectionContext) => void =
  spineBinaryPathConstraintsSectionHandler;

export function skipSpineBinaryTransformConstraintsSection(context: SpineBinarySectionContext): void {
  consumeSpineBinaryTransformConstraints(context.reader);
}

export const spineBinaryTransformConstraintsSectionReader: (context: SpineBinarySectionContext) => void =
  spineBinaryTransformConstraintsSectionHandler;

function readSpineBinaryEventsSection(context: SpineBinarySectionContext): void {
  consumeSpineBinaryEvents(context.reader, context.diagnostics);
}

function consumeSpineBinaryEvents(reader: ByteReader, diagnostics?: ImportDiagnostic[]): void {
  const count = readSpineBinaryVarint(reader);
  for (let i = 0; i < count && !isSpineBinaryReaderOverrun(reader); i++) {
    readSpineBinaryVarint(reader);
    readSpineBinaryVarint(reader);
    skipSpineBinaryBytes(reader, 4);
    readSpineBinaryString(reader);
    if (readSpineBinaryString(reader) !== null) skipSpineBinaryBytes(reader, 8);
  }
  reportSpineBinaryCrumb(diagnostics, count, 'spine.event-unsupported', 'skipSpineBinaryEvents', 'events');
}

export function spineBinaryEventsSectionHandler(context: SpineBinarySectionContext): void {
  readSpineBinaryEventsSection(context);
}

function readSpineBinaryIkConstraintsSection(context: SpineBinarySectionContext): void {
  consumeSpineBinaryIkConstraints(context.reader, context.diagnostics);
}

function consumeSpineBinaryIkConstraints(reader: ByteReader, diagnostics?: ImportDiagnostic[]): void {
  const ik = readSpineBinaryVarint(reader);
  for (let i = 0; i < ik && !isSpineBinaryReaderOverrun(reader); i++) {
    skipSpineBinaryConstraintHead(reader);
    readSpineBinaryVarint(reader);
    skipSpineBinaryBytes(reader, 8);
    skipSpineBinaryBytes(reader, 4);
  }
  reportSpineBinaryCrumb(
    diagnostics,
    ik,
    'spine.ik-constraint-unsupported',
    'skipSpineBinaryConstraints',
    'constraints',
  );
}

export function spineBinaryIkConstraintsSectionHandler(context: SpineBinarySectionContext): void {
  readSpineBinaryIkConstraintsSection(context);
}

function readSpineBinaryTransformConstraintsSection(context: SpineBinarySectionContext): void {
  consumeSpineBinaryTransformConstraints(context.reader, context.diagnostics);
}

function consumeSpineBinaryTransformConstraints(reader: ByteReader, diagnostics?: ImportDiagnostic[]): void {
  const transform = readSpineBinaryVarint(reader);
  for (let i = 0; i < transform && !isSpineBinaryReaderOverrun(reader); i++) {
    skipSpineBinaryConstraintHead(reader);
    readSpineBinaryVarint(reader);
    skipSpineBinaryBytes(reader, 2);
    skipSpineBinaryBytes(reader, 48);
  }
  reportSpineBinaryCrumb(
    diagnostics,
    transform,
    'spine.transform-constraint-unsupported',
    'skipSpineBinaryConstraints',
    'constraints',
  );
}

export function spineBinaryPathConstraintsSectionHandler(context: SpineBinarySectionContext): void {
  readSpineBinaryPathConstraintsSection(context);
}

function readSpineBinaryPathConstraintsSection(context: SpineBinarySectionContext): void {
  consumeSpineBinaryPathConstraints(context.reader, context.diagnostics);
}

function consumeSpineBinaryPathConstraints(reader: ByteReader, diagnostics?: ImportDiagnostic[]): void {
  const path = readSpineBinaryVarint(reader);
  for (let i = 0; i < path && !isSpineBinaryReaderOverrun(reader); i++) {
    skipSpineBinaryConstraintHead(reader);
    readSpineBinaryVarint(reader);
    readSpineBinaryVarint(reader);
    readSpineBinaryVarint(reader);
    readSpineBinaryVarint(reader);
    skipSpineBinaryBytes(reader, 24);
  }
  reportSpineBinaryCrumb(
    diagnostics,
    path,
    'spine.path-constraint-unsupported',
    'skipSpineBinaryConstraints',
    'constraints',
  );
}

export function spineBinaryTransformConstraintsSectionHandler(context: SpineBinarySectionContext): void {
  readSpineBinaryTransformConstraintsSection(context);
}

function skipSpineBinaryConstraintHead(reader: ByteReader): void {
  readSpineBinaryString(reader);
  readSpineBinaryVarint(reader);
  readSpineBinaryBoolean(reader);
  const bones = readSpineBinaryVarint(reader);
  for (let i = 0; i < bones && !isSpineBinaryReaderOverrun(reader); i++) readSpineBinaryVarint(reader);
}
