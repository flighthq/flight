import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { runTypechecks, typecheckProjects, typeDeclarationsProject } from './typecheck-core';
import type { TypecheckProject, TypecheckResult } from './typecheck-core';
import { workspacePackages } from './workspaces';

describe('runTypechecks', () => {
  it('finishes the types declaration prerequisite before tools or another consumer starts', async () => {
    const started: string[] = [];
    let finishTypes!: (result: TypecheckResult) => void;
    const typesFinished = new Promise<TypecheckResult>((resolve) => {
      finishTypes = resolve;
    });
    let typesPassed = false;
    const runProject = vi.fn(async (project: Readonly<TypecheckProject>): Promise<TypecheckResult> => {
      started.push(project.label);
      if (project === typeDeclarationsProject) return await typesFinished;
      expect(typesPassed).toBe(true);
      return result(project, true);
    });

    const pending = runTypechecks(typecheckProjects.length, runProject);

    expect(typeDeclarationsProject.args).toEqual(['-b', 'packages/types/tsconfig.json']);
    expect(started).toEqual(['types declarations prerequisite']);
    expect(started).not.toContain('tools and root configs');

    typesPassed = true;
    finishTypes(result(typeDeclarationsProject, true));
    const results = await pending;

    expect(started).toEqual(['types declarations prerequisite', ...typecheckProjects.map(({ label }) => label)]);
    expect(results.map(({ label }) => label)).toEqual(started);
  });

  it('does not launch any downstream project when declaration generation fails', async () => {
    const runProject = vi.fn(async (project: Readonly<TypecheckProject>) => result(project, false));

    const results = await runTypechecks(typecheckProjects.length, runProject);

    expect(runProject).toHaveBeenCalledTimes(1);
    expect(runProject).toHaveBeenCalledWith(typeDeclarationsProject);
    expect(results).toEqual([result(typeDeclarationsProject, false)]);
  });
});

function result(project: Readonly<TypecheckProject>, passed: boolean): TypecheckResult {
  return { label: project.label, output: '', passed };
}

// ★ THE EXCLUSION MUST NOT BECOME A HIDING PLACE. `tools/tsconfig.json` now excludes host-probe's
// target-specific files so the gate stops tracking install completeness — but every narrowing of a gate
// is one edit away from narrowing it to nothing, and a gate that checks less always looks greener.
//
// This checks the ordinary project's own include/exclude patterns, because that is the thing an edit can
// narrow. Both sides are derived: the package population is read off disk, the patterns are read out of
// `tsconfig.json`. Neither is a roster anyone can quietly shorten, and a dropped package is NAMED.
//
// Two earlier shapes of this guard could not fail, and both are worth remembering. Listing the program's
// files passed while `packages/screen` was excluded outright, because every other package imports it and
// it stayed in through `Imported via`. Asking `--explainFiles` for `Matched by include pattern` measured
// `tsc -p`, but the gate runs `tsc -b`, which resolves package sources through project references — so it
// reported almost every package as uncovered. Presence in a program is not evidence of coverage.
describe('ordinary typecheck coverage', () => {
  it('keeps every workspace package that has source inside the ordinary project, and names any it drops', () => {
    const root = resolve(__dirname, '..');
    // `tsconfig.json` carries `//` comments, so strip them before parsing rather than pulling in a JSONC
    // dependency for one read.
    const raw = readFileSync(join(root, 'tsconfig.json'), 'utf-8')
      .split('\n')
      .map((line) => (/^\s*\/\//.test(line) ? '' : line.replace(/\s+\/\/.*$/, '')))
      .join('\n');
    const config = JSON.parse(raw) as { exclude?: string[]; include?: string[] };
    const include = config.include ?? [];
    const exclude = config.exclude ?? [];
    expect(include.length).toBeGreaterThan(0);

    // Minimal glob→RegExp for the two shapes tsconfig uses here: `**/` spanning directories and `*`
    // within a segment. The two-step token swap keeps `**` from being eaten by the single-`*` rule.
    const toRegExp = (pattern: string): RegExp => {
      const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*\//g, '<globstar-slash>')
        .replace(/\*\*/g, '<globstar>')
        .replace(/\*/g, '[^/]*')
        .replace(/<globstar-slash>/g, '(?:.*/)?')
        .replace(/<globstar>/g, '.*');
      return new RegExp(`^${escaped}$`);
    };
    const includeRe = include.map(toRegExp);
    const excludeRe = exclude.map((pattern) => toRegExp(pattern.endsWith('/**') ? pattern : `${pattern}/**`));
    const coversPath = (relative: string): boolean =>
      includeRe.some((re) => re.test(relative)) &&
      !excludeRe.some((re) => re.test(relative)) &&
      !exclude.some((pattern) => relative === pattern || relative.startsWith(`${pattern}/`));

    // Population: packages that actually carry source, derived from disk. A package with no `src/*.ts`
    // cannot be covered by anything, and demanding it would fail for something that is not a coverage loss.
    const packagesWithSource = workspacePackages
      .map((pkg) => pkg.dir)
      .filter((dir) => {
        const srcDir = join(dir, 'src');
        return existsSync(srcDir) && readdirSync(srcDir).some((entry) => entry.endsWith('.ts'));
      });
    expect(packagesWithSource.length).toBeGreaterThan(100);

    const missing = packagesWithSource
      .filter((dir) => {
        const srcDir = join(dir, 'src');
        const first = readdirSync(srcDir).find((entry) => entry.endsWith('.ts'));
        return first === undefined || !coversPath(`packages/${basename(dir)}/src/${first}`);
      })
      .map((dir) => basename(dir))
      .sort();

    expect(missing, `ordinary typecheck no longer covers: ${missing.join(', ')}`).toEqual([]);
  });
});
