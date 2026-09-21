import { describe, expect, it } from 'vitest';

import type { PublishExpectation, PublishProblem, PublishedRegistryState } from './publish-verification.js';
import {
  countTrailingRoundsWithoutProgress,
  describePublishProblem,
  findPublishProblems,
  shouldKeepVerifying,
} from './publish-verification.js';

// The versions from the incident this module exists for: every package published at 1538 except
// @flighthq/types, whose publish exited 0 and never reached the registry.
const OURS = '0.5.1-next.1538.09885fb';
const OLDER = '0.5.1-next.1533.2910b54';
const NEWER = '0.5.1-next.1541.aaaaaaa';

function state(entries: Record<string, PublishedRegistryState>): ReadonlyMap<string, PublishedRegistryState> {
  return new Map(Object.entries(entries));
}

function expectation(name: string, version = OURS): PublishExpectation {
  return { name, version };
}

describe('describePublishProblem', () => {
  it('names the registry as the authority for a missing version', () => {
    const problem: PublishProblem = { name: '@flighthq/types', version: OURS, kind: 'missing', tagVersion: OLDER };
    expect(describePublishProblem(problem, 'next')).toBe(
      `@flighthq/types@${OURS} is NOT on the registry — npm reported success but the version does not exist`,
    );
  });

  it('reports which version a stale tag still points at', () => {
    const problem: PublishProblem = { name: '@flighthq/xml', version: OURS, kind: 'tag-stale', tagVersion: OLDER };
    expect(describePublishProblem(problem, 'next')).toBe(
      `@flighthq/xml@${OURS} published but \`next\` still points at ${OLDER}`,
    );
  });

  it('describes an absent tag rather than printing undefined', () => {
    const problem: PublishProblem = { name: '@flighthq/xml', version: OURS, kind: 'tag-stale', tagVersion: undefined };
    expect(describePublishProblem(problem, 'next')).toContain('(no tag)');
  });

  it('marks an unreadable package as unconfirmed, not as failed', () => {
    const problem: PublishProblem = { name: '@flighthq/xml', version: OURS, kind: 'unreadable', tagVersion: undefined };
    expect(describePublishProblem(problem, 'next')).toBe(
      `@flighthq/xml@${OURS} could not be read back from the registry — publication unconfirmed`,
    );
  });
});

describe('findPublishProblems', () => {
  it('reports nothing when every version is live and on the tag', () => {
    const problems = findPublishProblems(
      [expectation('@flighthq/xml'), expectation('@flighthq/types')],
      state({
        '@flighthq/xml': { hasVersion: true, tagVersion: OURS },
        '@flighthq/types': { hasVersion: true, tagVersion: OURS },
      }),
    );
    expect(problems).toEqual([]);
  });

  it('catches the silent drop: npm exited 0 but the version is absent', () => {
    const problems = findPublishProblems(
      [expectation('@flighthq/xml'), expectation('@flighthq/types')],
      state({
        '@flighthq/xml': { hasVersion: true, tagVersion: OURS },
        // What the registry actually held: still at the previous release.
        '@flighthq/types': { hasVersion: false, tagVersion: OLDER },
      }),
    );
    expect(problems).toEqual([{ name: '@flighthq/types', version: OURS, kind: 'missing', tagVersion: OLDER }]);
  });

  it('reports a version that exists while the tag lags behind it', () => {
    const problems = findPublishProblems(
      [expectation('@flighthq/xml')],
      state({ '@flighthq/xml': { hasVersion: true, tagVersion: OLDER } }),
    );
    expect(problems).toEqual([{ name: '@flighthq/xml', version: OURS, kind: 'tag-stale', tagVersion: OLDER }]);
  });

  it('accepts a tag already moved on by a newer concurrent build', () => {
    // Two CI legs finishing out of commit order is expected, not a failure; the newer build owns the
    // tag. Reporting this would make every overlapping release flaky.
    const problems = findPublishProblems(
      [expectation('@flighthq/xml')],
      state({ '@flighthq/xml': { hasVersion: true, tagVersion: NEWER } }),
    );
    expect(problems).toEqual([]);
  });

  it('still reports a missing version even when a newer build owns the tag', () => {
    // The newer tag excuses a lagging pointer, never an absent version: siblings pin us exactly.
    const problems = findPublishProblems(
      [expectation('@flighthq/types')],
      state({ '@flighthq/types': { hasVersion: false, tagVersion: NEWER } }),
    );
    expect(problems).toEqual([{ name: '@flighthq/types', version: OURS, kind: 'missing', tagVersion: NEWER }]);
  });

  it('reports a package the registry could not be read for', () => {
    const problems = findPublishProblems([expectation('@flighthq/xml')], state({}));
    expect(problems).toEqual([{ name: '@flighthq/xml', version: OURS, kind: 'unreadable', tagVersion: undefined }]);
  });

  it('reports a published version that carries no dist-tag at all', () => {
    const problems = findPublishProblems(
      [expectation('@flighthq/xml')],
      state({ '@flighthq/xml': { hasVersion: true, tagVersion: undefined } }),
    );
    expect(problems).toEqual([{ name: '@flighthq/xml', version: OURS, kind: 'tag-stale', tagVersion: undefined }]);
  });

  it('verifies a stable release on the same terms', () => {
    const problems = findPublishProblems(
      [expectation('@flighthq/xml', '0.5.1'), expectation('@flighthq/types', '0.5.1')],
      state({
        '@flighthq/xml': { hasVersion: true, tagVersion: '0.5.1' },
        '@flighthq/types': { hasVersion: false, tagVersion: '0.4.0' },
      }),
    );
    expect(problems).toEqual([{ name: '@flighthq/types', version: '0.5.1', kind: 'missing', tagVersion: '0.4.0' }]);
  });

  it('reports every problem rather than stopping at the first', () => {
    const problems = findPublishProblems(
      [expectation('@flighthq/a'), expectation('@flighthq/b'), expectation('@flighthq/c')],
      state({
        '@flighthq/a': { hasVersion: false, tagVersion: OLDER },
        '@flighthq/b': { hasVersion: true, tagVersion: OLDER },
      }),
    );
    expect(problems.map((p) => p.kind)).toEqual(['missing', 'tag-stale', 'unreadable']);
  });
});

describe('countTrailingRoundsWithoutProgress', () => {
  it('reports zero while the count is still falling', () => {
    expect(countTrailingRoundsWithoutProgress([125, 100, 80])).toBe(0);
  });

  it('counts the flat tail only, not earlier flat stretches', () => {
    expect(countTrailingRoundsWithoutProgress([9, 9, 9, 5, 2, 2, 2])).toBe(2);
  });

  it('is zero for an empty history', () => {
    expect(countTrailingRoundsWithoutProgress([])).toBe(0);
  });
});

describe('shouldKeepVerifying', () => {
  const STALL = 120;

  it('stops as soon as nothing is outstanding', () => {
    expect(shouldKeepVerifying([162, 40, 0], STALL)).toBe(false);
  });

  it('keeps going while the count is still falling', () => {
    expect(shouldKeepVerifying([125, 100, 80], STALL)).toBe(true);
  });

  it('waits out the real 1556 tail, where two writes stayed pending ~12 minutes', () => {
    // Measured from the registry's own publish times on a 162-package release: the bulk converged in
    // minutes but snapshot committed +486s and @flighthq/types +871s after the first package. The
    // count sat flat at 2 across ~72 ten-second rounds while those were still pending. A 12-round
    // window called them permanent drops and failed a release in which nothing was actually lost.
    const bulk = [126, 108, 101, 91, 72, 68, 54, 47, 42, 29, 22, 17, 15, 15, 11, 9, 8, 6, 6, 5, 5, 4];
    const pendingTail = Array(72).fill(2);
    expect(shouldKeepVerifying([...bulk, ...pendingTail], STALL)).toBe(true);
    // And it still concludes once the tail finally lands.
    expect(shouldKeepVerifying([...bulk, ...pendingTail, 0], STALL)).toBe(false);
  });

  it('keeps going through the real 1543 convergence rather than failing a good release', () => {
    // Measured against the live registry: a 162-package release still had 125 unreadable on the
    // first read-back and was fully visible ~47s later. A fixed 3-attempt budget reported all 125
    // as missing; this rule must not.
    const observed = [125, 100, 80, 60, 40, 20, 5, 2, 2, 1, 1];
    expect(shouldKeepVerifying(observed, STALL)).toBe(true);
    expect(shouldKeepVerifying([...observed, 0], STALL)).toBe(false);
  });

  it('tolerates a flat round mid-convergence', () => {
    // Propagation is uneven; one round with no change must not end the loop.
    expect(shouldKeepVerifying([50, 50], STALL)).toBe(true);
  });

  it('gives up once the count refuses to drop for a full window', () => {
    // The signature of a real drop: it never becomes visible, so the count sits still.
    expect(shouldKeepVerifying(Array(STALL + 1).fill(2), STALL)).toBe(false);
  });

  it('holds on one round short of the window, and releases on the next', () => {
    expect(shouldKeepVerifying(Array(STALL).fill(2), STALL)).toBe(true);
    expect(shouldKeepVerifying(Array(STALL + 1).fill(2), STALL)).toBe(false);
  });

  it('counts a drop anywhere inside the window as progress', () => {
    // Stalled for most of the window but moved at the end: still converging.
    const counts = [...Array(STALL).fill(9), 8];
    expect(shouldKeepVerifying(counts, STALL)).toBe(true);
  });

  it('treats a drop followed by a spurious rise as progress', () => {
    // The publisher re-reads only the previous round's outstanding set, so its counts never rise.
    // A caller without that guarantee can still see one (a transient read error re-adding a package),
    // and a genuine decrease inside the window is progress regardless of where it landed.
    expect(shouldKeepVerifying([...Array(11).fill(9), 7, 9], STALL)).toBe(true);
  });

  it('does not read a rising count as progress', () => {
    // Transient read errors can push the count up. Only a decrease is progress.
    expect(shouldKeepVerifying([...Array(STALL).fill(3), 5], STALL)).toBe(false);
  });

  it('keeps going when no round has completed yet', () => {
    expect(shouldKeepVerifying([], STALL)).toBe(true);
  });
});
