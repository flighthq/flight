// The capture baseline coverage manifest: the committed pin on WHICH targets have comparable baseline
// evidence in the capture regression tier.
//
// ★ THIS IS THE SAME MECHANISM SHAPE AS `scripts/reachability.ts`, deliberately and by name:
// a committed manifest of IDENTITIES (never a count), an explicit diff that names every gain and loss
// individually, and a separate `--update` acceptance path guarded so a scoped run can never accept away
// a whole-repo pin. The two are separate mechanisms over separate subjects — do not merge them — but the
// shape is the same on purpose, so that reading one teaches you the other. The sibling mechanism is the
// registrar manifest — `scripts/reachability-registrar-manifest.ts` (with its own colocated test) over
// `scripts/reachability-registrars.json`, accepted through `scripts/reachability.ts --update-registrars`
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
//
// ★ ONE DEFECT, THREE TIERS, ONE MANIFEST. The pipeline records which evidence EXISTS and never records
// which evidence SHOULD exist, so wherever evidence is optional its absence is indistinguishable from
// satisfaction. That surfaced independently in three tiers over the SAME target set — a missing
// fingerprint skips the regression comparison, a missing `sha256` leaves `changed` null so
// `--fail-on-changed` cannot fire, and a missing (or misspelled) `assertRender` export silently runs no
// oracle. They are not three defects: they are three kinds of evidence about one row, and a target's
// evidence profile is ONE fact. Three parallel manifests would be three places for that fact to drift
// apart, so the kinds are COLUMNS on one row here, and a loss is named as `target#kind`.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** The three kinds of evidence a capture target can carry. Each is independently losable. */
export type CaptureBaselineEvidenceKind = 'fingerprint' | 'oracle' | 'screenshot';

export interface CaptureBaselineCoverageManifest {
  schemaVersion: 2;
  /**
   * Per subject (`functional`, `examples`): each `entry/renderer` identity mapped to the sorted evidence
   * kinds it carries. A target with no evidence at all is absent rather than mapped to an empty list.
   */
  subjects: Record<string, Record<string, CaptureBaselineEvidenceKind[]>>;
}

export interface CaptureBaselineCoverageDiff {
  /** Identities covered now that the manifest does not record. */
  gained: string[];
  /** Identities the manifest records that ran and are NO LONGER covered. A failure. */
  lost: string[];
  /** Identities the manifest records that this run never visited. Only meaningful whole-repo. */
  absent: string[];
}

export const CAPTURE_BASELINE_COVERAGE_MANIFEST_VERSION = 2;

export const CAPTURE_BASELINE_EVIDENCE_KINDS: readonly CaptureBaselineEvidenceKind[] = [
  'fingerprint',
  'oracle',
  'screenshot',
];

/** Where the committed pin lives — one file, keyed by subject, beside the reachability baseline. */
export function captureBaselineCoverageManifestPath(root: string): string {
  return join(root, 'scripts', 'capture-baseline-coverage-manifest.json');
}

export function createCaptureBaselineCoverageManifest(
  subjects: Readonly<Record<string, Readonly<Record<string, readonly CaptureBaselineEvidenceKind[]>>>>,
): CaptureBaselineCoverageManifest {
  const out: Record<string, Record<string, CaptureBaselineEvidenceKind[]>> = {};
  for (const [subject, targets] of Object.entries(subjects)) {
    const row: Record<string, CaptureBaselineEvidenceKind[]> = {};
    // A target with no evidence at all is ABSENT rather than pinned-with-nothing: pinning an empty row
    // would assert "this target is known to carry no evidence", which is the claim the manifest exists
    // to make impossible to state by accident.
    for (const identity of Object.keys(targets).sort()) {
      const kinds = [...new Set(targets[identity])].sort();
      if (kinds.length > 0) row[identity] = kinds;
    }
    out[subject] = row;
  }
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
  covered: Readonly<Record<string, readonly CaptureBaselineEvidenceKind[]>>,
  visited: readonly string[],
  scope: Readonly<{
    entryFiltered: boolean;
    activeRenderers: readonly string[] | null;
    undetermined?: readonly string[];
    /**
     * The evidence kinds this run was able to observe. A run that never looked at screenshots must not
     * report every screenshot pin as lost — the same not-observed-is-not-absent rule the other two scope
     * fields apply to entries and renderers, applied to the third axis.
     */
    kinds?: readonly CaptureBaselineEvidenceKind[];
  }>,
): CaptureBaselineCoverageDiff {
  const kindObserved = (kind: CaptureBaselineEvidenceKind): boolean =>
    scope.kinds === undefined || scope.kinds.includes(kind);
  const pinnedRows = manifest.subjects[subject] ?? {};
  const pinned = new Set(
    Object.entries(pinnedRows).flatMap(([identity, kinds]) =>
      kinds.filter(kindObserved).map((kind) => formatCaptureBaselineEvidenceIdentity(identity, kind)),
    ),
  );
  const coveredSet = new Set(
    Object.entries(covered).flatMap(([identity, kinds]) =>
      [...kinds].filter(kindObserved).map((kind) => formatCaptureBaselineEvidenceIdentity(identity, kind)),
    ),
  );
  const visitedSet = new Set(visited);
  const targetOf = (evidence: string): string => evidence.slice(0, evidence.lastIndexOf('#'));
  const rendererOf = (identity: string): string => identity.slice(identity.lastIndexOf('/') + 1);
  const rendererActive = (identity: string): boolean =>
    scope.activeRenderers === null || scope.activeRenderers.includes(rendererOf(identity));

  const gained = [...coveredSet].filter((evidence) => !pinned.has(evidence)).sort();
  const lost = [...pinned].filter((evidence) => visitedSet.has(targetOf(evidence)) && !coveredSet.has(evidence)).sort();
  const undeterminedSet = new Set(scope.undetermined ?? []);
  const absent = scope.entryFiltered
    ? []
    : [...pinned]
        .filter((evidence) => {
          const identity = targetOf(evidence);
          return rendererActive(identity) && !visitedSet.has(identity) && !undeterminedSet.has(identity);
        })
        .sort();

  return { gained, lost, absent };
}

/** `entry/renderer`, the identity a manifest pins. */
export function formatCaptureBaselineCoverageIdentity(entry: string, renderer: string): string {
  return `${entry}/${renderer}`;
}

/** `entry/renderer#kind` — the unit a loss is named in. `#` because a renderer id may contain `:`. */
export function formatCaptureBaselineEvidenceIdentity(identity: string, kind: CaptureBaselineEvidenceKind): string {
  return `${identity}#${kind}`;
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

/** Every `target#kind` a manifest pins for one subject, sorted. */
export function listCaptureBaselineEvidence(
  manifest: Readonly<CaptureBaselineCoverageManifest>,
  subject: string,
): string[] {
  const targets = manifest.subjects[subject] ?? {};
  return Object.entries(targets)
    .flatMap(([identity, kinds]) => kinds.map((kind) => formatCaptureBaselineEvidenceIdentity(identity, kind)))
    .sort();
}

/** The committed pin, or an empty manifest when none exists yet. A missing file is not an error. */
export function readCaptureBaselineCoverageManifest(root: string): CaptureBaselineCoverageManifest {
  const path = captureBaselineCoverageManifestPath(root);
  if (!existsSync(path)) return createCaptureBaselineCoverageManifest({});
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const subjects = (parsed as { subjects?: Record<string, unknown> }).subjects ?? {};
  const migrated: Record<string, Record<string, readonly CaptureBaselineEvidenceKind[]>> = {};
  for (const [subject, value] of Object.entries(subjects)) {
    // Schema 1 pinned a bare identity list, and every identity in it meant "has a comparable fingerprint"
    // because that was the only evidence kind the manifest knew about. Read it as exactly that claim
    // rather than as a target with all three, which would manufacture pins nobody ever accepted.
    migrated[subject] = Array.isArray(value)
      ? Object.fromEntries((value as string[]).map((identity) => [identity, ['fingerprint' as const]]))
      : (value as Record<string, CaptureBaselineEvidenceKind[]>);
  }
  return createCaptureBaselineCoverageManifest(migrated);
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
  covered: Readonly<Record<string, readonly CaptureBaselineEvidenceKind[]>>,
  activeRenderers: readonly string[] | null = null,
  determined: readonly string[] | null = null,
  observedKinds: readonly CaptureBaselineEvidenceKind[] | null = null,
): CaptureBaselineCoverageManifest {
  const existing = readCaptureBaselineCoverageManifest(root);
  const determinedSet = determined === null ? null : new Set(determined);
  const previous = existing.subjects[subject] ?? {};
  const merged: Record<string, CaptureBaselineEvidenceKind[]> = {};
  for (const [identity, kinds] of Object.entries(previous)) {
    const renderer = identity.slice(identity.lastIndexOf('/') + 1);
    const rendererOutOfScope = activeRenderers !== null && !activeRenderers.includes(renderer);
    const notDetermined = determinedSet !== null && !determinedSet.has(identity);
    // Carry forward every kind this run could not speak for: a renderer it did not run, a target it
    // never settled, or an evidence kind it never observed. A run retires only what it positively
    // determined to be gone, on all three axes.
    const carried = kinds.filter(
      (kind) => rendererOutOfScope || notDetermined || (observedKinds !== null && !observedKinds.includes(kind)),
    );
    if (carried.length > 0) merged[identity] = carried;
  }
  for (const [identity, kinds] of Object.entries(covered)) {
    merged[identity] = [...new Set([...(merged[identity] ?? []), ...kinds])];
  }
  const manifest = createCaptureBaselineCoverageManifest({ ...existing.subjects, [subject]: merged });
  writeFileSync(captureBaselineCoverageManifestPath(root), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}
