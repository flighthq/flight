// The capture baseline coverage manifest: the committed pin on WHICH targets have comparable baseline
// evidence in the capture regression tier.
//
// ★ THIS IS THE SAME MECHANISM SHAPE AS `scripts/reachability.ts`, deliberately and by name:
// a committed manifest of IDENTITIES (never a count), an explicit diff that names every gain and loss
// individually, and a separate `--update` acceptance path guarded so a scoped run can never accept away
// a whole-repo pin. The two are separate mechanisms over separate subjects — do not merge them — but the
// shape is the same on purpose, so that reading one teaches you the other. The sibling mechanism is the
// registrar manifest — `scripts/reachability.ts --update-registrars` over `scripts/reachability-registrars.json`
// — built to the same four rules over `packageName/registrar` identities, and it cites this one by name.
//
// WHY A MANIFEST AND NOT A COUNT. `isCaptureRegressionCoverageFailure` fails only when a run compared
// NOTHING (`regressionComparisons === 0 && regressionUncovered > 0`). One covered target rescues a run of
// four hundred: the moment a single comparison happens, the floor is satisfied and every other uncovered
// target is reported as a muted status line and counted as skipped, exit 0. So coverage can erode one
// target at a time, silently, and the only trace is a line in a summary nobody diffs. A count would have
// the same hole one level up — it says how many were lost, never WHICH — and a count that drifts down is
// indistinguishable from a target legitimately retired. Identities make a loss nameable and therefore
// reviewable.
//
// The manifest records only that a target HAD a comparable baseline, never what the baseline contained.
// It is a pin on the SHAPE of the evidence, not on the evidence, so re-baselining a scene is not a
// manifest change and does not need acceptance.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface CaptureBaselineCoverageManifest {
  schemaVersion: 1;
  /** Sorted `entry/renderer` identities, keyed by subject (`functional`, `examples`). */
  subjects: Record<string, string[]>;
}

export interface CaptureBaselineCoverageDiff {
  /** Identities covered now that the manifest does not record. */
  gained: string[];
  /** Identities the manifest records that ran and are NO LONGER covered. A failure. */
  lost: string[];
  /** Identities the manifest records that this run never visited. Only meaningful whole-repo. */
  absent: string[];
}

export const CAPTURE_BASELINE_COVERAGE_MANIFEST_VERSION = 1;

/** Where the committed pin lives — one file, keyed by subject, beside the reachability baseline. */
export function captureBaselineCoverageManifestPath(root: string): string {
  return join(root, 'scripts', 'capture-baseline-coverage-manifest.json');
}

export function createCaptureBaselineCoverageManifest(
  subjects: Readonly<Record<string, readonly string[]>>,
): CaptureBaselineCoverageManifest {
  const out: Record<string, string[]> = {};
  for (const [subject, identities] of Object.entries(subjects)) out[subject] = [...identities].sort();
  return { schemaVersion: CAPTURE_BASELINE_COVERAGE_MANIFEST_VERSION, subjects: out };
}

/**
 * Diffs observed coverage against the manifest for one subject.
 *
 * `visited` is every identity whose coverage the run DETERMINED, so a scoped run is judged only on what
 * it settled. `scope.undetermined` names the ones it could not settle at all (a page that never loaded):
 * those are neither a loss nor a vanishing, because the run learned nothing about them.
 * A LOSS (visited, but no baseline) is reportable from any run — the target was there and its evidence
 * was not. An ABSENCE (pinned but never visited) is only meaningful when the run could have visited it,
 * because otherwise "not visited" is indistinguishable from "filtered out".
 *
 * Scope is therefore expressed precisely rather than as one boolean: `entryFiltered` suppresses the
 * absence check entirely (any entry could have been excluded), and `activeRenderers` narrows it to the
 * renderers this run actually ran, so `--renderer=webgl` does not report every canvas pin as vanished.
 */
export function diffCaptureBaselineCoverage(
  manifest: Readonly<CaptureBaselineCoverageManifest>,
  subject: string,
  covered: readonly string[],
  visited: readonly string[],
  scope: Readonly<{
    entryFiltered: boolean;
    activeRenderers: readonly string[] | null;
    undetermined?: readonly string[];
  }>,
): CaptureBaselineCoverageDiff {
  const pinned = new Set(manifest.subjects[subject] ?? []);
  const coveredSet = new Set(covered);
  const visitedSet = new Set(visited);
  const rendererOf = (identity: string): string => identity.slice(identity.lastIndexOf('/') + 1);
  const rendererActive = (identity: string): boolean =>
    scope.activeRenderers === null || scope.activeRenderers.includes(rendererOf(identity));

  const gained = covered.filter((identity) => !pinned.has(identity)).sort();
  const lost = [...pinned].filter((identity) => visitedSet.has(identity) && !coveredSet.has(identity)).sort();
  const undeterminedSet = new Set(scope.undetermined ?? []);
  const absent = scope.entryFiltered
    ? []
    : [...pinned]
        .filter((identity) => rendererActive(identity) && !visitedSet.has(identity) && !undeterminedSet.has(identity))
        .sort();

  return { gained, lost, absent };
}

/** `entry/renderer`, the identity a manifest pins. */
export function formatCaptureBaselineCoverageIdentity(entry: string, renderer: string): string {
  return `${entry}/${renderer}`;
}

/**
 * True when the diff records something the operator must accept or repair — in EITHER direction.
 *
 * A gain fails too, and that is deliberate. The manifest is an exact set, not a floor: an unaccepted gain
 * means the pin no longer describes the tree, so it ages silently until someone finally accepts a mix of
 * current and stale. It also closes the case that justifies identities over a count in the first place —
 * a same-count SWAP, where one target loses its baseline and a different one gains one. Against a count
 * that reconciles; against a floor that only fails on loss it is half-reported; only an exact set names
 * both halves. The sibling registrar manifest fails in both directions for the same reason.
 */
export function isCaptureBaselineCoverageFailure(diff: Readonly<CaptureBaselineCoverageDiff>): boolean {
  return diff.gained.length > 0 || diff.lost.length > 0 || diff.absent.length > 0;
}

/** The committed pin, or an empty manifest when none exists yet. A missing file is not an error. */
export function readCaptureBaselineCoverageManifest(root: string): CaptureBaselineCoverageManifest {
  const path = captureBaselineCoverageManifestPath(root);
  if (!existsSync(path)) return createCaptureBaselineCoverageManifest({});
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const subjects = (parsed as { subjects?: Record<string, string[]> }).subjects;
  return createCaptureBaselineCoverageManifest(subjects ?? {});
}

/**
 * Rewrites ONE subject's pin, preserving every other subject — an update run covers the subject it ran and
 * knows nothing about the other, so it must not speak for it.
 *
 * `activeRenderers` and `determined` apply the same rule one level down, twice. The regression tier is
 * legitimately renderer-scoped (`--renderer=canvas,webgl,webgpu`; DOM produces no fingerprint), so refusing
 * every scoped update would refuse the tier's own canonical command; and within an accepted run a page that
 * failed to load settles nothing about its target. So a pin is retired ONLY when this run positively
 * determined that identity to be uncovered. Everything else is carried forward. One flaky target therefore
 * cannot quietly retire a pin, and cannot block the whole acceptance either.
 */
export function writeCaptureBaselineCoverageManifest(
  root: string,
  subject: string,
  identities: readonly string[],
  activeRenderers: readonly string[] | null = null,
  determined: readonly string[] | null = null,
): CaptureBaselineCoverageManifest {
  const existing = readCaptureBaselineCoverageManifest(root);
  const determinedSet = determined === null ? null : new Set(determined);
  const carried = (existing.subjects[subject] ?? []).filter((identity) => {
    const renderer = identity.slice(identity.lastIndexOf('/') + 1);
    if (activeRenderers !== null && !activeRenderers.includes(renderer)) return true;
    return determinedSet !== null && !determinedSet.has(identity);
  });
  const manifest = createCaptureBaselineCoverageManifest({
    ...existing.subjects,
    [subject]: [...new Set([...carried, ...identities])],
  });
  writeFileSync(captureBaselineCoverageManifestPath(root), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
