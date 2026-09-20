import {
  affectsHostBackends,
  affectsScripts,
  affectsSharedPackageTests,
  affectsTools,
  resolveChangedTestArguments,
  shouldRunPrepushTypecheck,
} from './prepush';

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
  it('defaults to half the available parallelism when the override is unset', () => {
    expect(resolveChangedTestArguments('origin/main', undefined, 16)).toEqual([
      '--changed',
      'origin/main',
      '--maxWorkers',
      '8',
    ]);
    expect(resolveChangedTestArguments('origin/main', '', 7).slice(-2)).toEqual(['--maxWorkers', '3']);
  });

  it('never defaults below one worker', () => {
    expect(resolveChangedTestArguments('origin/main', undefined, 1).slice(-2)).toEqual(['--maxWorkers', '1']);
  });

  it('uses the explicit worker override over the default', () => {
    expect(resolveChangedTestArguments('origin/main', '4', 16)).toEqual([
      '--changed',
      'origin/main',
      '--maxWorkers',
      '4',
    ]);
  });

  it.each(['0', '-1', '1.5', 'many'])('rejects invalid worker count %s', (workerCount) => {
    expect(() => resolveChangedTestArguments('origin/main', workerCount, 16)).toThrow(
      'FLIGHT_PREPUSH_VITEST_WORKERS must be a positive integer',
    );
  });
});

describe('affectsHostBackends', () => {
  it('matches host backend source', () => {
    expect(affectsHostBackends(['packages/host-web/src/webHost.ts'])).toBe(true);
  });

  it('ignores SDK packages', () => {
    expect(affectsHostBackends(['packages/mesh/src/mesh.ts'])).toBe(false);
  });
});

describe('affectsScripts', () => {
  it('matches scripts/ TypeScript files', () => {
    expect(affectsScripts(['scripts/check-exports.ts'])).toBe(true);
  });

  it('ignores non-TypeScript in scripts/', () => {
    expect(affectsScripts(['scripts/README.md'])).toBe(false);
  });

  it('ignores package source', () => {
    expect(affectsScripts(['packages/mesh/src/mesh.ts'])).toBe(false);
  });
});

describe('affectsSharedPackageTests', () => {
  it('includes ordinary package source', () => {
    expect(affectsSharedPackageTests(['packages/mesh/src/mesh.ts'])).toBe(true);
  });

  it('excludes host backends from the shared project', () => {
    expect(affectsSharedPackageTests(['packages/host-web/src/webHost.ts'])).toBe(false);
  });

  it('excludes dev tools from the shared project', () => {
    expect(affectsSharedPackageTests(['packages/tool-capture/src/capture.ts'])).toBe(false);
  });
});

describe('affectsTools', () => {
  it('matches dev tool source', () => {
    expect(affectsTools(['packages/tool-capture/src/capture.ts'])).toBe(true);
  });

  it('ignores SDK packages', () => {
    expect(affectsTools(['packages/mesh/src/mesh.ts'])).toBe(false);
  });
});
