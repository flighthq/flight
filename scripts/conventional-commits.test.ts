import { describe, expect, it } from 'vitest';

import { isBreakingCommitMessage, isFeatureCommitMessage, parseConventionalCommit } from './conventional-commits';

describe('conventional commits', () => {
  it('parses a scoped feature', () => {
    expect(parseConventionalCommit('abc', 'feat(render): add shadows')).toMatchObject({
      type: 'feat',
      scope: 'render',
      summary: 'add shadows',
      breaking: false,
    });
  });

  it('recognises both breaking notations', () => {
    expect(isBreakingCommitMessage('refactor(api)!: remove old entry')).toBe(true);
    expect(isBreakingCommitMessage('refactor(api): replace entry\n\nBREAKING CHANGE: old entry removed')).toBe(true);
    expect(isBreakingCommitMessage('fix(api): retain entry')).toBe(false);
  });

  it('keeps edge-version feature detection aligned with the shared parser', () => {
    expect(isFeatureCommitMessage('feat(scene3d): add fog')).toBe(true);
    expect(isFeatureCommitMessage('feat(scene3d)!: replace fog')).toBe(true);
    expect(isFeatureCommitMessage('fix(scene3d): repair fog')).toBe(false);
  });
});
