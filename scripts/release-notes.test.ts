import { describe, expect, it } from 'vitest';

import { parseConventionalCommit } from './conventional-commits';
import { renderGeneratedChanges, renderReleaseNote, validateReleaseNote } from './release-notes';

const commits = [
  parseConventionalCommit('1111111111111111111111111111111111111111', 'feat(scene3d): add fog'),
  parseConventionalCommit('2222222222222222222222222222222222222222', 'fix: repair cleanup'),
  parseConventionalCommit('3333333333333333333333333333333333333333', 'refactor(api)!: remove legacy path'),
  parseConventionalCommit('4444444444444444444444444444444444444444', 'docs: explain it'),
];
const input = {
  version: '0.4.0',
  previousVersion: '0.3.0',
  testedCandidate: '0.4.0-next.42.abcdef0',
  changesThrough: 'abcdef0123456789abcdef0123456789abcdef01',
  commits,
};

describe('release notes', () => {
  it('groups user-facing conventional commits and omits routine documentation', () => {
    const generated = renderGeneratedChanges(commits, input);

    expect(generated).toContain('### Breaking changes');
    expect(generated).toContain('remove legacy path');
    expect(generated).toContain('### Features');
    expect(generated).toContain('**scene3d:** add fog');
    expect(generated).toContain('### Fixes');
    expect(generated).toContain('**repository:** 1 fix');
    expect(generated).toContain(`/compare/${input.previousVersion}...${input.changesThrough}`);
    expect(generated).not.toContain('explain it');
  });

  it('requires human curation before a draft can pass', () => {
    expect(validateReleaseNote(renderReleaseNote(input), input, [])).toEqual([
      'Highlights still contains its draft placeholder',
      'Migration still contains its draft placeholder',
    ]);
  });

  it('accepts a curated note followed only by a release metadata commit', () => {
    const curated = renderReleaseNote(input)
      .replace('- Replace this line with the release highlights.', '- Adds scene fog and API cleanup.')
      .replace(
        '- Replace this line with migration guidance, or state that no migration is required.',
        '- Replace the legacy API path before upgrading.',
      );

    expect(validateReleaseNote(curated, input, ['chore(release): 0.4.0'])).toEqual([]);
  });

  it('rejects an untested functional change after the recorded candidate', () => {
    const curated = renderReleaseNote(input)
      .replace('- Replace this line with the release highlights.', '- Adds scene fog.')
      .replace(
        '- Replace this line with migration guidance, or state that no migration is required.',
        '- No migration is required.',
      );

    expect(validateReleaseNote(curated, input, ['fix(scene3d): late fix'])).toContain(
      'untested post-candidate commit is not release metadata: fix(scene3d): late fix',
    );
  });
});
