import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CAPTURE_BUILD_IDENTITY_FILE,
  createCaptureBuildIdentity,
  getCaptureBuildIdentity,
  isCaptureBuildDirtyExempt,
  parseGitStatusPaths,
  readCaptureBuildIdentity,
} from './captureBuildIdentity';

describe('createCaptureBuildIdentity', () => {
  it('states how many paths a bounded stamp omits instead of silently truncating evidence', () => {
    const paths = Array.from({ length: 55 }, (_, index) => `path-${index}.ts`);

    const build = createCaptureBuildIdentity('a'.repeat(40), paths);

    expect(build.dirty).toEqual(paths.slice(0, 50));
    expect(build.dirtyOmitted).toBe(5);
  });

  // ★ THE REVIEW WORKFLOW'S OWN OUTPUT IS NOT EVIDENCE ABOUT THE BUILD. Commissioning writes a request
  // file and holding writes the ledger; both are then uncommitted, so the next review in the same session
  // warned "Built with uncommitted changes" and named files the reviewer had just created BY REVIEWING.
  // A warning that fires because you used the tool is one people learn to ignore.
  it('ignores the request queue and the hold ledger, which no build step reads', () => {
    const build = createCaptureBuildIdentity('a'.repeat(40), [
      'reference-image-requests/09cb2e5b.json',
      'scripts/reference-image-held.json',
    ]);

    expect(build.dirty).toEqual([]);
    expect(build.dirtyOmitted).toBe(0);
  });

  // The exemption must not swallow the signal it sits next to: a real source edit alongside a request file
  // is still a dirty build, and the warning still has to say so.
  it('still reports a source path dirtied in the same tree', () => {
    const build = createCaptureBuildIdentity('a'.repeat(40), [
      'reference-image-requests/09cb2e5b.json',
      'functional/scenes/text-basic.ts',
    ]);

    expect(build.dirty).toEqual(['functional/scenes/text-basic.ts']);
  });

  // The omitted count is taken AFTER the exemption, or a queue of fifty stale requests would report fifty
  // omissions and re-create the noise the exemption removes.
  it('counts omissions after the exemption, not before', () => {
    const requests = Array.from({ length: 60 }, (_, index) => `reference-image-requests/r${index}.json`);

    const build = createCaptureBuildIdentity('a'.repeat(40), [...requests, 'packages/bitmap/src/bitmap.ts']);

    expect(build.dirty).toEqual(['packages/bitmap/src/bitmap.ts']);
    expect(build.dirtyOmitted).toBe(0);
  });
});

describe('getCaptureBuildIdentity', () => {
  it('reads the checked-out commit and dirty paths from the build repository', () => {
    const directory = mkdtempSync(join(tmpdir(), 'capture-build-identity-git-'));
    execFileSync('git', ['init', '--quiet', directory]);
    writeFileSync(join(directory, 'tracked.ts'), 'export {};\n');
    execFileSync('git', ['add', 'tracked.ts'], { cwd: directory });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Capture Test',
        '-c',
        'user.email=capture@example.invalid',
        'commit',
        '--quiet',
        '-m',
        'initial',
      ],
      { cwd: directory },
    );
    writeFileSync(join(directory, 'dirty path.ts'), 'export {};\n');
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' }).trim();

    expect(getCaptureBuildIdentity(directory)).toEqual({ commit, dirty: ['dirty path.ts'], dirtyOmitted: 0 });
  });
});

describe('isCaptureBuildDirtyExempt', () => {
  it('exempts a path under the request queue', () => {
    expect(isCaptureBuildDirtyExempt('reference-image-requests/09cb2e5b.json')).toBe(true);
  });

  it('does not exempt a scene or a package source', () => {
    expect(isCaptureBuildDirtyExempt('functional/scenes/text-basic.ts')).toBe(false);
    expect(isCaptureBuildDirtyExempt('packages/bitmap/src/bitmap.ts')).toBe(false);
  });

  // ★ `functional/baselines/` IS DELIBERATELY NOT EXEMPT, and the distinction is the whole rule. A changed
  // baseline alters no render, but it does alter what a capture reports as CHANGED — so its dirtiness is
  // evidence about the run even though it is not evidence about the build.
  it('does not exempt a committed baseline', () => {
    expect(isCaptureBuildDirtyExempt('functional/baselines/text-basic.json')).toBe(false);
  });

  // A rename is one readable record with both sides; exempting it requires both sides to be exempt, so a
  // file moved OUT of the queue into the tree still counts as dirty.
  it('exempts a rename only when both sides are exempt', () => {
    expect(isCaptureBuildDirtyExempt('reference-image-requests/a.json -> reference-image-requests/b.json')).toBe(true);
    expect(isCaptureBuildDirtyExempt('reference-image-requests/a.json -> functional/scenes/a.ts')).toBe(false);
  });
});

describe('parseGitStatusPaths', () => {
  it('keeps porcelain paths literal and represents a rename as one dirty entry', () => {
    expect(parseGitStatusPaths(' M ordinary.ts\0?? path with spaces.ts\0R  renamed.ts\0old.ts\0')).toEqual([
      'ordinary.ts',
      'path with spaces.ts',
      'old.ts -> renamed.ts',
    ]);
  });
});

describe('readCaptureBuildIdentity', () => {
  it('reads the build-owned commit and dirty-path census from dist', () => {
    const dist = mkdtempSync(join(tmpdir(), 'capture-build-identity-'));
    const build = {
      commit: 'a'.repeat(40),
      dirty: ['functional/scenes/changed.ts', 'old.ts -> new.ts'],
      dirtyOmitted: 3,
    } as const;
    writeFileSync(join(dist, CAPTURE_BUILD_IDENTITY_FILE), JSON.stringify(build));

    expect(readCaptureBuildIdentity(dist)).toEqual(build);
  });

  it('refuses an absent or malformed stamp rather than inventing identity from the capture checkout', () => {
    const dist = mkdtempSync(join(tmpdir(), 'capture-build-identity-'));
    expect(readCaptureBuildIdentity(dist)).toBeNull();

    mkdirSync(dist, { recursive: true });
    writeFileSync(
      join(dist, CAPTURE_BUILD_IDENTITY_FILE),
      JSON.stringify({ commit: 'not-a-commit', dirty: [], dirtyOmitted: 0 }),
    );
    expect(readCaptureBuildIdentity(dist)).toBeNull();
  });
});
