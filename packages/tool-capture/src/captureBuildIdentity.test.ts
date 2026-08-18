import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  CAPTURE_BUILD_IDENTITY_FILE,
  createCaptureBuildIdentity,
  parseGitStatusPaths,
  readCaptureBuildIdentity,
} from './captureBuildIdentity';

describe('capture build identity', () => {
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

  it('keeps porcelain paths literal and represents a rename as one dirty entry', () => {
    expect(parseGitStatusPaths(' M ordinary.ts\0?? path with spaces.ts\0R  renamed.ts\0old.ts\0')).toEqual([
      'ordinary.ts',
      'path with spaces.ts',
      'old.ts -> renamed.ts',
    ]);
  });

  it('states how many paths a bounded stamp omits instead of silently truncating evidence', () => {
    const paths = Array.from({ length: 55 }, (_, index) => `path-${index}.ts`);

    const build = createCaptureBuildIdentity('a'.repeat(40), paths);

    expect(build.dirty).toEqual(paths.slice(0, 50));
    expect(build.dirtyOmitted).toBe(5);
  });
});
