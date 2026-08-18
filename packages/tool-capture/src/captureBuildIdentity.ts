// Identifies the repository state a static functional build was produced from. The stamp is written
// once, by the build, and every later consumer copies it rather than asking git what HEAD is now: a
// stale dist can legitimately outlive the checkout that created it, so re-deriving would attach the
// current tree to bytes built from an older one.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CAPTURE_BUILD_IDENTITY_FILE = 'capture-build.json';
export const MAX_CAPTURE_BUILD_DIRTY_PATHS = 50;

export interface CaptureBuildIdentity {
  /** The commit checked out when the build began. */
  commit: string | null;
  /** Repo-relative uncommitted paths at build time, up to MAX_CAPTURE_BUILD_DIRTY_PATHS. */
  dirty: readonly string[];
  /** Additional dirty paths not retained above. Always stated when the evidence was truncated. */
  dirtyOmitted: number;
}

export const UNSTAMPED_CAPTURE_BUILD: CaptureBuildIdentity = { commit: null, dirty: [], dirtyOmitted: 0 };

export function createCaptureBuildIdentity(
  commit: string | null,
  allDirtyPaths: readonly string[],
): CaptureBuildIdentity {
  return {
    commit,
    dirty: allDirtyPaths.slice(0, MAX_CAPTURE_BUILD_DIRTY_PATHS),
    dirtyOmitted: Math.max(0, allDirtyPaths.length - MAX_CAPTURE_BUILD_DIRTY_PATHS),
  };
}

/** Reads git once at build time and creates the record that is stamped into dist. */
export function getCaptureBuildIdentity(repositoryRoot: string): CaptureBuildIdentity {
  try {
    const commit = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    }).trim();
    const status = execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });
    const allDirtyPaths = parseGitStatusPaths(status);
    return createCaptureBuildIdentity(commit, allDirtyPaths);
  } catch {
    return UNSTAMPED_CAPTURE_BUILD;
  }
}

/** Paths from `git status --porcelain=v1 -z`; rename/copy pairs remain one readable entry. */
export function parseGitStatusPaths(status: string): string[] {
  const records = status.split('\0');
  const paths: string[] = [];
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    if (record === undefined || record === '') continue;
    const state = record.slice(0, 2);
    const path = record.slice(3);
    if (state.includes('R') || state.includes('C')) {
      const previous = records[++index];
      paths.push(previous === undefined || previous === '' ? path : `${previous} -> ${path}`);
    } else {
      paths.push(path);
    }
  }
  return paths;
}

/** Reads a build-owned stamp from the directory capture is actually serving. */
export function readCaptureBuildIdentity(directory: string): CaptureBuildIdentity | null {
  const path = join(directory, CAPTURE_BUILD_IDENTITY_FILE);
  if (!existsSync(path)) return null;
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    const dirty = value['dirty'];
    const commit = value['commit'];
    if (commit !== null && (typeof commit !== 'string' || !/^[0-9a-f]{40}$/.test(commit))) return null;
    if (!Array.isArray(dirty) || !dirty.every((entry) => typeof entry === 'string' && entry.length > 0)) {
      return null;
    }
    if (
      typeof value['dirtyOmitted'] !== 'number' ||
      !Number.isInteger(value['dirtyOmitted']) ||
      value['dirtyOmitted'] < 0
    )
      return null;
    return value as unknown as CaptureBuildIdentity;
  } catch {
    return null;
  }
}
