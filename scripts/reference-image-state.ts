import type { ReferenceImageCellComparison } from './reference-image-compare';
// The Flight-side join of the render-oracle proposal (agents/render-reference-image-repository.md §6 and §9):
// given what the coverage manifest REQUIRES, what the lock PINS, and what the request queue has
// OUTSTANDING, decide each cell's verdict — and decide it in one place so "pending" cannot mean two
// things in two reports.
//
// ★ WHY A JOIN AND NOT THREE INDEPENDENT CHECKS. The states are not independent: a missing image is a
// hard failure ONLY when nothing requested it, and a mismatch is demoted to pending ONLY when a request
// names that exact cell. Computed separately, each check has to re-derive the other two's inputs, and
// the version that drifts is whichever one a later change forgets — the parallel-re-derivation failure
// the diagnostics convention names. One function, one table, one vocabulary.
//
// ★ PENDING IS A NARROW ALLOWANCE, NOT A SKIP LIST (§6). It never prints as a pass, it demotes only the
// cells its request names, and a request that has gone stale stops demoting anything. The document is
// explicit that without a bound "the commissioning queue becomes a permanent skip list under a more
// reassuring name", so `maxPendingDays` is a required input here rather than an option with a default.
//
// ★ IDENTITIES ARE OPAQUE. Nothing here parses `subject/entry/renderer`. §10 has not been ruled, so the
// keying may gain an environment column; when it does, the generator changes and this file does not.
import type { ReferenceImageRequest } from './reference-image-records';
import { getOracleRequestCells } from './reference-image-records';
import { referenceImageComparisonPasses, type ReferenceImageVerdictPolicy } from './reference-image-tolerance';

export type { ReferenceImageCellComparison } from './reference-image-compare';

/** What CI may claim about one required cell. Ordered worst-first for stable reporting. */
export type ReferenceImageCellVerdict =
  /** Required, no pinned bytes, and nothing outstanding asked for them. §6 row 4. */
  | 'missing'
  /** Pinned bytes exist for a cell nothing requires — evidence with no live referent. */
  | 'orphan'
  /** Compared and outside tolerance, with no request covering it. */
  | 'regressed'
  /** A dimension change: reported as a verdict rather than thrown, so one resized scene cannot abort the corpus. */
  | 'incomparable'
  /** A request names it and no pinned bytes exist yet: explicitly pending, no comparison claimed. §6 row 3. */
  | 'pending-uncaptured'
  /** A request names it, prior bytes exist, and the movement is in scope. §6 row 2. */
  | 'pending-changed'
  /** Compared against the pinned bytes and within tolerance. The only verdict that is a pass. */
  | 'compared';

export interface ReferenceImageCellInput {
  identity: string;
  /** Does the coverage manifest require a referenceImage for this cell? */
  required: boolean;
  /** Did the lock's packs supply bytes for it? */
  pinned: boolean;
  /**
   * The comparison outcome, when one was actually performed. `null` when no comparison was attempted —
   * which is not the same as a comparison that found nothing, and is why this is not a boolean.
   */
  comparison: ReferenceImageCellComparison | null;
  /** Per-scene policy resolved by the shared catalog. Absent only for legacy/pure-function callers. */
  comparisonPolicy?: Readonly<ReferenceImageVerdictPolicy>;
}

/** Kept as the public join name; its implementation and meaning live in the shared tolerance module. */
export type ReferenceImageComparisonPolicy = ReferenceImageVerdictPolicy;

export interface ReferenceImageRequestRecord {
  request: ReferenceImageRequest;
  /** Age in days at evaluation time, supplied by the caller so this stays a pure function. */
  ageDays: number;
}

export interface ReferenceImageJoinInput {
  cells: readonly ReferenceImageCellInput[];
  requests: readonly ReferenceImageRequestRecord[];
  /** Legacy/pure-function fallback. Production cells carry the shared resolver's per-scene policy. */
  policy?: Readonly<ReferenceImageComparisonPolicy>;
  /** §6: repository policy must bound how long a request may remain pending. No default is offered. */
  maxPendingDays: number;
}

export interface ReferenceImageCellResult {
  identity: string;
  verdict: ReferenceImageCellVerdict;
  /** The request id that demoted this cell, when one did. */
  requestId: string | null;
  detail: string;
}

export interface ReferenceImageJoinResult {
  cells: readonly ReferenceImageCellResult[];
  /** Every failure the run must surface, worst-first. Empty means the run may pass. */
  failures: readonly ReferenceImageJoinFailure[];
  /** Cells that compared and passed. Zero of these with work outstanding is itself a failure. */
  comparedCount: number;
  pendingCount: number;
}

export interface ReferenceImageJoinFailure {
  kind: ReferenceImageJoinFailureKind;
  identity: string | null;
  detail: string;
}

export type ReferenceImageJoinFailureKind =
  | 'missing-reference-image'
  | 'orphaned-reference-image'
  | 'regression'
  | 'incomparable-dimensions'
  | 'zero-comparisons'
  | 'request-expired'
  | 'request-overlap'
  | 'request-off-target';

/**
 * Unions the cells a pack supplied with the identities the coverage manifest REQUIRES.
 *
 * ★ WITHOUT THIS, HALF OF §6 IS UNREACHABLE. A caller that builds its cell list from the pack images
 * alone can only ask "do the bytes we already have still match" — the one question that cannot detect an
 * absence. A required cell no pack supplies never appears, so `missing` and `pending-uncaptured` can
 * never be reached; and every pack cell arrives marked required by construction, so `orphan` cannot be
 * reached either. Three of the four rows in the §6 table were dead for exactly that reason.
 *
 * Requirement comes from the coverage manifest and pinning comes from the packs, so the two are read
 * from different records on purpose: an agent can make CI green by deleting a requirement only through a
 * reviewed coverage reduction, never by failing to publish bytes.
 */
export function withRequiredIdentities(
  cells: readonly Readonly<ReferenceImageCellInput>[],
  required: ReadonlySet<string>,
): ReferenceImageCellInput[] {
  const joined = cells.map((cell) => ({ ...cell, required: required.has(cell.identity) }));
  const supplied = new Set(joined.map((cell) => cell.identity));
  for (const identity of required) {
    if (!supplied.has(identity)) joined.push({ comparison: null, identity, pinned: false, required: true });
  }
  return joined;
}

/**
 * Joins requirement, pinned bytes and outstanding requests into one verdict per cell, plus the run-level
 * gates. Pure: the caller supplies ages and comparison outcomes, so this is decidable in a unit test
 * without a network, a GPU, or a clock.
 */
export function joinOracleState(input: Readonly<ReferenceImageJoinInput>): ReferenceImageJoinResult {
  const failures: ReferenceImageJoinFailure[] = [];
  const required = new Set(input.cells.filter((cell) => cell.required).map((cell) => cell.identity));
  const live = new Set(input.cells.map((cell) => cell.identity));

  // Which cells are legitimately demoted, and by which request. Expired requests demote nothing — an
  // unbounded queue is a skip list — and a cell claimed twice is rejected rather than arbitrated, since
  // picking a winner would make the overlap invisible in exactly the case it matters.
  const demotedBy = new Map<string, string>();
  const claimants = new Map<string, string[]>();
  for (const record of input.requests) {
    const expired = record.ageDays > input.maxPendingDays;
    if (expired) {
      failures.push({
        kind: 'request-expired',
        identity: null,
        detail: `request ${record.request.id} is ${record.ageDays}d old, over the ${input.maxPendingDays}d bound`,
      });
    }
    for (const cell of getOracleRequestCells(record.request)) {
      claimants.set(cell, [...(claimants.get(cell) ?? []), record.request.id]);
      // A request may only name cells that exist and are required; otherwise it could silence a cell
      // nobody is watching, or pre-authorise one that was never commissioned.
      if (!live.has(cell) || !required.has(cell)) {
        failures.push({
          kind: 'request-off-target',
          identity: cell,
          detail: `request ${record.request.id} names ${cell}, which is not a required live cell`,
        });
        continue;
      }
      if (!expired) demotedBy.set(cell, record.request.id);
    }
  }
  for (const [cell, ids] of claimants) {
    if (ids.length > 1) {
      failures.push({
        kind: 'request-overlap',
        identity: cell,
        detail: `${cell} is claimed by ${ids.length} open requests: ${ids.join(', ')}`,
      });
    }
  }

  const cells: ReferenceImageCellResult[] = [];
  let comparedCount = 0;
  let pendingCount = 0;

  for (const cell of input.cells) {
    const requestId = demotedBy.get(cell.identity) ?? null;

    if (!cell.required) {
      if (cell.pinned) {
        cells.push({ identity: cell.identity, verdict: 'orphan', requestId, detail: 'pinned with no requirement' });
        failures.push({
          kind: 'orphaned-reference-image',
          identity: cell.identity,
          detail: 'a pinned reference image has no live required target',
        });
      }
      continue;
    }

    if (!cell.pinned) {
      if (requestId !== null) {
        pendingCount += 1;
        cells.push({
          identity: cell.identity,
          verdict: 'pending-uncaptured',
          requestId,
          detail: 'commissioned; no blessed bytes yet, so no comparison is claimed',
        });
      } else {
        cells.push({
          identity: cell.identity,
          verdict: 'missing',
          requestId: null,
          detail: 'required, unpinned, and nothing requested it',
        });
        failures.push({
          kind: 'missing-reference-image',
          identity: cell.identity,
          detail: 'required reference image is absent and uncommissioned',
        });
      }
      continue;
    }

    const comparison = cell.comparison;
    if (comparison === null) {
      cells.push({
        identity: cell.identity,
        verdict: 'missing',
        requestId,
        detail: 'pinned but never compared — a capture that did not run is missing, not passing',
      });
      failures.push({
        kind: 'missing-reference-image',
        identity: cell.identity,
        detail: 'pinned reference image was never compared',
      });
      continue;
    }

    // A dimension change is a verdict, not a crash (§9). getBitmapMismatch throws on mismatched sizes,
    // which is correct for a programmer error but wrong for a corpus run: one resized scene must not
    // abort the other four hundred.
    //
    // ★ A REQUEST DEMOTES IT, EXACTLY AS IT DEMOTES A PIXEL CHANGE BELOW. A resize is the clearest case
    // of "a request names it, prior bytes exist, and the movement is in scope" there is — the scene was
    // deliberately reframed and new bytes have been asked for. This branch used to push its failure
    // BEFORE the `requestId` check the pixel path gets, so the one movement a commission cannot rescue
    // was the one where the reference is most obviously superseded: a corpus with a requested resize
    // stayed red until the new bytes were blessed, with nothing a reviewer could do about it in between.
    // Both paths now answer the same question in the same order — is this movement already requested?
    if (comparison.dimensionMismatch) {
      if (requestId !== null) {
        pendingCount += 1;
        cells.push({
          identity: cell.identity,
          verdict: 'pending-changed',
          requestId,
          detail: 'in-scope resize awaiting blessing — reference and candidate differ in size',
        });
        continue;
      }
      cells.push({
        identity: cell.identity,
        verdict: 'incomparable',
        requestId,
        detail: 'reference and candidate differ in size',
      });
      failures.push({
        kind: 'incomparable-dimensions',
        identity: cell.identity,
        detail: 'reference and candidate differ in size',
      });
      continue;
    }

    const policy = cell.comparisonPolicy ?? input.policy;
    if (policy === undefined) {
      throw new Error(`reference-image comparison policy was not resolved for ${cell.identity}`);
    }
    if (referenceImageComparisonPasses(comparison, policy)) {
      comparedCount += 1;
      cells.push({ identity: cell.identity, verdict: 'compared', requestId, detail: describe(comparison) });
      continue;
    }

    if (requestId !== null) {
      pendingCount += 1;
      cells.push({
        identity: cell.identity,
        verdict: 'pending-changed',
        requestId,
        detail: `in-scope movement awaiting blessing — ${describe(comparison)}`,
      });
      continue;
    }

    cells.push({ identity: cell.identity, verdict: 'regressed', requestId: null, detail: describe(comparison) });
    failures.push({ kind: 'regression', identity: cell.identity, detail: describe(comparison) });
  }

  // §9: "a gated run that compared zero NON-PENDING images is unconfigured, not clean." The denominator is
  // the non-pending required cells, not every required cell.
  //
  // ★ THE SEED RUN IS WHY THIS IS NOT `comparedCount === 0 && required.size > 0`. Commissioning the very
  // first reference image leaves exactly one required cell, legitimately pending, and nothing to compare —
  // the documented bootstrap state (§6, "pending → locked and gating"). The stricter form failed it, which
  // would have made the first run of the mechanism indistinguishable from a broken one and taught everybody
  // to expect a red on seeding. A gate that cries wolf on the state the design intends is worse than no
  // gate: it fires when nothing is wrong, so it is ignored when something is.
  const gatedCells = required.size - pendingCount;
  if (comparedCount === 0 && gatedCells > 0) {
    failures.push({
      kind: 'zero-comparisons',
      identity: null,
      detail: `${gatedCells} non-pending required cell(s) and zero comparisons — unconfigured, not clean`,
    });
  }

  return { cells, failures, comparedCount, pendingCount };
}

/** Stable one-line summary of a comparison, so a report row and a failure detail cannot disagree. */
export function describeOracleComparison(comparison: Readonly<ReferenceImageCellComparison>): string {
  return describe(comparison);
}

function describe(comparison: Readonly<ReferenceImageCellComparison>): string {
  if (comparison.dimensionMismatch) return 'dimension mismatch';
  return `fraction ${comparison.fraction.toFixed(6)}, maxChannelDelta ${comparison.maxChannelDelta}`;
}
