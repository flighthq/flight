import { describe, expect, it, vi } from 'vitest';

import { runTypechecks, typecheckProjects, typeDeclarationsProject } from './typecheck-core';
import type { TypecheckProject, TypecheckResult } from './typecheck-core';

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
