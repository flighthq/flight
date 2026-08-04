import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { readPackageChurn, sumChurnSince } from '../agents/packages/todo-churn.mjs';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

describe('readPackageChurn', () => {
  it('attributes line deltas to the owning package', () => {
    const repo = createRepo();
    commit(repo, 'packages/mesh/src/mesh.ts', 'a\nb\nc\n', 'feat(mesh): add');
    commit(repo, 'packages/path/src/path.ts', 'x\n', 'feat(path): add');

    const churn = readPackageChurn(repo, '2000-01-01');
    expect(totalFor(churn, 'mesh')).toBe(3);
    expect(totalFor(churn, 'path')).toBe(1);
  });

  it('counts additions and deletions together, since both date a survey', () => {
    const repo = createRepo();
    commit(repo, 'packages/mesh/src/mesh.ts', 'a\nb\nc\n', 'feat(mesh): add');
    commit(repo, 'packages/mesh/src/mesh.ts', 'a\n', 'refactor(mesh): trim');

    // 3 added, then 2 deleted.
    expect(totalFor(readPackageChurn(repo, '2000-01-01'), 'mesh')).toBe(5);
  });

  it('ignores files outside packages/', () => {
    const repo = createRepo();
    commit(repo, 'scripts/tool.ts', 'a\nb\n', 'chore: tool');

    expect(readPackageChurn(repo, '2000-01-01').size).toBe(0);
  });

  // The generator is a doc build, not a gate — outside a checkout it must degrade, never throw.
  it('returns an empty map when the directory is not a git repository', () => {
    const plain = mkdtempSync(join(tmpdir(), 'flight-churn-'));
    temporaryDirectories.push(plain);

    expect(readPackageChurn(plain, '2000-01-01').size).toBe(0);
  });
});

describe('sumChurnSince', () => {
  const byDate = new Map([
    ['2026-06-01', 10],
    ['2026-07-01', 100],
    ['2026-08-01', 1000],
  ]);

  it('sums only the dates strictly after the cutoff', () => {
    expect(sumChurnSince(byDate, '2026-06-30')).toBe(1100);
    expect(sumChurnSince(byDate, '2026-07-31')).toBe(1000);
  });

  // A review written the same day as a commit is treated as having seen it, so same-day is excluded.
  it('excludes a commit dated the same day as the review', () => {
    expect(sumChurnSince(byDate, '2026-08-01')).toBe(0);
  });

  it('returns zero for a package with no recorded churn', () => {
    expect(sumChurnSince(undefined, '2026-01-01')).toBe(0);
  });
});

function commit(repo: string, path: string, contents: string, message: string): void {
  const full = join(repo, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, contents);
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

function totalFor(churn: Map<string, Map<string, number>>, name: string): number {
  return sumChurnSince(churn.get(name), '2000-01-01');
}
