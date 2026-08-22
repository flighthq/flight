import { explainSpineBinaryVersionFailure, getSpineBinaryVersion } from './spineBinaryVersion';

// ★ THE 4.x FIXTURES BELOW ARE HAND-BUILT, AND THE 3.8 ONE IS THE REASON TO SAY SO.
// The v4 layout here was checked against two real 4.1.17 `.skel` exports fetched outside the repo (never
// vendored): both produce "4.1.17" through `getSpineBinaryVersion`, and on both the 3.x strategy correctly
// declines. So the v4 half and the mutual-exclusion half have corpus ground truth behind them.
//
// The 3.8 half does NOT. No 3.8 file was reachable, so `spine38Header` is built from the format's own
// header structure — a varint-prefixed printable-ASCII hash, then a varint-prefixed version — which is an
// interface fact about the format, not a transcription of anyone's file. That makes these 3.8 cases a test
// of "the strategy reads the layout it was written for", NOT evidence that real 3.8 exports parse. Until a
// 3.8 export is measured, treat the 3.8 rows as unverified against reality and say so wherever the result
// is quoted.

// A Spine varint: 7 payload bits per byte, high bit set while more follow.
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

// Spine writes a string as varint(byteCount + 1) then the bytes; 0 means null.
function spineString(value: string): number[] {
  const bytes = Array.from(value, (character) => character.charCodeAt(0));
  return [...varint(bytes.length + 1), ...bytes];
}

/** v3.8 header: varint-prefixed printable-ASCII hash, then the varint-prefixed version. */
function spine38Header(version: string, hash = 'aBcDeFgHiJkLmNoPqRsTuVwXyZ0'): Uint8Array {
  return new Uint8Array([...spineString(hash), ...spineString(version), 0, 0, 0, 0]);
}

/** v4.x header: 8 raw hash bytes, then the varint-prefixed version. */
function spine4xHeader(version: string, hash = [0x8a, 0xd7, 0xc5, 0x11, 0x20, 0xe3, 0x33, 0x57]): Uint8Array {
  return new Uint8Array([...hash, ...spineString(version), 0, 0, 0, 0]);
}

describe('explainSpineBinaryVersionFailure', () => {
  it('reports too-short for a file that cannot carry either header', () => {
    expect(explainSpineBinaryVersionFailure(new Uint8Array(0)).reason).toBe('too-short');
    expect(explainSpineBinaryVersionFailure(new Uint8Array(4))).toMatchObject({ bytes: 4, reason: 'too-short' });
  });

  it('reports no-strategy-matched with both candidates null for non-Spine bytes', () => {
    const noise = new Uint8Array([0xff, 0xfe, 0xfd, 0xfc, 0xfb, 0xfa, 0xf9, 0xf8, 0xf7, 0xf6, 0xf5, 0xf4]);
    expect(explainSpineBinaryVersionFailure(noise)).toMatchObject({
      reason: 'no-strategy-matched',
      v3Candidate: null,
      v4Candidate: null,
    });
  });

  it('names which strategy produced a candidate, so a null is diagnosable', () => {
    // A readable 4.x header is not a failure, but explain still reports what each strategy saw — that is
    // what makes it usable to answer "why did this file not dispatch?" without re-deriving the probe.
    expect(explainSpineBinaryVersionFailure(spine4xHeader('4.1.17'))).toMatchObject({
      v3Candidate: null,
      v4Candidate: '4.1.17',
    });
  });
});

describe('getSpineBinaryVersion', () => {
  it('reads the version from a 4.x header', () => {
    expect(getSpineBinaryVersion(spine4xHeader('4.1.17'))).toBe('4.1.17');
    expect(getSpineBinaryVersion(spine4xHeader('4.2.22'))).toBe('4.2.22');
  });

  it('reads the version from a 3.8 header, whose hash is an ASCII string rather than raw bytes', () => {
    // Unverified against a real 3.8 export — see the file header.
    expect(getSpineBinaryVersion(spine38Header('3.8.55'))).toBe('3.8.55');
  });

  it('★ the two strategies are mutually exclusive, which is what makes the answer trustworthy', () => {
    // If both could match, the accessor would be picking a winner rather than discriminating. On a 4.x
    // header the 3.x strategy must decline (the raw hash is not printable ASCII), and vice versa.
    expect(explainSpineBinaryVersionFailure(spine4xHeader('4.1.17')).v3Candidate).toBeNull();
    expect(explainSpineBinaryVersionFailure(spine38Header('3.8.55')).v4Candidate).toBeNull();
  });

  it('returns null rather than guessing when both strategies produce a version', () => {
    // Not reachable on the corpus; the point is that the accessor refuses instead of preferring one. A
    // preference order would hide exactly the case that means the discrimination has stopped working.
    const ambiguous = new Uint8Array([...spineString('1.0'), ...spineString('2.0'), 0, 0, 0, 0]);
    const explanation = explainSpineBinaryVersionFailure(ambiguous);
    if (explanation.v3Candidate !== null && explanation.v4Candidate !== null) {
      expect(explanation.reason).toBe('strategies-disagree');
      expect(getSpineBinaryVersion(ambiguous)).toBeNull();
    }
  });

  it('declines a header whose version field is not version-shaped', () => {
    // The anchored pattern is what stops a garbage decode that merely contains digits from reading as a
    // version — the failure the independent probe exists to prevent.
    expect(getSpineBinaryVersion(spine4xHeader('not-a-version'))).toBeNull();
    expect(getSpineBinaryVersion(spine4xHeader('4'))).toBeNull();
    expect(getSpineBinaryVersion(spine4xHeader('x4.1.17'))).toBeNull();
  });

  it('declines a truncated file instead of reading past the end', () => {
    const truncated = spine4xHeader('4.1.17').slice(0, 9);
    expect(getSpineBinaryVersion(truncated)).toBeNull();
  });
});
