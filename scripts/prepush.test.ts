import { affectsSharedPackageTests, resolveChangedTestArguments, shouldRunPrepushTypecheck } from './prepush';

describe('shouldRunPrepushTypecheck', () => {
  it('skips typecheck for an explicit Markdown-only change', () => {
    expect(shouldRunPrepushTypecheck(['README.md', 'agents/conventions/testing.md'])).toBe(false);
  });

  it.each([
    ['package source', ['packages/mesh/src/mesh.ts']],
    ['root package config', ['package.json']],
    ['TypeScript config', ['packages/mesh/tsconfig.json']],
    ['Vitest config', ['vitest.config.ts']],
    ['an unknown extension', ['notes.adoc']],
    ['an empty diff', []],
  ])('runs typecheck for %s', (_label, changed) => {
    expect(shouldRunPrepushTypecheck(changed)).toBe(true);
  });

  it('runs typecheck when changed-file discovery fails', () => {
    expect(shouldRunPrepushTypecheck(null)).toBe(true);
  });
});

describe('resolveChangedTestArguments', () => {
  it('scopes changed tests to the shared project', () => {
    expect(resolveChangedTestArguments('origin/main')).toEqual(['--project', 'shared', '--changed', 'origin/main']);
  });
});

describe('affectsSharedPackageTests', () => {
  it('includes ordinary package source', () => {
    expect(affectsSharedPackageTests(['packages/mesh/src/mesh.ts'])).toBe(true);
  });

  it('excludes tool-capture from the shared project', () => {
    expect(affectsSharedPackageTests(['packages/tool-capture/src/capture.ts'])).toBe(false);
  });
});
