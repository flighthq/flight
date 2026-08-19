// Finds functional scene pairs whose per-backend fixtures declare DIFFERENT clear colours, so a
// cross-backend parity delta for those scenes cannot be read as a renderer disagreement.
//
// WHY THIS EXISTS AS A SCRIPT RATHER THAN A NOTE. A parity run reports one distance per scene pair.
// When the two fixtures of a pair state different background colours, every background pixel differs
// by construction and each renderer is faithfully honouring what its own fixture asked for. The
// resulting distance therefore scales with how much BACKGROUND AREA the scene has, which ranks scenes
// by emptiness rather than by disagreement — and it does so while every scene still passes, because
// the distances stay under the parity tolerance. A reader who does not know this rediscovers a
// ranking of empty space.
//
// The pair list is DERIVED from the fixtures on every run, never recorded here, so it stays true as
// scenes are added, aligned, or removed. Aligning the fixtures is a separate decision with a
// regression-baseline cost: changing a scene's clear colour changes its committed fingerprint, and a
// baseline is only valid where it was captured. This script therefore REPORTS and never enforces.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findCaptureFixtureBackground } from '@flighthq/tool-capture';

export interface FunctionalParityConfound {
  scene: string;
  values: Readonly<Record<string, string>>;
}

export interface FunctionalParityConfoundReport {
  comparedPairs: number;
  confounds: readonly FunctionalParityConfound[];
  scenesWithoutDeclaration: number;
}

/**
 * Reads the clear colour a functional scene fixture declares, or null when it states none.
 *
 * Delegates to `@flighthq/tool-capture` so this corpus scan and the per-run validation report's
 * `fixtureBackgroundMismatch` field read ONE detector. They used to be two independent enumerations
 * with no join between them, which is how a scan could report a clean corpus while a run reported a
 * distance nothing had qualified.
 */
export function findFunctionalSceneClearColor(source: string): string | null {
  return findCaptureFixtureBackground(source);
}

/**
 * Compares the declared clear colour of every backend fixture of a scene.
 *
 * `sources` maps a scene name to its per-backend fixture text. A scene contributes a comparison only
 * when at least two of its backends declare a colour, which is what keeps an undeclared fixture from
 * reading as agreement with anything.
 */
export function findFunctionalParityConfounds(
  sources: ReadonlyMap<string, ReadonlyMap<string, string>>,
): FunctionalParityConfoundReport {
  const confounds: FunctionalParityConfound[] = [];
  let comparedPairs = 0;
  let scenesWithoutDeclaration = 0;
  for (const scene of [...sources.keys()].sort()) {
    const values: Record<string, string> = {};
    for (const [backend, source] of sources.get(scene)!) {
      const color = findFunctionalSceneClearColor(source);
      if (color !== null) values[backend] = color;
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

/** Reads every `<scene>.<backend>.ts` fixture in a directory, grouped by scene. */
export function readFunctionalSceneSources(scenesDirectory: string): Map<string, Map<string, string>> {
  const sources = new Map<string, Map<string, string>>();
  for (const entry of readdirSync(scenesDirectory).sort()) {
    const match = /^(.+)\.([a-z0-9]+)\.ts$/.exec(entry);
    if (match === null || entry.endsWith('.test.ts')) continue;
    const [, scene, backend] = match as unknown as [string, string, string];
    const byBackend = sources.get(scene) ?? new Map<string, string>();
    byBackend.set(backend, readFileSync(join(scenesDirectory, entry), 'utf8'));
    sources.set(scene, byBackend);
  }
  return sources;
}

/**
 * Formats the report.
 *
 * The compared-pair count is printed BESIDE the findings so an empty result cannot be read as an
 * all-clear: zero confounds over zero compared pairs means the scan found nothing to compare, which
 * is a different fact from zero confounds over ninety-six.
 */
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

const SCRIPT_PATH = fileURLToPath(import.meta.url);

if (resolve(process.argv[1] ?? '') === resolve(SCRIPT_PATH)) {
  const scenesDirectory = join(resolve(dirname(SCRIPT_PATH), '..'), 'functional', 'scenes');
  process.stdout.write(
    `${formatFunctionalParityConfoundReport(findFunctionalParityConfounds(readFunctionalSceneSources(scenesDirectory)))}\n`,
  );
}
