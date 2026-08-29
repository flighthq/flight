import { existsSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  createTsconfigMatcher,
  readToolsCoverage,
  readTsconfigPatterns,
  runTypechecks,
  typecheckProjects,
  typeDeclarationsProject,
} from './typecheck-core';
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
    const patterns = readTsconfigPatterns(join(root, 'tsconfig.json'));
    expect(patterns.include.length).toBeGreaterThan(0);
    const coversPath = createTsconfigMatcher(patterns);

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

// ★ THE TWO PROJECTS MUST NOT LEAVE A GAP BETWEEN THEM. The ordinary project excludes host-probe's
// target-specific files; `tools/host-probe/tsconfig.json` is the opt-in project that covers them where the
// toolchains exist. Nothing structural ties those two lists together, so a file can fall out of one without
// falling into the other and be typechecked by nothing, on any machine — silently, because the gate it left
// is the one that got greener.
//
// Coverage is deliberately NOT equality. The opt-in project also covers the host-agnostic files the ordinary
// gate already checks, and forcing the two sets to match would mean narrowing the opt-in `include` to buy no
// checking at all. Containment is the property that matters.
//
// `npm run typecheck:host-probe` calibrates this model against real `tsc` output where the toolchains are
// installed; see the note in `typecheck-host-probe.ts` for why the guard itself cannot ask `tsc`.
describe('tools typecheck coverage', () => {
  it('covers every host-probe file the ordinary project excludes, and names any it drops', () => {
    const coverage = readToolsCoverage(resolve(__dirname, '..'));

    // Guard the guard, twice. A matcher bug that matched nothing would leave both populations empty and
    // pass by comparing one empty set against another.
    expect(coverage.sources.length).toBeGreaterThan(20);
    expect(coverage.excludedFromOrdinary.length).toBeGreaterThan(0);

    expect(
      coverage.uncoveredHostProbe,
      `excluded from the ordinary project and not covered by the opt-in project: ${coverage.uncoveredHostProbe.join(', ')}`,
    ).toEqual([]);
  });

  it('leaves no file under tools/ that neither project covers', () => {
    const coverage = readToolsCoverage(resolve(__dirname, '..'));

    expect(coverage.ordinary.length).toBeGreaterThan(0);
    expect(coverage.optIn.length).toBeGreaterThan(0);

    // Wider than the containment check on purpose: today the only excluded files are host-probe's, so the
    // two agree. An exclusion added tomorrow for `tools/review` or `tools/capture` — neither of which has an
    // opt-in project to catch it — fails here and stays invisible to the check above.
    expect(
      coverage.uncoveredTools,
      `typechecked by neither the ordinary nor the opt-in project: ${coverage.uncoveredTools.join(', ')}`,
    ).toEqual([]);
  });
});
