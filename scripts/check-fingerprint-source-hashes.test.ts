import {
  checkFingerprintSourceHashes,
  FINGERPRINT_SOURCE_HASH_ALLOWANCES,
  formatFingerprintSourceHashReport,
} from './check-fingerprint-source-hashes';

describe('fingerprint source-hash completeness', () => {
  it('accepts a partial legacy column while labelling its named allowance and migration state', () => {
    const allowance = FINGERPRINT_SOURCE_HASH_ALLOWANCES[0];
    const report = checkFingerprintSourceHashes(
      [baseline(allowance.path, allowance.renderer, { fingerprint: 'coarse', sourceHash: 'scene' })],
      [allowance],
    );

    expect(report).toMatchObject({
      allowances: [{ state: 'partial' }],
      fingerprintColumns: 1,
      full: 0,
      partial: 1,
      unavailable: 0,
      violations: [],
    });
    expect(formatFingerprintSourceHashReport(report)).toContain(
      `${allowance.path}:${allowance.renderer} [PROVENANCE-PARTIAL sourceHash recorded; allowance ready] — ${allowance.reason}`,
    );
  });

  it('prefers full provenance over a disagreeing legacy sourceHash and counts the column once', () => {
    const report = checkFingerprintSourceHashes(
      [
        baseline('functional/baselines/mixed.json', 'webgl', {
          fingerprint: 'coarse',
          sourceHash: 'legacy',
          fingerprintProvenance: provenance('full'),
        }),
      ],
      [],
    );

    expect(report).toMatchObject({ fingerprintColumns: 1, full: 1, partial: 0, violations: [] });
    expect(formatFingerprintSourceHashReport(report)).toContain('full provenance 1; PROVENANCE-PARTIAL 0');
  });

  it('accepts EVERY named case, however many there are, only when both exact hashes are absent', () => {
    // Counts derive from the allowance list rather than repeating its length. This test takes its
    // INPUTS from that array, so a hardcoded total reads list-derived while pinning the list's size:
    // removing an allowance then fails here for the wrong reason, naming a count instead of the
    // behaviour. The title carries no number for the same reason.
    const named = FINGERPRINT_SOURCE_HASH_ALLOWANCES.length;
    const inputs = combineAllowances(FINGERPRINT_SOURCE_HASH_ALLOWANCES);
    const report = checkFingerprintSourceHashes(inputs, FINGERPRINT_SOURCE_HASH_ALLOWANCES);

    expect(report).toMatchObject({
      fingerprintColumns: named,
      full: 0,
      partial: 0,
      unavailable: named,
      violations: [],
    });
    expect(report.allowances.every((entry) => entry.state === 'unavailable')).toBe(true);
    expect(formatFingerprintSourceHashReport(report)).toContain(
      `full provenance 0; PROVENANCE-PARTIAL 0; ${named} honest gaps`,
    );
    // Non-vacuous: an empty list would satisfy every assertion above.
    expect(named).toBeGreaterThan(0);
  });

  it('fails an ordinary fingerprint column without sourceHash', () => {
    const report = checkFingerprintSourceHashes(
      [baseline('functional/baselines/ordinary.json', 'canvas', { fingerprint: 'coarse' })],
      [],
    );

    expect(report.violations).toEqual([
      {
        detail: 'fingerprint column has no non-empty sourceHash and is not a named unavailable case',
        path: 'functional/baselines/ordinary.json',
        renderer: 'canvas',
      },
    ]);
  });

  it('does not let a named allowance hide a sha256-backed omission', () => {
    const allowance = FINGERPRINT_SOURCE_HASH_ALLOWANCES[0];
    const report = checkFingerprintSourceHashes(
      [baseline(allowance.path, allowance.renderer, { fingerprint: 'coarse', sha256: 'pixels' })],
      [allowance],
    );

    expect(report.allowances[0]?.state).toBe('invalid');
    expect(report.violations[0]?.detail).toBe(
      'named unavailability is valid only when both sourceHash and sha256 are absent',
    );
  });

  it('requires sourceHash to be absent rather than empty in a named case', () => {
    const allowance = FINGERPRINT_SOURCE_HASH_ALLOWANCES[0];
    const report = checkFingerprintSourceHashes(
      [baseline(allowance.path, allowance.renderer, { fingerprint: 'coarse', sourceHash: '' })],
      [allowance],
    );

    expect(report.allowances[0]?.state).toBe('invalid');
    expect(report.violations).toHaveLength(1);
  });

  it('fails malformed baseline JSON', () => {
    const report = checkFingerprintSourceHashes([{ path: 'functional/baselines/broken.json', text: '{' }], []);

    expect(report.violations).toHaveLength(1);
    expect(report.violations[0]?.detail).toMatch(/^invalid JSON:/);
  });

  it('fails a stale allowance that no longer names a fingerprint column', () => {
    const allowance = FINGERPRINT_SOURCE_HASH_ALLOWANCES[0];
    const report = checkFingerprintSourceHashes(
      [baseline(allowance.path, 'canvas', { fingerprint: 'coarse' })],
      [allowance],
    );

    expect(report.allowances[0]?.state).toBe('missing');
    expect(report.violations).toHaveLength(2);
  });
});

function baseline(
  path: string,
  renderer: string,
  column: Readonly<Record<string, unknown>>,
): { path: string; text: string } {
  return { path, text: JSON.stringify({ [renderer]: column }) };
}

function provenance(sourceHash: string) {
  return { frames: 1, sourceHash, targetKind: 'webgl', verifyPublished: true, warmupFrames: 0 };
}

function combineAllowances(
  allowances: readonly { path: string; renderer: string }[],
): { path: string; text: string }[] {
  const baselines = new Map<string, Record<string, { fingerprint: string }>>();
  for (const entry of allowances) {
    const value = baselines.get(entry.path) ?? {};
    value[entry.renderer] = { fingerprint: 'coarse' };
    baselines.set(entry.path, value);
  }
  return [...baselines].map(([path, value]) => ({ path, text: JSON.stringify(value) }));
}
