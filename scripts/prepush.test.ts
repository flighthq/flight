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
  it('leaves Vitest worker selection at its default when the override is unset', () => {
    expect(resolveChangedTestArguments('origin/main', undefined)).toEqual([
      '--project',
      'shared',
      '--changed',
      'origin/main',
    ]);
  });

  it('adds the opt-in worker limit', () => {
    expect(resolveChangedTestArguments('origin/main', '4')).toEqual([
      '--project',
      'shared',
      '--changed',
      'origin/main',
      '--maxWorkers',
      '4',
    ]);
  });

  it.each(['0', '-1', '1.5', 'many'])('rejects invalid worker count %s', (workerCount) => {
    expect(() => resolveChangedTestArguments('origin/main', workerCount)).toThrow(
      'FLIGHT_PREPUSH_VITEST_WORKERS must be a positive integer',
    );
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
