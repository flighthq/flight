import type { ImportDiagnostic } from '@flighthq/types/contract';
import { RiveFieldType } from '@flighthq/types/contract';

import { parseRiveDocument } from './riveDocument';

// WHAT THESE TESTS DO AND DO NOT PROVE. No real .riv has ever been decoded here, so the container
// GRAMMAR — the fingerprint, the header field order, and the four-keys-per-word table packing — is
// asserted only for internal consistency: the fixtures are bytes this suite writes. What IS proven
// independently is every primitive the grammar is built from, because each has a definition outside
// this codebase: LEB128 is written here from its arithmetic definition (base-128 groups, low first)
// rather than by mirroring the decoder's loop, and the float and integer cases assert against
// IEEE-754 and little-endian byte patterns taken from those standards. Cursor discipline is the
// third real check: a single byte of drift anywhere collapses a multi-object stream, so recovering
// K objects in order is a structural assertion the byte layout is self-consistent.

describe('parseRiveDocument', () => {
  it('rejects a file whose fingerprint is not RIVE', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const bytes = new Uint8Array([0x52, 0x49, 0x56, 0x58, 0x01]);

    expect(parseRiveDocument(bytes, diagnostics)).toBeNull();
    expect(diagnostics.map((diagnostic) => diagnostic.kind)).toEqual(['rive.invalid-header']);
  });

  it('rejects a file too short to hold a fingerprint', () => {
    expect(parseRiveDocument(new Uint8Array([0x52, 0x49]))).toBeNull();
  });

  it('reads the header versions and file id', () => {
    const document = parseRiveDocument(buildRiveFile({ fileId: 1234567, major: 7, minor: 3 }, [], []))!;

    expect(document.header).toMatchObject({ fileId: 1234567, majorVersion: 7, minorVersion: 3 });
  });

  // Written from the LEB128 definition itself: the value is the sum of seven-bit groups weighted by
  // ascending powers of 128, so encoding is repeated division and the expectation is arithmetic, not
  // a copy of how the reader loops.
  it.each([0, 1, 63, 127, 128, 129, 300, 16383, 16384, 2097151, 2097152, 4294967295, 68719476735])(
    'round-trips the varuint %i against its arithmetic definition',
    (value) => {
      const document = parseRiveDocument(buildRiveFile({ fileId: value, major: 1, minor: 0 }, [], []))!;

      expect(document.header.fileId).toBe(value);
    },
  );

  it('reads a float property as little-endian IEEE-754 binary32', () => {
    // Bit patterns from the standard, not from this implementation.
    const cases = [
      { bytes: [0x00, 0x00, 0x80, 0x3f], value: 1 },
      { bytes: [0x00, 0x00, 0x00, 0x00], value: 0 },
      { bytes: [0x00, 0x00, 0x80, 0xbf], value: -1 },
      { bytes: [0x00, 0x00, 0x20, 0x41], value: 10 },
      { bytes: [0xdb, 0x0f, 0x49, 0x40], value: 3.14159274101257324 },
    ];
    for (const { bytes, value } of cases) {
      const document = parseRiveDocument(
        buildRiveFile(
          { fileId: 0, major: 1, minor: 0 },
          [{ key: 20, type: RiveFieldType.Double }],
          [{ properties: [{ key: 20, raw: bytes }], typeKey: 1 }],
        ),
      )!;

      expect(document.objects[0].properties[0].value).toBeCloseTo(value, 6);
    }
  });

  it('reads a color property as a little-endian unsigned 32-bit value', () => {
    const document = parseRiveDocument(
      buildRiveFile(
        { fileId: 0, major: 1, minor: 0 },
        [{ key: 37, type: RiveFieldType.Color }],
        [{ properties: [{ key: 37, raw: [0x44, 0x33, 0x22, 0xff] }], typeKey: 20 }],
      ),
    )!;

    // 0xff223344 exceeds the signed range, so a sign-extending read would surface it negative.
    expect(document.objects[0].properties[0].value).toBe(0xff223344);
  });

  it('reads a string property as varuint length followed by UTF-8 bytes', () => {
    const text = 'Artboard ünï✓';
    const encoded = Array.from(new TextEncoder().encode(text));
    const document = parseRiveDocument(
      buildRiveFile(
        { fileId: 0, major: 1, minor: 0 },
        [{ key: 55, type: RiveFieldType.String }],
        [{ properties: [{ key: 55, raw: [...encodeVarUint(encoded.length), ...encoded] }], typeKey: 23 }],
      ),
    )!;

    expect(document.objects[0].properties[0].value).toBe(text);
  });

  // The table packs two-bit codes four to a 32-bit word, NOT sixteen. If the reader consumed one
  // word per sixteen keys, the object stream would begin at the wrong offset for any key count above
  // four, so recovering the objects at all is what proves the word count.
  it.each([1, 3, 4, 5, 8, 9, 17])('keeps the stream aligned with %i table entries', (count) => {
    const table = Array.from({ length: count }, (_, index) => ({
      key: index + 10,
      type: [RiveFieldType.Uint, RiveFieldType.Double, RiveFieldType.Color, RiveFieldType.String][index % 4],
    }));
    const document = parseRiveDocument(
      buildRiveFile({ fileId: 0, major: 1, minor: 0 }, table, [
        { properties: [], typeKey: 91 },
        { properties: [], typeKey: 92 },
      ]),
    )!;

    expect(document.header.tableOfContents).toEqual(table);
    expect(document.objects.map((object) => object.typeKey)).toEqual([91, 92]);
  });

  it('recovers every object in a mixed stream, which only holds if the cursor never drifts', () => {
    const table = [
      { key: 10, type: RiveFieldType.Uint },
      { key: 11, type: RiveFieldType.Double },
      { key: 12, type: RiveFieldType.Color },
      { key: 13, type: RiveFieldType.String },
    ];
    const hello = Array.from(new TextEncoder().encode('hello'));
    const document = parseRiveDocument(
      buildRiveFile({ fileId: 0, major: 1, minor: 0 }, table, [
        { properties: [{ key: 10, raw: encodeVarUint(300) }], typeKey: 1 },
        { properties: [], typeKey: 2 },
        {
          properties: [
            { key: 11, raw: [0x00, 0x00, 0x80, 0x3f] },
            { key: 13, raw: [...encodeVarUint(hello.length), ...hello] },
            { key: 12, raw: [0x01, 0x02, 0x03, 0x04] },
          ],
          typeKey: 3,
        },
        { properties: [{ key: 10, raw: encodeVarUint(1) }], typeKey: 4 },
      ]),
    )!;

    expect(document.objects.map((object) => object.typeKey)).toEqual([1, 2, 3, 4]);
    expect(document.objects[0].properties[0].value).toBe(300);
    expect(document.objects[2].properties.map((property) => property.key)).toEqual([11, 13, 12]);
    expect(document.objects[2].properties[1].value).toBe('hello');
    expect(document.objects[3].properties[0].value).toBe(1);
  });

  it('stops rather than guessing when a property key has no declared width', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const bytes = buildRiveFile(
      { fileId: 0, major: 1, minor: 0 },
      [{ key: 10, type: RiveFieldType.Uint }],
      [{ properties: [{ key: 99, raw: [0x05] }], typeKey: 1 }],
    );

    // Key 99 is absent from the table, so the width of its value is unknown and every byte after it
    // is unaddressable. Resynchronizing on a guess would invent a document.
    expect(parseRiveDocument(bytes, diagnostics)).toBeNull();
    expect(diagnostics.map((diagnostic) => diagnostic.kind)).toEqual(['rive.unknown-property-width']);
  });

  it('rejects a stream truncated mid-value', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const complete = buildRiveFile(
      { fileId: 0, major: 1, minor: 0 },
      [{ key: 11, type: RiveFieldType.Double }],
      [{ properties: [{ key: 11, raw: [0x00, 0x00, 0x80, 0x3f] }], typeKey: 1 }],
    );

    expect(parseRiveDocument(complete.slice(0, complete.length - 2), diagnostics)).toBeNull();
    expect(diagnostics.map((diagnostic) => diagnostic.kind)).toEqual(['rive.truncated-object-stream']);
  });

  it('reads a boolean-width value as a one-byte varuint', () => {
    // A boolean travels as a single byte valued 0 or 1, byte-identical to a one-byte varuint, which
    // is why the two-bit table needs no code of its own for it.
    const document = parseRiveDocument(
      buildRiveFile(
        { fileId: 0, major: 1, minor: 0 },
        [{ key: 14, type: RiveFieldType.Uint }],
        [
          { properties: [{ key: 14, raw: [0x01] }], typeKey: 1 },
          { properties: [{ key: 14, raw: [0x00] }], typeKey: 1 },
        ],
      ),
    )!;

    expect(document.objects.map((object) => object.properties[0].value)).toEqual([1, 0]);
  });
});

/** Encodes an unsigned LEB128 from the definition — base-128 groups, least significant first. */
function encodeVarUint(value: number): number[] {
  const bytes: number[] = [];
  let remaining = value;
  do {
    const group = remaining % 128;
    remaining = Math.floor(remaining / 128);
    bytes.push(remaining > 0 ? group + 128 : group);
  } while (remaining > 0);
  return bytes;
}

function encodeUint32LittleEndian(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function buildRiveFile(
  header: { fileId: number; major: number; minor: number },
  table: ReadonlyArray<{ key: number; type: number }>,
  objects: ReadonlyArray<{ properties: ReadonlyArray<{ key: number; raw: readonly number[] }>; typeKey: number }>,
): Uint8Array {
  const bytes: number[] = [0x52, 0x49, 0x56, 0x45];
  bytes.push(...encodeVarUint(header.major), ...encodeVarUint(header.minor), ...encodeVarUint(header.fileId));
  for (const entry of table) bytes.push(...encodeVarUint(entry.key));
  bytes.push(0);

  // Four two-bit codes per 32-bit word, occupying only that word's low byte.
  for (let index = 0; index < table.length; index += 4) {
    let word = 0;
    for (let slot = 0; slot < 4 && index + slot < table.length; slot++) {
      word |= (table[index + slot].type & 3) << (slot * 2);
    }
    bytes.push(...encodeUint32LittleEndian(word));
  }

  for (const object of objects) {
    bytes.push(...encodeVarUint(object.typeKey));
    for (const property of object.properties) bytes.push(...encodeVarUint(property.key), ...property.raw);
    bytes.push(0);
  }
  return new Uint8Array(bytes);
}
