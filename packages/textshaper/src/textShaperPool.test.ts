import { acquireShapedRun, releaseShapedRun, setShapedRunReleaseGuard } from './textShaperPool';

describe('acquireShapedRun', () => {
  it('returns a ShapedRun with the expected shape', () => {
    const run = acquireShapedRun();
    expect(typeof run.advanceWidth).toBe('number');
    expect(Array.isArray(run.glyphs)).toBe(true);
    releaseShapedRun(run);
  });

  it('returns a previously released run from the pool', () => {
    const run = acquireShapedRun();
    releaseShapedRun(run);
    const reacquired = acquireShapedRun();
    // The same object reference should come back when the pool had one entry.
    expect(reacquired).toBe(run);
    releaseShapedRun(reacquired);
  });

  it('allocates a new run when the pool is empty', () => {
    // Drain any pooled entry.
    const r1 = acquireShapedRun();
    const r2 = acquireShapedRun();
    // Both are valid ShapedRuns.
    expect(r1).not.toBe(r2);
    releaseShapedRun(r1);
    releaseShapedRun(r2);
  });
});

describe('releaseShapedRun', () => {
  it('accepts a run without throwing', () => {
    const run = acquireShapedRun();
    expect(() => releaseShapedRun(run)).not.toThrow();
  });

  // A pool entry must appear at most once. Honouring a second release put the run in twice, so the
  // next two acquires handed one object to two callers who then shaped into the same buffer -- the
  // failure shows up as wrong glyphs somewhere else entirely.
  it('ignores a second release of the same run, so two acquires stay distinct', () => {
    const run = acquireShapedRun();
    releaseShapedRun(run);
    releaseShapedRun(run);

    const first = acquireShapedRun();
    const second = acquireShapedRun();

    expect(first).not.toBe(second);
  });

  // The membership record has to be cleared on the way out, or a run legitimately re-released after a
  // later acquire is mistaken for a double release and silently dropped from the pool.
  it('accepts a release again after the run has been re-acquired', () => {
    const run = acquireShapedRun();
    releaseShapedRun(run);
    const reacquired = acquireShapedRun();
    expect(reacquired).toBe(run);

    releaseShapedRun(reacquired);
    expect(acquireShapedRun()).toBe(run);
  });

  it('keeps distinct runs distinct through an acquire-release cycle', () => {
    const first = acquireShapedRun();
    const second = acquireShapedRun();
    releaseShapedRun(first);
    releaseShapedRun(second);

    const a = acquireShapedRun();
    const b = acquireShapedRun();

    expect(a).not.toBe(b);
  });
});

describe('setShapedRunReleaseGuard', () => {
  it('reports a repeated release after core detects it', () => {
    const seen: unknown[] = [];
    const run = acquireShapedRun();
    setShapedRunReleaseGuard((released) => seen.push(released));
    try {
      releaseShapedRun(run);
      releaseShapedRun(run);
      expect(seen).toEqual([run]);
    } finally {
      setShapedRunReleaseGuard(null);
      releaseShapedRun(acquireShapedRun());
    }
  });

  it('stays silent for paired reuse and after being cleared', () => {
    const seen: unknown[] = [];
    const run = acquireShapedRun();
    setShapedRunReleaseGuard((released) => seen.push(released));
    releaseShapedRun(run);
    const reacquired = acquireShapedRun();
    releaseShapedRun(reacquired);
    expect(seen).toEqual([]);

    setShapedRunReleaseGuard(null);
    releaseShapedRun(reacquired);
    expect(seen).toEqual([]);
  });
});
