import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type {
  ImportDiagnostic,
  RiveCoreObject,
  RiveDocument,
  RiveDocumentHeader,
  RiveProperty,
  RivePropertyFieldType,
  RiveValue,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, RiveFieldType } from '@flighthq/types/contract';

import { getRiveCorePropertyFieldType } from './riveCoreProperties';

/**
 * Decodes the `.riv` container into its header and flat core-object stream. This is the format's
 * bedrock layer and performs no interpretation: type keys and property keys stay numeric, and
 * building artboards, shapes, or animations out of them belongs to later stages.
 *
 * Returns null for a file that cannot be traversed, which includes the one case the format itself
 * cannot recover from — a property key whose width is declared neither by the reader nor by the
 * file's own table of contents, after which the byte position is no longer known.
 */
export function parseRiveDocument(source: Readonly<Uint8Array>, diagnostics?: ImportDiagnostic[]): RiveDocument | null {
  const cursor: RiveCursor = { bytes: source, overflowed: false, position: 0, unknownPropertyKey: 0 };
  const header = readRiveHeader(cursor);
  if (header === null) {
    reportRiveReject(diagnostics, 'rive.invalid-header');
    return null;
  }

  const fieldTypes = new Map<number, number>();
  for (const entry of header.tableOfContents) fieldTypes.set(entry.key, entry.type);

  const objects: RiveCoreObject[] = [];
  while (cursor.position < cursor.bytes.length) {
    const object = readRiveCoreObject(cursor, fieldTypes);
    if (object === null) {
      if (cursor.overflowed) reportRiveReject(diagnostics, 'rive.truncated-object-stream');
      else reportRiveReject(diagnostics, 'rive.unknown-property-width', { propertyKey: cursor.unknownPropertyKey });
      return null;
    }
    objects.push(object);
  }
  return { header, objects };
}

interface RiveCursor {
  bytes: Readonly<Uint8Array>;
  overflowed: boolean;
  position: number;
  unknownPropertyKey: number;
}

function readRiveHeader(cursor: RiveCursor): RiveDocumentHeader | null {
  // The four-byte fingerprint is ASCII "RIVE".
  if (cursor.bytes.length < 4) return null;
  for (let index = 0; index < 4; index++) {
    if (cursor.bytes[index] !== RIVE_FINGERPRINT[index]) return null;
  }
  cursor.position = 4;

  const majorVersion = readRiveVarUint(cursor);
  const minorVersion = readRiveVarUint(cursor);
  const fileId = readRiveVarUint(cursor);
  if (cursor.overflowed) return null;

  const keys: number[] = [];
  for (let key = readRiveVarUint(cursor); key !== 0; key = readRiveVarUint(cursor)) {
    if (cursor.overflowed) return null;
    keys.push(key);
  }
  if (cursor.overflowed) return null;

  // Each field code is two bits, but only the low eight bits of every 32-bit word are used, so a
  // word carries four keys and not sixteen. Reading this as a dense bitmap silently desynchronizes.
  const tableOfContents: RivePropertyFieldType[] = [];
  let word = 0;
  let bit = FIELD_TYPE_BITS_PER_WORD;
  for (const key of keys) {
    if (bit === FIELD_TYPE_BITS_PER_WORD) {
      word = readRiveUint32(cursor);
      bit = 0;
      if (cursor.overflowed) return null;
    }
    tableOfContents.push({ key, type: toRiveFieldType((word >>> bit) & 3) });
    bit += 2;
  }
  return { fileId, majorVersion, minorVersion, tableOfContents };
}

function readRiveCoreObject(cursor: RiveCursor, fieldTypes: ReadonlyMap<number, number>): RiveCoreObject | null {
  const typeKey = readRiveVarUint(cursor);
  if (cursor.overflowed) return null;

  const properties: RiveProperty[] = [];
  for (;;) {
    const key = readRiveVarUint(cursor);
    if (cursor.overflowed) return null;
    if (key === 0) return { properties, typeKey };

    // The built-in object model answers first and the file's table supplements it, which is the
    // order the format needs: a file using only standard properties ships an empty table. Without a
    // width from either, the next key's position is unknowable, so the stream ends here rather than
    // resynchronizing on a guess.
    const type = getRiveCorePropertyFieldType(key) ?? fieldTypes.get(key);
    if (type === undefined) {
      cursor.unknownPropertyKey = key;
      return null;
    }

    const value = readRiveValue(cursor, type);
    if (cursor.overflowed) return null;
    properties.push({ key, type: toRiveFieldType(type), value });
  }
}

function readRiveValue(cursor: RiveCursor, type: number): RiveValue {
  if (type === RiveFieldType.String) return readRiveString(cursor);
  if (type === RiveFieldType.Double) return readRiveFloat32(cursor);
  if (type === RiveFieldType.Color) return readRiveUint32(cursor);
  return readRiveVarUint(cursor);
}

function readRiveVarUint(cursor: RiveCursor): number {
  // Unsigned LEB128: seven payload bits per byte, low group first, high bit continues.
  let result = 0;
  let shift = 0;
  for (;;) {
    if (cursor.position >= cursor.bytes.length) {
      cursor.overflowed = true;
      return 0;
    }
    const byte = cursor.bytes[cursor.position++];
    // Multiplication rather than a shift: beyond 31 bits the bitwise operators would wrap.
    result += (byte & 0x7f) * Math.pow(2, shift);
    if ((byte & 0x80) === 0) return result;
    shift += 7;
  }
}

function readRiveUint32(cursor: RiveCursor): number {
  if (cursor.position + 4 > cursor.bytes.length) {
    cursor.overflowed = true;
    return 0;
  }
  const bytes = cursor.bytes;
  const position = cursor.position;
  cursor.position += 4;
  return (
    (bytes[position] | (bytes[position + 1] << 8) | (bytes[position + 2] << 16) | (bytes[position + 3] << 24)) >>> 0
  );
}

function readRiveFloat32(cursor: RiveCursor): number {
  if (cursor.position + 4 > cursor.bytes.length) {
    cursor.overflowed = true;
    return 0;
  }
  _floatBytes[0] = cursor.bytes[cursor.position];
  _floatBytes[1] = cursor.bytes[cursor.position + 1];
  _floatBytes[2] = cursor.bytes[cursor.position + 2];
  _floatBytes[3] = cursor.bytes[cursor.position + 3];
  cursor.position += 4;
  return _floatView.getFloat32(0, true);
}

function readRiveString(cursor: RiveCursor): string {
  const length = readRiveVarUint(cursor);
  if (cursor.overflowed || cursor.position + length > cursor.bytes.length) {
    cursor.overflowed = true;
    return '';
  }
  const start = cursor.position;
  cursor.position += length;
  return decodeRiveUtf8(cursor.bytes, start, length);
}

// Decoded in place rather than through TextDecoder so the reader stays inside the lowerable subset
// and carries no host-environment dependency.
function decodeRiveUtf8(bytes: Readonly<Uint8Array>, start: number, length: number): string {
  let result = '';
  let index = start;
  const end = start + length;
  while (index < end) {
    const first = bytes[index++];
    if (first < 0x80) {
      result += String.fromCharCode(first);
      continue;
    }
    if (first < 0xe0) {
      result += String.fromCharCode(((first & 0x1f) << 6) | (bytes[index++] & 0x3f));
      continue;
    }
    if (first < 0xf0) {
      result += String.fromCharCode(((first & 0x0f) << 12) | ((bytes[index++] & 0x3f) << 6) | (bytes[index++] & 0x3f));
      continue;
    }
    const point =
      (((first & 0x07) << 18) |
        ((bytes[index++] & 0x3f) << 12) |
        ((bytes[index++] & 0x3f) << 6) |
        (bytes[index++] & 0x3f)) -
      0x10000;
    result += String.fromCharCode(0xd800 + (point >> 10), 0xdc00 + (point & 0x3ff));
  }
  return result;
}

function toRiveFieldType(value: number): RiveProperty['type'] {
  if (value === RiveFieldType.String) return RiveFieldType.String;
  if (value === RiveFieldType.Double) return RiveFieldType.Double;
  if (value === RiveFieldType.Color) return RiveFieldType.Color;
  return RiveFieldType.Uint;
}

function reportRiveReject(
  diagnostics: ImportDiagnostic[] | undefined,
  kind: string,
  detail?: Readonly<Record<string, number>>,
): void {
  reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, kind, 'parseRiveDocument', detail);
}

const RIVE_FINGERPRINT = [0x52, 0x49, 0x56, 0x45];
const FIELD_TYPE_BITS_PER_WORD = 8;
const _floatView = new DataView(new ArrayBuffer(4));
const _floatBytes = new Uint8Array(_floatView.buffer);
