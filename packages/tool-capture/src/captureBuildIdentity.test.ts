import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CAPTURE_BUILD_IDENTITY_FILE,
  createCaptureBuildIdentity,
  getCaptureBuildIdentity,
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
