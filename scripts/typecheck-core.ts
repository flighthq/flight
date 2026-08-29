import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface ToolsCoverage {
  readonly excludedFromOrdinary: readonly string[];
  readonly optIn: readonly string[];
  readonly ordinary: readonly string[];
  readonly sources: readonly string[];
  readonly uncoveredHostProbe: readonly string[];
  readonly uncoveredTools: readonly string[];
}

export interface TsconfigPatterns {
  readonly exclude: readonly string[];
  readonly include: readonly string[];
}

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

// Both the guard in `typecheck.test.ts` and the calibration in `typecheck-host-probe.ts` read coverage
// through this one model. Two implementations would let the calibration certify a model the guard does not
// use — the drift it exists to catch.
export function createTsconfigMatcher(
  patterns: Readonly<TsconfigPatterns>,
  prefix = '',
): (relative: string) => boolean {
  const include = patterns.include.map((pattern) => createPatternMatcher(pattern, prefix));
  const exclude = patterns.exclude.map((pattern) => createPatternMatcher(pattern, prefix));
  return (relative) => include.some((matches) => matches(relative)) && !exclude.some((matches) => matches(relative));
}

export function listToolsSources(toolsDir: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      // Build output and native target trees are not sources, and `src-tauri/target` is large enough that
      // walking it would dominate the guard's runtime.
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'target') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) found.push(relative(toolsDir, full).replace(/\\/g, '/'));
    }
  };
  walk(toolsDir);
  return found.sort();
}

export function readToolsCoverage(repoRoot: string): ToolsCoverage {
  const toolsDir = join(repoRoot, 'tools');
  const sources = listToolsSources(toolsDir);
  const coveredByOrdinary = createTsconfigMatcher(readTsconfigPatterns(join(toolsDir, 'tsconfig.json')));
  const coveredByOptIn = createTsconfigMatcher(
    readTsconfigPatterns(join(toolsDir, 'host-probe', 'tsconfig.json')),
    'host-probe/',
  );
  const excludedFromOrdinary = sources.filter((file) => file.startsWith('host-probe/') && !coveredByOrdinary(file));
  return {
    excludedFromOrdinary,
    optIn: sources.filter(coveredByOptIn),
    ordinary: sources.filter(coveredByOrdinary),
    sources,
    uncoveredHostProbe: excludedFromOrdinary.filter((file) => !coveredByOptIn(file)),
    uncoveredTools: sources.filter((file) => !coveredByOrdinary(file) && !coveredByOptIn(file)),
  };
}

export function readTsconfigPatterns(path: string): TsconfigPatterns {
  // These configs carry `//` comments, so strip them rather than adding a JSONC dependency for one read.
  const raw = readFileSync(path, 'utf-8')
    .split('\n')
    .map((line) => (/^\s*\/\//.test(line) ? '' : line.replace(/\s+\/\/.*$/, '')))
    .join('\n');
  const config = JSON.parse(raw) as { exclude?: string[]; include?: string[] };
  return { exclude: config.exclude ?? [], include: config.include ?? [] };
}

export async function runTypechecks(limit: number, runProject: RunTypecheckProject): Promise<TypecheckResult[]> {
  const prerequisite = await runProject(typeDeclarationsProject);
  if (!prerequisite.passed) return [prerequisite];
  return [prerequisite, ...(await runProjects(typecheckProjects, limit, runProject))];
}

// TypeScript reads a bare `include` entry as a directory subtree when it names one and as a file when it
// ends in an extension, so a matcher built only from globs would silently miss `"src"`.
function createPatternMatcher(pattern: string, prefix: string): (relative: string) => boolean {
  const full = `${prefix}${pattern.replace(/^\.\//, '')}`;
  if (!full.includes('*')) {
    if (full.endsWith('.ts')) return (relative) => relative === full;
    return (relative) => relative.startsWith(`${full}/`);
  }
  const escaped = full
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '<globstar-slash>')
    .replace(/\*\*/g, '<globstar>')
    .replace(/\*/g, '[^/]*')
    .replace(/<globstar-slash>/g, '(?:.*/)?')
    .replace(/<globstar>/g, '.*');
  const expression = new RegExp(`^${escaped}$`);
  return (relative) => expression.test(relative);
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
