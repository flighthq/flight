import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type { ByteReader, ImportDiagnostic } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import {
  isSpineBinaryReaderOverrun,
  readSpineBinaryByte,
  readSpineBinaryVarint,
  skipSpineBinaryBytes,
} from './spineBinaryReader.ts';

export function clampSpineBinaryUnit(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function readSpineBinaryStringReference(reader: ByteReader, strings: readonly (string | null)[]): string | null {
  const index = readSpineBinaryVarint(reader);
  return index > 0 && index <= strings.length ? strings[index - 1] : null;
}

export function reportSpineBinaryCrumb(
  diagnostics: ImportDiagnostic[] | undefined,
  count: number,
  kind: string,
  origin: string,
  unit: string,
): void {
  if (count > 0) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Skip, kind, origin, {
      [unit]: count,
    });
  }
}

export function skipSpineBinaryCurveFrames(
  reader: ByteReader,
  frameCount: number,
  payloadBytes: number,
  curveValues: number,
): void {
  if (frameCount <= 0) return;
  skipSpineBinaryBytes(reader, 4 + payloadBytes);
  for (let f = 0; f + 1 < frameCount && !isSpineBinaryReaderOverrun(reader); f++) {
    skipSpineBinaryBytes(reader, 4 + payloadBytes);
    skipSpineBinaryCurveTag(reader, curveValues);
  }
}

export function skipSpineBinaryCurveTag(reader: ByteReader, curveValues: number): void {
  if (readSpineBinaryByte(reader) === SPINE_BINARY_CURVE_BEZIER) {
    skipSpineBinaryBytes(reader, curveValues * 16);
  }
}

export function tally(counts: Map<string, number>, kind: string): void {
  counts.set(kind, (counts.get(kind) ?? 0) + 1);
}

export const SPINE_BINARY_ATTACHMENT_SEQUENCE = 1;
export const SPINE_BINARY_ATTACHMENT_TYPES = [
  'region',
  'boundingbox',
  'mesh',
  'linkedmesh',
  'path',
  'point',
  'clipping',
] as const;
export const SPINE_BINARY_BOUNDS_BYTES = 16;
export const SPINE_BINARY_COLOR_BYTES = 4;
export const SPINE_BINARY_CURVE_BEZIER = 2;
export const SPINE_BINARY_CURVE_EPSILON = 1e-6;
export const SPINE_BINARY_DEFAULT_SKIN_NAME = 'default';
export const SPINE_BINARY_FPS_BYTES = 4;
export const SPINE_BINARY_HASH_BYTES = 8;
export const SPINE_BINARY_MESH_UV_BYTES = 8;
export const SPINE_BINARY_NO_ATTACHMENT_INDEX = -1;
export const SPINE_BINARY_NO_DARK_COLOR = -1;
export const SPINE_BINARY_PATH_MIX = 2;
export const SPINE_BINARY_SKIN_REQUIREMENT_LISTS = 4;
export const SPINE_BINARY_SLOT_ATTACHMENT = 0;
export const SPINE_BINARY_SLOT_RGBA = 1;
export const SPINE_BINARY_TRIANGLE_INDEX_BYTES = 2;
