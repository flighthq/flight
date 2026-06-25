import { acquireShapedRun, releaseShapedRun } from './textShaperPool';

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
});
