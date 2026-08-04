import {
  checkFingerprintSourceHashes,
  FINGERPRINT_SOURCE_HASH_ALLOWANCES,
  formatFingerprintSourceHashReport,
} from './check-fingerprint-source-hashes';

describe('fingerprint source-hash completeness', () => {
  it('accepts a covered column while keeping its named allowance visible and ready', () => {
    const allowance = FINGERPRINT_SOURCE_HASH_ALLOWANCES[0];
    const report = checkFingerprintSourceHashes(
      [baseline(allowance.path, allowance.renderer, { fingerprint: 'coarse', sourceHash: 'scene' })],
      [allowance],
    );

    expect(report).toMatchObject({
      allowances: [{ state: 'covered' }],
      covered: 1,
      fingerprintColumns: 1,
      unavailable: 0,
      violations: [],
    });
    expect(formatFingerprintSourceHashReport(report)).toContain(
      `${allowance.path}:${allowance.renderer} [sourceHash currently recorded; allowance ready] — ${allowance.reason}`,
    );
  });

  it('accepts all seven named cases only when both exact hashes are absent', () => {
    const inputs = combineAllowances(FINGERPRINT_SOURCE_HASH_ALLOWANCES);
    const report = checkFingerprintSourceHashes(inputs, FINGERPRINT_SOURCE_HASH_ALLOWANCES);

    expect(report).toMatchObject({
      covered: 0,
      fingerprintColumns: 7,
      unavailable: 7,
      violations: [],
    });
    expect(report.allowances.every((entry) => entry.state === 'unavailable')).toBe(true);
    expect(formatFingerprintSourceHashReport(report)).toContain(
      '0/7 fingerprint columns carry sourceHash; 7 honest gaps',
    );
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
  column: Readonly<Record<string, string>>,
): { path: string; text: string } {
  return { path, text: JSON.stringify({ [renderer]: column }) };
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
