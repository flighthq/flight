import type { OracleRequest } from './oracle-records';
import type { OracleCellComparison, OracleCellInput, OracleJoinFailureKind, OracleRequestRecord } from './oracle-state';
import { describeOracleComparison, joinOracleState } from './oracle-state';

// ★ EVERY GATE IN §9 HAS A FIRING TEST HERE, per the capture-verification-tiers rule that a gate row and
// its defeating test are added together. A gate nobody has watched fail is a gate nobody knows fires —
// this file is the evidence, not the implementation's own claim about itself.

const POLICY = {
  comparisonPolicyId: 'test-policy-1',
  gateOnMaxChannelDelta: true,
  maxChannelDelta: 8,
  maxFraction: 0.001,
};

describe('describeOracleComparison', () => {
  it('names a dimension mismatch instead of reporting meaningless numbers', () => {
    expect(describeOracleComparison({ dimensionMismatch: true, fraction: 0, maxChannelDelta: 0 })).toBe(
      'dimension mismatch',
    );
  });

  it('reports the fraction at full precision, not rounded to nothing', () => {
    // A regression of 30 pixels in 800×600 is a fraction of 0.0000625; two decimal places would print
    // it as 0.00 and make a real failure look like a clean run.
    expect(describeOracleComparison({ dimensionMismatch: false, fraction: 0.0000625, maxChannelDelta: 12 })).toBe(
      'fraction 0.000063, maxChannelDelta 12',
    );
  });
});

describe('joinOracleState', () => {
  it('compares a pinned, required, unrequested cell and counts it as a pass', () => {
    const result = join([cell('functional/shape-fill-solid/webgl', { comparison: clean() })], []);

    expect(verdicts(result)).toEqual({ 'functional/shape-fill-solid/webgl': 'compared' });
    expect(result.failures).toEqual([]);
    expect(result.comparedCount).toBe(1);
  });

  it('fails a required cell that is unpinned and uncommissioned', () => {
    const result = join([cell('functional/a/webgl', { pinned: false })], []);

    expect(verdicts(result)).toEqual({ 'functional/a/webgl': 'missing' });
    expect(kinds(result)).toContain('missing-reference-image');
  });

  it('fails a pinned cell that was never compared, rather than treating silence as a pass', () => {
    // The capture ran, the bytes exist, and no comparison happened. Absent evidence is missing evidence.
    const result = join([cell('functional/a/webgl', { comparison: null })], [record(request('r1', 'functional', 'b'))]);

    expect(result.cells[0]?.verdict).toBe('missing');
    expect(kinds(result)).toContain('missing-reference-image');
  });

  it('demotes an in-scope mismatch to pending and never counts it as compared', () => {
    const result = join(
      [cell('functional/a/webgl', { comparison: moved() }), cell('functional/b/webgl', { comparison: clean() })],
      [record(request('r1', 'functional', 'a'))],
    );

    expect(verdicts(result)['functional/a/webgl']).toBe('pending-changed');
    expect(result.cells[0]?.requestId).toBe('r1');
    expect(result.pendingCount).toBe(1);
    // The pass count must not absorb the pending cell: pending is an allowance to proceed, never a claim
    // that a comparison succeeded.
    expect(result.comparedCount).toBe(1);
    expect(kinds(result)).not.toContain('regression');
  });

  it('reports an unpinned but commissioned cell as pending without claiming a comparison', () => {
    const result = join(
      [cell('functional/a/webgl', { pinned: false }), cell('functional/b/webgl', { comparison: clean() })],
      [record(request('r1', 'functional', 'a'))],
    );

    expect(verdicts(result)['functional/a/webgl']).toBe('pending-uncaptured');
    expect(result.failures).toEqual([]);
  });

  // ── §9 gates, each observed firing ────────────────────────────────────────────────────────────────

  it('fires zero-comparisons when required cells exist and nothing compared', () => {
    const result = join([cell('functional/a/webgl', { pinned: false })], [record(request('r1', 'functional', 'a'))]);

    expect(result.comparedCount).toBe(0);
    expect(kinds(result)).toContain('zero-comparisons');
  });

  it('does not fire zero-comparisons on an empty corpus, which is not a misconfiguration', () => {
    expect(kinds(join([], []))).not.toContain('zero-comparisons');
  });

  it('fires orphaned-reference-image for pinned bytes with no live requirement', () => {
    const result = join(
      [cell('functional/live/webgl', { comparison: clean() }), cell('functional/dead/webgl', { required: false })],
      [],
    );

    expect(verdicts(result)['functional/dead/webgl']).toBe('orphan');
    expect(kinds(result)).toContain('orphaned-reference-image');
  });

  it('fires incomparable-dimensions as a verdict rather than aborting the corpus', () => {
    const result = join(
      [
        cell('functional/resized/webgl', { comparison: { dimensionMismatch: true, fraction: 0, maxChannelDelta: 0 } }),
        cell('functional/ok/webgl', { comparison: clean() }),
      ],
      [],
    );

    expect(verdicts(result)['functional/resized/webgl']).toBe('incomparable');
    expect(kinds(result)).toContain('incomparable-dimensions');
    // The rest of the corpus still produced a verdict — the point of converting the throw.
    expect(verdicts(result)['functional/ok/webgl']).toBe('compared');
  });

  it('fires request-expired and stops the stale request demoting anything', () => {
    const result = join(
      [cell('functional/a/webgl', { comparison: moved() })],
      [record(request('r1', 'functional', 'a'), 31)],
    );

    expect(kinds(result)).toContain('request-expired');
    // The teeth: an expired request must not keep demoting, or the queue is a permanent skip list.
    expect(verdicts(result)['functional/a/webgl']).toBe('regressed');
    expect(kinds(result)).toContain('regression');
  });

  it('fires request-overlap when two open requests claim one cell', () => {
    const result = join(
      [cell('functional/a/webgl', { comparison: moved() })],
      [record(request('r1', 'functional', 'a')), record(request('r2', 'functional', 'a'))],
    );

    expect(kinds(result)).toContain('request-overlap');
  });

  it('fires request-off-target when a request names a cell that is not required and live', () => {
    const result = join(
      [cell('functional/a/webgl', { comparison: clean() })],
      [record(request('r1', 'functional', 'ghost'))],
    );

    expect(kinds(result)).toContain('request-off-target');
  });

  it('keeps out-of-scope movement failing while an in-scope sibling is pending', () => {
    // The central promise of the pending allowance: a request demotes only the cells it names.
    const result = join(
      [cell('functional/a/webgl', { comparison: moved() }), cell('functional/b/webgl', { comparison: moved() })],
      [record(request('r1', 'functional', 'a'))],
    );

    expect(verdicts(result)['functional/a/webgl']).toBe('pending-changed');
    expect(verdicts(result)['functional/b/webgl']).toBe('regressed');
    expect(result.failures.filter((failure) => failure.kind === 'regression')).toHaveLength(1);
  });

  it('gates on maxChannelDelta only when the policy says to', () => {
    const spike: OracleCellComparison = { dimensionMismatch: false, fraction: 0, maxChannelDelta: 200 };

    const gating = join([cell('functional/a/webgl', { comparison: spike })], []);
    const reporting = joinOracleState({
      cells: [cell('functional/a/webgl', { comparison: spike })],
      maxPendingDays: 30,
      policy: { ...POLICY, gateOnMaxChannelDelta: false },
      requests: [],
    });

    expect(verdicts(gating)['functional/a/webgl']).toBe('regressed');
    expect(verdicts(reporting)['functional/a/webgl']).toBe('compared');
  });
});

function cell(identity: string, overrides: Partial<OracleCellInput> = {}): OracleCellInput {
  return { comparison: null, identity, pinned: true, required: true, ...overrides };
}

function clean(): OracleCellComparison {
  return { dimensionMismatch: false, fraction: 0, maxChannelDelta: 1 };
}

function join(cells: readonly OracleCellInput[], requests: readonly OracleRequestRecord[]) {
  return joinOracleState({ cells, maxPendingDays: 30, policy: POLICY, requests });
}

function kinds(result: { failures: readonly { kind: OracleJoinFailureKind }[] }): OracleJoinFailureKind[] {
  return result.failures.map((failure) => failure.kind);
}

function moved(): OracleCellComparison {
  return { dimensionMismatch: false, fraction: 0.04, maxChannelDelta: 90 };
}

function record(request: OracleRequest, ageDays = 1): OracleRequestRecord {
  return { ageDays, request };
}

function request(id: string, subject: string, entry: string, renderers: string[] = ['webgl']): OracleRequest {
  return { frames: 1, id, reason: 'test', schemaVersion: 1, subject, targets: [{ entry, renderers }] };
}

function verdicts(result: { cells: readonly { identity: string; verdict: string }[] }): Record<string, string> {
  return Object.fromEntries(result.cells.map((cell) => [cell.identity, cell.verdict]));
}
