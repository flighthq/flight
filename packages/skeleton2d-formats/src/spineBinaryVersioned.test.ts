import type { ImportDiagnostic, Skeleton2DImport } from '@flighthq/types/contract';

import {
  parseSpineSkeletonBinaryVersioned,
  registerSpineSkeletonBinaryParser,
  toSpineBinaryLayoutKey,
} from './spineBinaryVersioned';

function varint(value: number): number[] {
  const out: number[] = [];
  let remaining = value;
  while (remaining > 0x7f) {
    out.push((remaining & 0x7f) | 0x80);
    remaining >>>= 7;
  }
  out.push(remaining);
  return out;
}

function spineString(value: string): number[] {
  const bytes = [...Buffer.from(value, 'utf8')];
  return [...varint(bytes.length + 1), ...bytes];
}

function spine4xHeader(version: string): Uint8Array {
  return new Uint8Array([0x8a, 0xd7, 0xc5, 0x11, 0x20, 0xe3, 0x33, 0x57, ...spineString(version), 0, 0, 0, 0]);
}

// A distinguishable stand-in: these tests assert WHICH parser ran and that its result is returned
// unchanged, so the object needs identity, not a faithful skeleton.
function emptyImport(): Skeleton2DImport {
  return { animations: [], bones: [], skins: [], slots: [] } as unknown as Skeleton2DImport;
}

describe('parseSpineSkeletonBinaryVersioned', () => {
  it('reports header-unreadable — not version-unsupported — when the header is not readable at all', () => {
    // ★ THE TWO REFUSALS ARE DIFFERENT CLAIMS. This one says "may not be a Spine binary"; the other says
    // "definitely Spine, layout not implemented". Collapsing them loses the distinction a conformance
    // scorer needs, so the diagnostic key is asserted, not just the null.
    const diagnostics: ImportDiagnostic[] = [];
    expect(parseSpineSkeletonBinaryVersioned(new Uint8Array([1, 2, 3]), diagnostics)).toBeNull();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ kind: 'spine.binary-header-unreadable' });
    expect(diagnostics[0].detail).toMatchObject({ bytes: 3 });
  });

  it('reports version-unsupported WITH the real version for a readable but unregistered layout', () => {
    // The version string is the payload that makes this actionable: "3.8 known unimplemented" reads
    // differently from "99.0 unknown format", and before the independent probe this crumb could carry a
    // garbage string decoded through the wrong header.
    const diagnostics: ImportDiagnostic[] = [];
    expect(parseSpineSkeletonBinaryVersioned(spine4xHeader('9.9.9'), diagnostics)).toBeNull();
    expect(diagnostics[0]).toMatchObject({ kind: 'spine.binary-version-unsupported' });
    expect(diagnostics[0].detail).toMatchObject({ version: '9.9.9' });
  });

  it('dispatches to the parser registered for the file major.minor', () => {
    const seen: string[] = [];
    const result = emptyImport();
    registerSpineSkeletonBinaryParser('7.3', () => {
      seen.push('7.3');
      return result;
    });
    expect(parseSpineSkeletonBinaryVersioned(spine4xHeader('7.3.11'))).toBe(result);
    expect(seen).toEqual(['7.3']);
  });

  it('keys on major.minor, so a patch bump dispatches without re-registering', () => {
    const result = emptyImport();
    registerSpineSkeletonBinaryParser('7.4', () => result);
    // Same layout, different patch — the registry must not require a new entry per patch release.
    expect(parseSpineSkeletonBinaryVersioned(spine4xHeader('7.4.0'))).toBe(result);
    expect(parseSpineSkeletonBinaryVersioned(spine4xHeader('7.4.99'))).toBe(result);
  });

  it('registers last-write-wins, so an application can substitute its own parser', () => {
    const first = emptyImport();
    const second = emptyImport();
    registerSpineSkeletonBinaryParser('7.5', () => first);
    registerSpineSkeletonBinaryParser('7.5', () => second);
    expect(parseSpineSkeletonBinaryVersioned(spine4xHeader('7.5.1'))).toBe(second);
  });

  it('passes the caller diagnostics array through to the delegated parser', () => {
    // The leaf must be able to add its own crumbs to the caller's array; a registry that swallowed them
    // would make a degraded parse indistinguishable from a clean one.
    registerSpineSkeletonBinaryParser('7.6', (_bytes, diagnostics) => {
      diagnostics?.push({ kind: 'test.leaf-was-here' } as unknown as ImportDiagnostic);
      return emptyImport();
    });
    const diagnostics: ImportDiagnostic[] = [];
    parseSpineSkeletonBinaryVersioned(spine4xHeader('7.6.0'), diagnostics);
    expect(diagnostics.map((entry) => entry.kind)).toEqual(['test.leaf-was-here']);
  });

  it('an unregistered version is refused even though a NEARBY version is registered', () => {
    // The registry contents are the gate. Registering 7.7 must not admit 7.8 — that widening is exactly
    // the `startsWith('4.')` prefix defect that let 23 real 4.2 exports into a 4.1 reader.
    registerSpineSkeletonBinaryParser('7.7', () => emptyImport());
    const diagnostics: ImportDiagnostic[] = [];
    expect(parseSpineSkeletonBinaryVersioned(spine4xHeader('7.8.0'), diagnostics)).toBeNull();
    expect(diagnostics[0]).toMatchObject({ kind: 'spine.binary-version-unsupported' });
  });
});

describe('toSpineBinaryLayoutKey', () => {
  it('folds a full version to its major.minor layout key', () => {
    expect(toSpineBinaryLayoutKey('4.1.17')).toBe('4.1');
    expect(toSpineBinaryLayoutKey('3.8.55')).toBe('3.8');
    expect(toSpineBinaryLayoutKey('4.2')).toBe('4.2');
  });

  it('returns a minor-less version unchanged rather than inventing .0', () => {
    // Padding "4" to "4.0" would dispatch it to a layout nobody registered for it.
    expect(toSpineBinaryLayoutKey('4')).toBe('4');
  });
});
