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
  const bytes = Array.from(value, (character) => character.charCodeAt(0));
  return [...varint(bytes.length + 1), ...bytes];
}

/** v3.8 header: varint-prefixed printable-ASCII hash, then the varint-prefixed version. */
function spine38Header(version: string, hash = 'aBcDeFgHiJkLmNoPqRsTuVwXyZ0'): Uint8Array {
  return new Uint8Array([...spineString(hash), ...spineString(version), 0, 0, 0, 0]);
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

describe('registerSpineSkeletonBinaryParser', () => {
  it('makes a previously refused version dispatch, and only that version', () => {
    // Registration IS the gate, so the observable effect of registering is that one version stops being
    // refused. Asserting the before/after pair pins that the gate is the registry contents rather than
    // anything the file itself asserts.
    const before: ImportDiagnostic[] = [];
    expect(parseSpineSkeletonBinaryVersioned(spine4xHeader('8.1.0'), before)).toBeNull();
    expect(before[0]).toMatchObject({ kind: 'spine.binary-version-unsupported' });

    const result = emptyImport();
    registerSpineSkeletonBinaryParser('8.1', () => result);

    const after: ImportDiagnostic[] = [];
    expect(parseSpineSkeletonBinaryVersioned(spine4xHeader('8.1.0'), after)).toBe(result);
    expect(after).toEqual([]);
    // The neighbouring version is untouched — registering never widens.
    expect(parseSpineSkeletonBinaryVersioned(spine4xHeader('8.2.0'))).toBeNull();
  });

  it('accepts a full version string and folds it to the layout key', () => {
    const result = emptyImport();
    registerSpineSkeletonBinaryParser('8.3.42', () => result);
    expect(parseSpineSkeletonBinaryVersioned(spine4xHeader('8.3.7'))).toBe(result);
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

// ★ THE RULED STATE OF 3.8 AND 4.2: RECOGNIZED VERSION, LAYOUT UNSUPPORTED.
// Neither body layout is implemented and neither is registered — deliberately, because no corpus
// evidences them and a guessed layout does not fail loudly (23 real 4.2 exports read through the 4.1
// body produced a valid-looking import with zero bones). What IS settled is how they must be REFUSED,
// so it is pinned here rather than left as a property of an empty registry that a later registration
// could quietly change.
//
// The distinction these assert is the load-bearing one: `version-unsupported` says "this is Spine, we
// know exactly which, we have no layout for it" and carries the real version; `header-unreadable` says
// "this may not be a Spine binary at all". Before the independent probe a 3.8 file could hit the first
// path carrying a GARBAGE version string decoded through the 4.x header — that is the gap the record
// names, and these are the tests that keep it closed.
describe('unsupported-but-recognized Spine layouts', () => {
  const cases = [
    { header: () => spine38Header('3.8.55'), label: '3.8', version: '3.8.55' },
    { header: () => spine4xHeader('4.2.22'), label: '4.2', version: '4.2.22' },
  ] as const;

  for (const { header, label, version } of cases) {
    it(`refuses ${label} as version-unsupported carrying its REAL version, not a garbage decode`, () => {
      const diagnostics: ImportDiagnostic[] = [];
      expect(parseSpineSkeletonBinaryVersioned(header(), diagnostics)).toBeNull();
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]).toMatchObject({ kind: 'spine.binary-version-unsupported' });
      // The exact string is the point — a scorer categorizes "3.8, known unimplemented" differently
      // from "unknown format", and it can only do that if the version survives intact.
      expect(diagnostics[0].detail).toMatchObject({ version });
    });

    it(`does NOT report ${label} as header-unreadable — the header was read fine`, () => {
      const diagnostics: ImportDiagnostic[] = [];
      parseSpineSkeletonBinaryVersioned(header(), diagnostics);
      expect(diagnostics.map((entry) => entry.kind)).not.toContain('spine.binary-header-unreadable');
    });
  }

  it('a file that is not Spine at all still reports header-unreadable, so the two stay separable', () => {
    // The contrast case. Without it, "3.8 reports version-unsupported" would be consistent with an
    // implementation that reports version-unsupported for everything.
    const diagnostics: ImportDiagnostic[] = [];
    parseSpineSkeletonBinaryVersioned(
      new Uint8Array([0xff, 0xfe, 0xfd, 0xfc, 0xfb, 0xfa, 0xf9, 0xf8, 0xf7, 0xf6]),
      diagnostics,
    );
    expect(diagnostics.map((entry) => entry.kind)).toEqual(['spine.binary-header-unreadable']);
  });
});
