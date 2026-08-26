import { describe, expect, it } from 'vitest';

import { parseConventionalCommit } from './conventional-commits';
import { renderGeneratedChanges, renderReleaseNote } from './release-notes';

const commits = [
  parseConventionalCommit('1111111111111111111111111111111111111111', 'feat(scene3d): add fog'),
  parseConventionalCommit('2222222222222222222222222222222222222222', 'fix: repair cleanup'),
  parseConventionalCommit('3333333333333333333333333333333333333333', 'refactor(api)!: remove legacy path'),
  parseConventionalCommit('4444444444444444444444444444444444444444', 'docs: explain it'),
];
const input = {
  version: '0.4.0',
  previousVersion: '0.3.0',
  changesThrough: 'abcdef0123456789abcdef0123456789abcdef01',
  description: '',
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

  it('places an optional Markdown description above the generated changes', () => {
    const note = renderReleaseNote({
      ...input,
      description: 'A focused release for **3D applications**.\n\nUpgrade normally.',
    });

    expect(note).toMatch(
      /^# Flight 0\.4\.0\n\nA focused release for \*\*3D applications\*\*\.\n\nUpgrade normally\.\n\n## Changes/,
    );
  });

  it('does not emit candidate or source metadata when no description is supplied', () => {
    const note = renderReleaseNote(input);

    expect(note).toMatch(/^# Flight 0\.4\.0\n\n## Changes/);
    expect(note).not.toContain('Tested candidate');
    expect(note).not.toContain('Changes through:');
  });
});
