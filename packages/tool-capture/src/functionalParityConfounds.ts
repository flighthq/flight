import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface FunctionalParityConfound {
  scene: string;
  values: Readonly<Record<string, string>>;
}

export interface FunctionalParityConfoundReport {
  comparedPairs: number;
  confounds: readonly FunctionalParityConfound[];
  scenesWithoutDeclaration: number;
}

/** Describes the fixture-confound state that belongs beside one measured parity distance. */
export function describeFunctionalParityFixtureState(
  sources: ReadonlyMap<string, ReadonlyMap<string, string>>,
  scene: string,
  backends: readonly string[],
): string {
  const fixtures = sources.get(scene);
  if (fixtures?.has('*') && backends.every((backend) => !fixtures.has(backend))) {
    return 'fixture confound: none (shared source)';
  }

  const values: Record<string, string> = {};
  for (const backend of backends) {
    const source = fixtures?.get(backend) ?? fixtures?.get('*');
    if (source === undefined) continue;
    const color = findFunctionalSceneClearColor(source);
    if (color !== null) values[backend] = color;
  }
  const declared = Object.values(values);
  if (declared.length !== backends.length) {
    return 'fixture confound: unknown (clear colour not declared by both fixtures)';
  }
  const detail = Object.entries(values)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([backend, color]) => `${backend}=${color}`)
    .join(' ');
  return new Set(declared).size > 1 ? `fixture confound: YES (${detail})` : `fixture confound: none (${declared[0]})`;
}

/**
 * Compares the declared clear colour of every backend fixture of a scene.
 *
 * `sources` maps a scene name to its per-backend fixture text. A scene contributes a comparison only
 * when at least two of its backends declare a colour, which is what keeps an undeclared fixture from
 * reading as agreement with anything. A `*` entry is one shared source and cannot carry a per-backend
 * fixture disagreement, so it is outside this comparison population.
 */
export function findFunctionalParityConfounds(
  sources: ReadonlyMap<string, ReadonlyMap<string, string>>,
): FunctionalParityConfoundReport {
  const confounds: FunctionalParityConfound[] = [];
  let comparedPairs = 0;
  let scenesWithoutDeclaration = 0;
  for (const scene of [...sources.keys()].sort()) {
    const fixtures = sources.get(scene)!;
    if (fixtures.size === 1 && fixtures.has('*')) continue;
    const values: Record<string, string> = {};
    for (const [backend, source] of fixtures) {
      const color = findFunctionalSceneClearColor(source);
      if (color !== null) values[backend === '*' ? 'shared' : backend] = color;
    }
    const declared = Object.values(values);
    if (declared.length < 2) {
      scenesWithoutDeclaration++;
      continue;
    }
    comparedPairs++;
    if (new Set(declared).size > 1) confounds.push({ scene, values });
  }
  return { comparedPairs, confounds, scenesWithoutDeclaration };
}

/** Reads the clear colour a functional scene fixture declares, or null when it states none. */
export function findFunctionalSceneClearColor(source: string): string | null {
  return /backgroundColor:\s*(0x[0-9a-fA-F]+)/.exec(source)?.[1]?.toLowerCase() ?? null;
}

/** Formats the standalone whole-corpus report. */
export function formatFunctionalParityConfoundReport(report: Readonly<FunctionalParityConfoundReport>): string {
  const lines = report.confounds.map((confound) => {
    const values = Object.entries(confound.values)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([backend, color]) => `${backend}=${color}`)
      .join('  ');
    return `  ${confound.scene}  ${values}`;
  });
  return [
    `${report.confounds.length} confounded scene(s) of ${report.comparedPairs} compared`,
    ...lines,
    `${report.scenesWithoutDeclaration} scene(s) declared no clear colour in two or more backends and were not compared`,
    'A confounded scene’s parity distance measures its fixtures, not its renderers: exclude it from the reading.',
  ].join('\n');
}

/** Reads every functional fixture, grouped by scene; `*` identifies one source shared by all backends. */
export function readFunctionalSceneSources(scenesDirectory: string): Map<string, Map<string, string>> {
  const sources = new Map<string, Map<string, string>>();
  if (!existsSync(scenesDirectory)) return sources;
  for (const entry of readdirSync(scenesDirectory).sort()) {
    if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) continue;
    const backendSpecific = /^(.+)\.([a-z0-9]+)\.ts$/.exec(entry);
    const shared = backendSpecific === null ? /^(.+)\.ts$/.exec(entry) : null;
    if (backendSpecific === null && shared === null) continue;
    const scene = backendSpecific?.[1] ?? shared![1]!;
    const backend = backendSpecific?.[2] ?? '*';
    const byBackend = sources.get(scene) ?? new Map<string, string>();
    byBackend.set(backend, readFileSync(join(scenesDirectory, entry), 'utf8'));
    sources.set(scene, byBackend);
  }
  return sources;
}
