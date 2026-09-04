// Finds functional scenes whose backends agree on WHAT they drew but disagree on WHICH WAY UP.
//
// WHY THIS IS ITS OWN INSTRUMENT. A parity comparison reports one distance per backend pair. A
// vertically mirrored render disagrees in almost every cell, so it produces a LARGE distance that
// reads exactly like "these renderers draw different things" — when in fact they draw the same thing
// with opposite Y origins. The two cases are indistinguishable from the distance alone, and they have
// completely different causes: one is a rendering defect, the other is an unhandled orientation
// convention. Comparing a fingerprint against its MIRRORED partner separates them, because only a
// genuine mirror gets dramatically closer when flipped.
//
// GL render targets are bottom-left origin, image space is top-left, and effects that read an
// ABSOLUTE vertical coordinate must compensate for that. An effect that reads only its own
// neighbourhood cannot show this, which is why the symptom appears in a minority of effects.
//
// ⚠ IT FINDS MIRRORS, NOT THE CAUSE. The same opposite-Y-origin bug reaches the screen in several
// shapes, and only one of them is a mirror: a gradient reading y INVERTS, discrete bands MIRROR, a
// y-driven sine SHIFTS PHASE, and a term like abs(y - centre) is IDENTICAL at centre 0.5 and mirrored
// nowhere else. Only the second shape moves closer when flipped. So a null here means no mirrored
// scene, never a clean orientation bill of health — four of the five instances found in this repo
// were invisible to it. Read a null as "look for the other shapes", not as "there are none".
//
// This runs on the COMMITTED baseline fingerprints, so it needs no browser, no capture and no GPU,
// and gives the same answer anywhere the repository is checked out. It REPORTS and never enforces: a
// mirror is a finding about a shader, and fixing one changes that scene's committed fingerprint.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareBitmapFingerprints, parseBitmapFingerprint } from '@flighthq/bitmap/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { BitmapFingerprint } from '@flighthq/types/contract';

export interface FunctionalOrientationFinding {
  backends: readonly [string, string];
  direct: number;
  mirrored: number;
  scene: string;
}

export interface FunctionalOrientationReport {
  comparedPairs: number;
  findings: readonly FunctionalOrientationFinding[];
  scenesWithoutPair: number;
}

/** Mirrors a fingerprint grid top-to-bottom, leaving each row's contents in place. */
export function mirrorBitmapFingerprintVertically(fingerprint: Readonly<BitmapFingerprint>): BitmapFingerprint {
  const { gridSize } = fingerprint;
  const rowBytes = gridSize * 3;
  const cells = new Uint8Array(fingerprint.cells.length);
  for (let row = 0; row < gridSize; row++) {
    const source = fingerprint.cells.subarray(row * rowBytes, (row + 1) * rowBytes);
    cells.set(source, (gridSize - 1 - row) * rowBytes);
  }
  const out = allocateEntity<BitmapFingerprint>();
  out.cells = cells;
  out.gridSize = gridSize;
  return finishEntity(out);
}

/**
 * Compares every backend pair of a scene directly and mirrored.
 *
 * A pair is reported when mirroring brings the two substantially closer — the signature of an
 * orientation disagreement rather than a content one. `ratio` is how many times closer the mirrored
 * comparison must be before the pair is reported; a genuine mirror collapses by orders of magnitude,
 * so the threshold is not delicate.
 */
export function findFunctionalOrientationDisagreements(
  fingerprints: ReadonlyMap<string, ReadonlyMap<string, string>>,
  ratio = 4,
): FunctionalOrientationReport {
  const findings: FunctionalOrientationFinding[] = [];
  let comparedPairs = 0;
  let scenesWithoutPair = 0;
  for (const scene of [...fingerprints.keys()].sort()) {
    const parsed = new Map<string, BitmapFingerprint>();
    for (const [backend, text] of fingerprints.get(scene)!) {
      const value = parseBitmapFingerprint(text);
      if (value !== null) parsed.set(backend, value);
    }
    const backends = [...parsed.keys()].sort();
    if (backends.length < 2) {
      scenesWithoutPair++;
      continue;
    }
    for (let i = 0; i < backends.length; i++) {
      for (let j = i + 1; j < backends.length; j++) {
        const a = parsed.get(backends[i]!)!;
        const b = parsed.get(backends[j]!)!;
        if (a.gridSize !== b.gridSize) continue;
        comparedPairs++;
        const direct = compareBitmapFingerprints(a, b);
        const mirrored = compareBitmapFingerprints(a, mirrorBitmapFingerprintVertically(b));
        // A pair that already matches has nothing to explain; only a real disagreement can be a mirror.
        if (direct > 1 && mirrored * ratio < direct) {
          findings.push({ backends: [backends[i]!, backends[j]!], direct, mirrored, scene });
        }
      }
    }
  }
  return { comparedPairs, findings, scenesWithoutPair };
}

/** Reads every baseline's per-backend fingerprint, grouped by scene. */
export function readFunctionalBaselineFingerprints(baselineDirectory: string): Map<string, Map<string, string>> {
  const scenes = new Map<string, Map<string, string>>();
  for (const entry of readdirSync(baselineDirectory).sort()) {
    if (!entry.endsWith('.json')) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(baselineDirectory, entry), 'utf8'));
    } catch {
      continue;
    }
    if (typeof parsed !== 'object' || parsed === null) continue;
    const byBackend = new Map<string, string>();
    for (const [backend, column] of Object.entries(parsed as Record<string, unknown>)) {
      const fingerprint = (column as { fingerprint?: unknown } | null)?.fingerprint;
      if (typeof fingerprint === 'string') byBackend.set(backend, fingerprint);
    }
    if (byBackend.size > 0) scenes.set(entry.slice(0, -'.json'.length), byBackend);
  }
  return scenes;
}

/**
 * Formats the report.
 *
 * The compared-pair count sits beside the findings so an empty result cannot be read as an all-clear:
 * no findings over no comparisons means the scan had nothing to look at, which is a different fact
 * from no findings over every committed baseline.
 */
export function formatFunctionalOrientationReport(report: Readonly<FunctionalOrientationReport>): string {
  const lines = report.findings.map(
    (finding) =>
      `  ${finding.scene}  ${finding.backends.join('·')}  direct ${finding.direct.toFixed(2)}` +
      `  mirrored ${finding.mirrored.toFixed(2)}`,
  );
  return [
    `${report.findings.length} scene(s) of ${report.comparedPairs} compared pair(s) agree only when mirrored`,
    ...lines,
    `${report.scenesWithoutPair} scene(s) carry fewer than two comparable fingerprints`,
    'Agreeing only when mirrored is an orientation disagreement, not a content one: the backends drew',
    'the same thing the other way up. A null finds no MIRROR — the same cause also inverts gradients,',
    'shifts the phase of y-driven patterns, and hides entirely where a parameter is symmetric.',
  ].join('\n');
}

const SCRIPT_PATH = fileURLToPath(import.meta.url);

if (resolve(process.argv[1] ?? '') === resolve(SCRIPT_PATH)) {
  const baselines = join(resolve(dirname(SCRIPT_PATH), '..'), 'functional', 'baselines');
  process.stdout.write(
    `${formatFunctionalOrientationReport(findFunctionalOrientationDisagreements(readFunctionalBaselineFingerprints(baselines)))}\n`,
  );
}
