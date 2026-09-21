import { describe, expect, it } from 'vitest';

import type { PublishExpectation, PublishProblem, PublishedRegistryState } from './publish-verification.js';
import { describePublishProblem, findPublishProblems } from './publish-verification.js';

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
