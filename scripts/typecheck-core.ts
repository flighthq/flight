export interface TypecheckProject {
  readonly args: readonly string[];
  readonly label: string;
}

export interface TypecheckResult {
  readonly label: string;
  readonly output: string;
  readonly passed: boolean;
}

export type RunTypecheckProject = (project: Readonly<TypecheckProject>) => Promise<TypecheckResult>;

// `@flighthq/types` publishes declarations from dist, so the independently configured functional and
// tools projects resolve that output rather than the package's source. Running them beside the SDK
// build lets a newly changed source tree race stale declarations. This prerequisite emits the current
// declarations before any consumer process exists.
export const typeDeclarationsProject: Readonly<TypecheckProject> = {
  args: ['-b', 'packages/types/tsconfig.json'],
  label: 'types declarations prerequisite',
};

export const typecheckProjects: readonly Readonly<TypecheckProject>[] = [
  { label: 'sdk, examples, and scripts', args: ['-b', '--noEmit'] },
  { label: 'functional scenes', args: ['-p', 'functional/tsconfig.json'] },
  { label: 'tools and root configs', args: ['-p', 'tools/tsconfig.json'] },
];

export async function runTypechecks(limit: number, runProject: RunTypecheckProject): Promise<TypecheckResult[]> {
  const prerequisite = await runProject(typeDeclarationsProject);
  if (!prerequisite.passed) return [prerequisite];
  return [prerequisite, ...(await runProjects(typecheckProjects, limit, runProject))];
}

async function runProjects(
  projects: readonly Readonly<TypecheckProject>[],
  limit: number,
  runProject: RunTypecheckProject,
): Promise<TypecheckResult[]> {
  const results = new Array<TypecheckResult>(projects.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limit), projects.length) }, async () => {
      for (;;) {
        const index = next++;
        const project = projects[index];
        if (project === undefined) return;
        results[index] = await runProject(project);
      }
    }),
  );
  return results;
}
