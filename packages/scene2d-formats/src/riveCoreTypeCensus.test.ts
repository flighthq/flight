import type { ImportDiagnostic } from '@flighthq/types/contract';

import { collectRiveCoreTypeCounts, isReadableRive } from './riveCoreTypeCensus.ts';

// Rive core type keys used by the fixtures, from the shipped object model rather than invented: Shape 3,
// Rectangle 7, Path 12, SolidColor 18, Text 134.
const SHAPE = 3;
const RECTANGLE = 7;
const PATH = 12;

describe('collectRiveCoreTypeCounts', () => {
  it('counts each core type present', () => {
    const counts = collectRiveCoreTypeCounts(riveFile([SHAPE, PATH, PATH, RECTANGLE]))!;
    expect(counts.get(SHAPE)).toBe(1);
    expect(counts.get(PATH)).toBe(2);
    expect(counts.get(RECTANGLE)).toBe(1);
  });

  // ★ NULL AND EMPTY ARE DIFFERENT ANSWERS AND BOTH ARE STATED. A corrupt file and a valid file with no
  // objects both produce "no requirements" downstream, so if the census collapsed them a build could not tell
  // a file it failed to read from one that genuinely needs nothing.
  it('returns an empty map for a readable file that declares no objects', () => {
    const counts = collectRiveCoreTypeCounts(riveFile([]));
    expect(counts).not.toBeNull();
    expect(counts!.size).toBe(0);
  });

  it.each([
    ['a bad signature', new Uint8Array([0x4e, 0x4f, 0x50, 0x45, 7, 0, 0])],
    ['an unsupported major version', riveFile([], { major: 6 })],
    ['a truncated stream', new Uint8Array([0x52, 0x49, 0x56, 0x45])],
  ])('returns null for %s', (_label, bytes) => {
    expect(collectRiveCoreTypeCounts(bytes)).toBeNull();
  });

  it('reports why through the diagnostics it is handed', () => {
    const diagnostics: ImportDiagnostic[] = [];
    collectRiveCoreTypeCounts(riveFile([], { major: 6 }), diagnostics);
    expect(diagnostics.map((entry) => entry.kind)).toContain('rive.unsupported-version');
  });
});

describe('isReadableRive', () => {
  it('separates a readable file from one this reader cannot traverse', () => {
    expect(isReadableRive(riveFile([SHAPE]))).toBe(true);
    expect(isReadableRive(riveFile([], { major: 6 }))).toBe(false);
    expect(isReadableRive(new Uint8Array([0x4e, 0x4f, 0x50, 0x45]))).toBe(false);
  });

  // The case the probe exists for: readable, and requires nothing. An analyzer's empty requirement set is only
  // trustworthy when this can be asked separately.
  it('calls an empty document readable', () => {
    expect(isReadableRive(riveFile([]))).toBe(true);
  });
});

// A `.riv` container: 'RIVE', varuint major/minor/fileId, a terminated (here empty) property table of contents,
// then one varuint type key per object each terminated by a zero property key.
function riveFile(typeKeys: readonly number[], header: { major?: number } = {}): Uint8Array {
  const bytes: number[] = [0x52, 0x49, 0x56, 0x45];
  bytes.push(...varUint(header.major ?? 7), ...varUint(0), ...varUint(0));
  bytes.push(0); // empty table of contents
  for (const typeKey of typeKeys) bytes.push(...varUint(typeKey), 0);
  return new Uint8Array(bytes);
}

function varUint(value: number): number[] {
  const out: number[] = [];
  let remaining = value;
  while (remaining > 0x7f) {
    out.push((remaining & 0x7f) | 0x80);
    remaining >>>= 7;
  }
  out.push(remaining);
  return out;
}
