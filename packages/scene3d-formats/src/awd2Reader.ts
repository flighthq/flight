import { createMatrix4, createTransform3D, decomposeMatrix4ToTransform3D } from '@flighthq/geometry/contract';
import type { Matrix4, Transform3D } from '@flighthq/types/contract';

import {
  AWD2_DATA_FLOAT32,
  AWD2_DATA_FLOAT64,
  AWD2_DATA_INT16,
  AWD2_DATA_INT32,
  AWD2_DATA_INT8,
  AWD2_DATA_UINT16,
  AWD2_DATA_UINT32,
  AWD2_DATA_UINT8,
} from './awd2Schema.ts';
import { convertTransformLhToRh } from './shared.ts';

// The byte-level structures every AWD2 block is written out of: its string and transform records, its
// typed property lists, and the left-to-right-handed conversion every transform goes through. Nothing
// here knows what a block means, which is what lets a handler read its own blocks without reaching into
// the walk that dispatched it.

export function awdDataTypeByteSize(dataType: number): number {
  switch (dataType) {
    case AWD2_DATA_INT8:
    case AWD2_DATA_UINT8:
      return 1;
    case AWD2_DATA_INT16:
    case AWD2_DATA_UINT16:
      return 2;
    case AWD2_DATA_INT32:
    case AWD2_DATA_UINT32:
    case AWD2_DATA_FLOAT32:
      return 4;
    case AWD2_DATA_FLOAT64:
      return 8;
    default:
      return 4;
  }
}

// AWD stores transforms as 12 column-major floats: [c0x,c0y,c0z, c1x,c1y,c1z, c2x,c2y,c2z, tx,ty,tz] →
// 4×4 column-major with w-column [0,0,0,1]. Lifts one into `out` (its runtime binding is left intact).
export function awdTransformToMatrix4(out: Matrix4, transform: Readonly<Float64Array>): void {
  const m = out.m;
  m[0] = transform[0];
  m[1] = transform[1];
  m[2] = transform[2];
  m[3] = 0;
  m[4] = transform[3];
  m[5] = transform[4];
  m[6] = transform[5];
  m[7] = 0;
  m[8] = transform[6];
  m[9] = transform[7];
  m[10] = transform[8];
  m[11] = 0;
  m[12] = transform[9];
  m[13] = transform[10];
  m[14] = transform[11];
  m[15] = 1;
}

// Decomposes an AWD 12-float column-major transform into a document node's authored TRS Transform3D
// (lossy only on shear, which AWD authoring does not produce).
export function awdTransformToTransform3D(transform: Readonly<Float64Array>): Transform3D {
  awdTransformToMatrix4(_awdTransformScratch, transform);
  const out = createTransform3D();
  decomposeMatrix4ToTransform3D(out, _awdTransformScratch);
  return out;
}

// Whether a decomposed pose scale departs from unit within tolerance — the gate for emitting a scale
// animation channel (skipped for the common identity-scale skeletons so clips stay lean).
export function hasNonUnitScale(sx: number, sy: number, sz: number): boolean {
  return Math.abs(sx - 1) > 1e-4 || Math.abs(sy - 1) > 1e-4 || Math.abs(sz - 1) > 1e-4;
}

export function readAwdDataValue(view: Readonly<DataView>, offset: number, dataType: number): number {
  const dv = view as DataView;
  switch (dataType) {
    case AWD2_DATA_INT8:
      return dv.getInt8(offset);
    case AWD2_DATA_INT16:
      return dv.getInt16(offset, true);
    case AWD2_DATA_INT32:
      return dv.getInt32(offset, true);
    case AWD2_DATA_UINT8:
      return dv.getUint8(offset);
    case AWD2_DATA_UINT16:
      return dv.getUint16(offset, true);
    case AWD2_DATA_UINT32:
      return dv.getUint32(offset, true);
    case AWD2_DATA_FLOAT32:
      return dv.getFloat32(offset, true);
    case AWD2_DATA_FLOAT64:
      return dv.getFloat64(offset, true);
    default:
      return dv.getFloat32(offset, true);
  }
}

// Reads an AWD typed-property list: a uint32 byte-length prefix followed by `uint16 key, uint32
// fieldLength, <value>` records. Returns each key's value span so callers decode only the keys they
// know; unknown keys are stepped over by their length.
export function readAwdProperties(
  view: Readonly<DataView>,
  offset: number,
  end: number,
): { end: number; values: Map<number, { length: number; offset: number }> } {
  const dv = view as DataView;
  const values = new Map<number, { length: number; offset: number }>();
  if (offset + 4 > end) return { end: offset, values };

  const listLength = dv.getUint32(offset, true);
  offset += 4;
  const listEnd = Math.min(offset + listLength, end);

  while (offset + 6 <= listEnd) {
    const key = dv.getUint16(offset, true);
    offset += 2;
    const fieldLength = dv.getUint32(offset, true);
    offset += 4;
    if (offset + fieldLength > listEnd) break;
    values.set(key, { length: fieldLength, offset });
    offset += fieldLength;
  }

  return { end: listEnd, values };
}

export function readAwdPropertyFloat32(
  view: Readonly<DataView>,
  values: Readonly<Map<number, { length: number; offset: number }>>,
  key: number,
): number | null {
  const entry = values.get(key);
  if (entry === undefined || entry.length < 4) return null;
  return (view as DataView).getFloat32(entry.offset, true);
}

// Reads a property whose float width the EXPORTER chose. AWD carries a global "wide properties" header
// flag, but every property record is already byte-length prefixed, so the width is self-describing in the
// data: an 8-byte field is a float64, anything else a float32. Reading the record rather than the flag
// keeps a mixed-width or flag-disagreeing file readable, which a flag-driven reader would silently
// misparse into garbage magnitudes.
export function readAwdPropertyNumber(
  view: Readonly<DataView>,
  values: Readonly<Map<number, { length: number; offset: number }>>,
  key: number,
): number | null {
  const entry = values.get(key);
  if (entry === undefined || entry.length < 4) return null;
  const dv = view as DataView;
  return entry.length >= 8 ? dv.getFloat64(entry.offset, true) : dv.getFloat32(entry.offset, true);
}

export function readAwdPropertyUint32(
  view: Readonly<DataView>,
  values: Readonly<Map<number, { length: number; offset: number }>>,
  key: number,
): number | null {
  const entry = values.get(key);
  if (entry === undefined || entry.length < 4) return null;
  return (view as DataView).getUint32(entry.offset, true);
}

export function readAwdPropertyUint8(
  view: Readonly<DataView>,
  values: Readonly<Map<number, { length: number; offset: number }>>,
  key: number,
): number | null {
  const entry = values.get(key);
  if (entry === undefined || entry.length < 1) return null;
  return (view as DataView).getUint8(entry.offset);
}

export function readAwdString(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  offset: number,
): { end: number; value: string } {
  const length = (view as DataView).getUint16(offset, true);
  const stringBytes = (source as Uint8Array).subarray(offset + 2, offset + 2 + length);
  const value = new TextDecoder().decode(stringBytes);
  return { end: offset + 2 + length, value };
}

export function readAwdTransform(
  view: Readonly<DataView>,
  offset: number,
  widePrecision: boolean,
): { end: number; transform: Float64Array } {
  const dv = view as DataView;
  const transform = new Float64Array(12);
  const floatSize = widePrecision ? 8 : 4;
  for (let i = 0; i < 12; i++) {
    transform[i] = widePrecision
      ? dv.getFloat64(offset + i * floatSize, true)
      : dv.getFloat32(offset + i * floatSize, true);
  }
  convertTransformLhToRh(transform);
  return { end: offset + 12 * floatSize, transform };
}

// Skips an AWD attribute list (NumAttrList or UserAttrList). The list is a uint32 byte-length
// prefix followed by that many bytes of attribute data.
export function skipAwdAttrList(view: Readonly<DataView>, offset: number, end: number): number {
  if (offset + 4 > end) return offset;
  const byteLength = (view as DataView).getUint32(offset, true);
  return offset + 4 + byteLength;
}

const _awdTransformScratch = createMatrix4();
