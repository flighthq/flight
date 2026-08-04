import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { PackageChurn } from '../agents/packages/todo-churn.mjs';
import { readPackageChurn, sumChurnSince } from '../agents/packages/todo-churn.mjs';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

describe('readPackageChurn', () => {
  it('attributes line deltas to the owning package', () => {
    const repo = createRepo();
    commit(repo, [['packages/mesh/src/mesh.ts', 'a\nb\nc\n']], 'feat(mesh): add');
    commit(repo, [['packages/path/src/path.ts', 'x\n']], 'feat(path): add');

    const churn = readPackageChurn(repo, '2000-01-01');
    expect(totalFor(churn, 'mesh').lines).toBe(3);
    expect(totalFor(churn, 'path').lines).toBe(1);
  });

  it('counts additions and deletions together, since both date a survey', () => {
    const repo = createRepo();
    commit(repo, [['packages/mesh/src/mesh.ts', 'a\nb\nc\n']], 'feat(mesh): add');
    commit(repo, [['packages/mesh/src/mesh.ts', 'a\n']], 'refactor(mesh): trim');

    // 3 added, then 2 deleted.
    expect(totalFor(readPackageChurn(repo, '2000-01-01'), 'mesh').lines).toBe(5);
  });

  // The rank is distinct pieces of work landed, so a commit spanning six files in one package is one.
  it('counts a commit once per package however many of its files it touches', () => {
    const repo = createRepo();
    commit(
      repo,
      [
        ['packages/mesh/src/mesh.ts', 'a\n'],
        ['packages/mesh/src/meshData.ts', 'b\n'],
        ['packages/mesh/src/meshBounds.ts', 'c\n'],
      ],
      'feat(mesh): add three files',
    );

    expect(totalFor(readPackageChurn(repo, '2000-01-01'), 'mesh').commits).toBe(1);
  });

  it('ignores files outside packages/', () => {
    const repo = createRepo();
    commit(repo, [['scripts/tool.ts', 'a\nb\n']], 'chore: tool');

    expect(readPackageChurn(repo, '2000-01-01').size).toBe(0);
  });

  // The generator is a doc build, not a gate — outside a checkout it must degrade, never throw.
  it('returns an empty map when the directory is not a git repository', () => {
    const plain = mkdtempSync(join(tmpdir(), 'flight-churn-'));
    temporaryDirectories.push(plain);

    expect(readPackageChurn(plain, '2000-01-01').size).toBe(0);
  });

  // A repo-wide rename or version bump is not work done on any one package it touches.
  it('records a wide commit as a sweep for the packages that only followed it', () => {
    const repo = createRepo();
    commit(repo, sweepFiles(25, 'x\n'), 'refactor: rename everything');

    const churn = readPackageChurn(repo, '2000-01-01');
    expect(totalFor(churn, 'pkg00')).toEqual({ commits: 0, lines: 0, sweeps: 1 });
  });

  // ...but the package that owns a wide refactor takes the bulk of it, and that is real work.
  it('still counts a wide commit for the package holding the bulk of the change', () => {
    const repo = createRepo();
    const files = sweepFiles(25, 'x\n');
    files[0] = ['packages/pkg00/src/pkg00.ts', `${'owner line\n'.repeat(60)}`];
    commit(repo, files, 'refactor(pkg00): flatten the model');

    const churn = readPackageChurn(repo, '2000-01-01');
    expect(totalFor(churn, 'pkg00').commits).toBe(1);
    expect(totalFor(churn, 'pkg01').sweeps).toBe(1);
  });

  it('counts a narrow commit for every package it touches, however large each slice is', () => {
    const repo = createRepo();
    commit(
      repo,
      [
        ['packages/mesh/src/mesh.ts', 'a\n'],
        ['packages/path/src/path.ts', 'b\n'],
      ],
      'refactor: two packages',
    );

    const churn = readPackageChurn(repo, '2000-01-01');
    expect(totalFor(churn, 'mesh').commits).toBe(1);
    expect(totalFor(churn, 'path').commits).toBe(1);
  });
});

describe('sumChurnSince', () => {
  const byDate = new Map([
    ['2026-06-01', { commits: 1, lines: 10, sweeps: 0 }],
    ['2026-07-01', { commits: 2, lines: 100, sweeps: 1 }],
    ['2026-08-01', { commits: 3, lines: 1000, sweeps: 0 }],
  ]);

  it('sums only the dates strictly after the cutoff', () => {
    expect(sumChurnSince(byDate, '2026-06-30')).toEqual({ commits: 5, lines: 1100, sweeps: 1 });
    expect(sumChurnSince(byDate, '2026-07-31')).toEqual({ commits: 3, lines: 1000, sweeps: 0 });
  });

  // A review written the same day as a commit is treated as having seen it, so same-day is excluded.
  it('excludes a commit dated the same day as the review', () => {
    expect(sumChurnSince(byDate, '2026-08-01')).toEqual({ commits: 0, lines: 0, sweeps: 0 });
  });

  it('returns zero for a package with no recorded churn', () => {
    expect(sumChurnSince(undefined, '2026-01-01')).toEqual({ commits: 0, lines: 0, sweeps: 0 });
  });
});

function commit(repo: string, files: readonly (readonly [string, string])[], message: string): void {
  for (const [path, contents] of files) {
    const full = join(repo, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, contents);
  }
  execFileSync('git', ['add', '-A'], { cwd: repo });
  execFileSync('git', ['commit', '-m', message], { cwd: repo });
}

function createRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), 'flight-churn-'));
  temporaryDirectories.push(repo);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
  return repo;
}

function sweepFiles(count: number, contents: string): [string, string][] {
  return Array.from({ length: count }, (_unused, index) => {
    const name = `pkg${String(index).padStart(2, '0')}`;
    return [`packages/${name}/src/${name}.ts`, contents];
  });
}

function totalFor(churn: Map<string, Map<string, PackageChurn>>, name: string): PackageChurn {
  return sumChurnSince(churn.get(name), '2000-01-01');
}
