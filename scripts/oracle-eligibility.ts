// Decides which cells MAY be commissioned (agents/render-oracle-repository.md §5, §7).
//
// ★ COMMISSIONING BLESSES WHATEVER THE CAPTURE SHOWS, PERMANENTLY. That is the whole hazard this file
// exists to manage. A wrong pixel blessed here does not merely fail to catch a bug — it becomes the
// reference every future regression check agrees with, so the bug stops being detectable at all. The
// asymmetry is total: a cell wrongly withheld costs one more round, a cell wrongly blessed costs the
// defect it hides for as long as the reference stands. Every rule below is written to fail toward
// withholding.
//
// ★ A REASON IS ALWAYS RECORDED, NEVER A BARE "NO". The commissioning report is two numbers — newly
// commissioned, and still blocked — and the second number is only actionable if each cell says which
// track it is waiting on. A cell blocked by `parity-disagreement` belongs to the repair track; one
// blocked by `no-scene-oracle` needs an oracle written; one blocked by `nondeterministic` needs the
// scene made stable. Collapsing them into "not eligible" loses the routing.
//
// ★ ELIGIBILITY IS NOT CORRECTNESS, AND THIS FILE MUST NOT PRETEND OTHERWISE. What it can check is that
// several INDEPENDENT statements about a cell all agree: the scene's own semantic oracle passed, the
// committed capture baseline reproduced byte-for-byte, repeated captures agreed, the other backends
// rendering the same scene agreed, and no peer holds it. That conjunction is the strongest evidence
// available in-tree; it is still evidence, not proof, which is why the human review step in
// `flight-oracles` (§7 step 5) is the actual blessing and cannot be skipped.
//
// Types are declared locally rather than in `@flighthq/types` because `scripts/` is outside the package
// graph — the same reason `OracleLock` lives in `scripts/oracle-records.ts`.

/** One cell's fresh-capture facts, read from `<root>/<subject>/<entry>/<renderer>/status.json`. */
export interface OracleCaptureFact {
  /** `subject/entry/renderer`. Opaque here — §10 may add an environment column and this file will not care. */
  identity: string;
  /** `ready` means the capture completed; anything else means the render never got as far as being judged. */
  state: string;
  /**
   * `invoked` means the scene's `assertRender` ran and did not throw. `absent` means the scene ships no
   * semantic oracle, so nothing in-tree ever asserted the pixels mean what the scene claims.
   */
  oracle: string | null;
  /** sha256 of the decoded capture. Used to detect two backends returning one render. */
  hash: string | null;
  /** The committed sha256 baseline for this cell, or `null` when the repository has never pinned one. */
  baselineHash: string | null;
}

export type OracleDeterminismVerdict = 'agreed' | 'disagreed' | 'incomplete';

export interface OracleEligibilityInput {
  captures: readonly OracleCaptureFact[];
  /** Every `subject/entry/renderer` the coverage manifest lists, with the evidence kinds it requires. */
  coverage: ReadonlyMap<string, readonly string[]>;
  /** Identities the lock already supplies blessed bytes for. */
  pinned: ReadonlySet<string>;
  /** Identities an open request already claims. Re-commissioning one would be a `request-overlap` failure. */
  outstanding: ReadonlySet<string>;
  /** Identities whose scene the parity leg reports as disagreeing across backends. */
  parityDisagreed: ReadonlySet<string>;
  /** Identities a peer has claimed for repair, or a ruling has held. Never overridden by local evidence. */
  held: ReadonlyMap<string, string>;
  /** Per-identity verdict from `compareCalibrationRuns`. A cell absent from this map is unmeasured. */
  determinism: ReadonlyMap<string, OracleDeterminismVerdict>;
}

/**
 * Why a cell may not be commissioned. Ordered worst-first: a cell that trips several is reported under
 * the first, so the report names the condition that must be fixed FIRST rather than the last one checked.
 */
export type OracleBlockReason =
  /** The capture errored. Its scene oracle may not even have run, so nothing was verified. */
  | 'capture-failed'
  /** No `assertRender`: nothing in-tree ever asserted this render means what the scene claims. */
  | 'no-scene-oracle'
  /** Repeated captures disagreed. A reference blessed from one of them would fail against the next. */
  | 'nondeterministic'
  /** No repeated capture covered it, so determinism is unknown — which is not the same as stable. */
  | 'determinism-unmeasured'
  /** Backends disagree on this scene, so at least one of them is wrong and it is not known which. */
  | 'parity-disagreement'
  /** Two backends returned byte-identical renders: one did not run its own path. */
  | 'backend-collision'
  /** Today's capture does not match the committed baseline. Something moved and nobody has explained it. */
  | 'baseline-drift'
  /** No committed baseline, so there is no second, independent statement about these pixels. */
  | 'no-baseline'
  /** A peer or a ruling holds this cell. Local evidence never overrides that. */
  | 'held'
  /** Already claimed by an open request. */
  | 'already-commissioned'
  /** Already blessed and gating. Re-commissioning is a re-bless, which is a separate decision. */
  | 'already-pinned';

export interface OracleBlockedCell {
  identity: string;
  reason: OracleBlockReason;
  detail: string;
}

export interface OracleEligibilityReport {
  /** Cells that cleared every condition, sorted, ready to be named by a request. */
  eligible: readonly string[];
  /** Every other live cell, with the first condition it failed. */
  blocked: readonly OracleBlockedCell[];
}

/**
 * Applies the commissioning bar to a capture run.
 *
 * Pure over its inputs so the bar is decidable in a unit test without a browser, a network, or a GPU —
 * which matters because the bar is the only thing standing between a bad capture and a permanent
 * reference, and a rule nobody can test is a rule nobody can trust.
 */
export function selectCommissionableCells(input: Readonly<OracleEligibilityInput>): OracleEligibilityReport {
  const byIdentity = new Map(input.captures.map((capture) => [capture.identity, capture]));
  const collided = findBackendCollisions(input.captures);

  const eligible: string[] = [];
  const blocked: OracleBlockedCell[] = [];

  for (const identity of [...input.coverage.keys()].sort()) {
    const kinds = input.coverage.get(identity) ?? [];
    if (input.pinned.has(identity) || kinds.includes('referenceImage')) {
      blocked.push({ detail: 'already blessed and gating', identity, reason: 'already-pinned' });
      continue;
    }
    if (input.outstanding.has(identity)) {
      blocked.push({ detail: 'an open request already claims it', identity, reason: 'already-commissioned' });
      continue;
    }
    const heldBy = input.held.get(identity);
    if (heldBy !== undefined) {
      blocked.push({ detail: heldBy, identity, reason: 'held' });
      continue;
    }

    const capture = byIdentity.get(identity);
    if (capture === undefined) {
      blocked.push({ detail: 'the capture run produced no status for it', identity, reason: 'capture-failed' });
      continue;
    }
    if (capture.state !== 'ready') {
      blocked.push({ detail: `capture state is ${capture.state}`, identity, reason: 'capture-failed' });
      continue;
    }
    // ★ THE ONE CONDITION WITH NO SUBSTITUTE. Everything else here says the render is STABLE — that it
    // reproduces, that the backends agree, that it has not moved. Stability is not correctness: four
    // backends can agree on the same wrong picture, and a wrong picture reproduces perfectly. Only
    // `assertRender` states what the pixels are supposed to MEAN, so a cell without one has no claim
    // to correctness at all, however quiet it is.
    if (capture.oracle !== 'invoked') {
      blocked.push({
        detail: capture.oracle === 'absent' ? 'the scene exports no assertRender' : 'no oracle was recorded',
        identity,
        reason: 'no-scene-oracle',
      });
      continue;
    }

    const determinism = input.determinism.get(identity);
    if (determinism === 'disagreed') {
      blocked.push({ detail: 'repeated captures did not agree', identity, reason: 'nondeterministic' });
      continue;
    }
    if (determinism !== 'agreed') {
      blocked.push({
        detail: determinism === 'incomplete' ? 'a repeat run did not capture it' : 'no repeat run covered it',
        identity,
        reason: 'determinism-unmeasured',
      });
      continue;
    }

    if (input.parityDisagreed.has(identity)) {
      blocked.push({ detail: 'backends disagree on this scene', identity, reason: 'parity-disagreement' });
      continue;
    }
    const twin = collided.get(identity);
    if (twin !== undefined) {
      blocked.push({ detail: `byte-identical to ${twin}`, identity, reason: 'backend-collision' });
      continue;
    }

    if (capture.baselineHash === null) {
      blocked.push({ detail: 'no committed capture baseline', identity, reason: 'no-baseline' });
      continue;
    }
    if (capture.hash !== capture.baselineHash) {
      blocked.push({ detail: 'capture does not match the committed baseline', identity, reason: 'baseline-drift' });
      continue;
    }

    eligible.push(identity);
  }

  return { blocked, eligible };
}

/**
 * Groups eligible cells into the `targets` shape a request carries, one entry per scene.
 *
 * Identities are split here and NOWHERE ELSE in this file, because a request's `entry`/`renderers` fields
 * genuinely require the parts. The rest of the pipeline keeps them opaque so the §10 ruling changes only
 * whoever generates identities.
 */
export function groupOracleTargets(identities: readonly string[]): { entry: string; renderers: string[] }[] {
  const byEntry = new Map<string, Set<string>>();
  for (const identity of identities) {
    const parts = identity.split('/');
    const entry = parts[1];
    const renderer = parts[2];
    if (entry === undefined || renderer === undefined) continue;
    const renderers = byEntry.get(entry) ?? new Set<string>();
    renderers.add(renderer);
    byEntry.set(entry, renderers);
  }
  return [...byEntry.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([entry, renderers]) => ({ entry, renderers: [...renderers].sort() }));
}

/**
 * Finds cells whose capture hash equals a SIBLING BACKEND's hash for the same scene.
 *
 * ★ THIS IS NOT A PARITY CHECK — IT IS ITS OPPOSITE. Parity asks whether backends agree closely enough;
 * this asks whether two of them agree EXACTLY, which independent rasterizers do not do. Byte equality
 * across backends means one of them did not render: a fallback silently served the other's frame, or the
 * capture read the wrong surface. Blessing that pins one backend's picture as the other's reference, and
 * the two then agree forever by construction — the column stops being able to fail.
 */
function findBackendCollisions(captures: readonly OracleCaptureFact[]): Map<string, string> {
  const byScene = new Map<string, OracleCaptureFact[]>();
  for (const capture of captures) {
    if (capture.hash === null || capture.state !== 'ready') continue;
    const parts = capture.identity.split('/');
    const scene = `${parts[0] ?? ''}/${parts[1] ?? ''}`;
    byScene.set(scene, [...(byScene.get(scene) ?? []), capture]);
  }

  const collisions = new Map<string, string>();
  for (const group of byScene.values()) {
    for (const capture of group) {
      const twin = group.find((other) => other !== capture && other.hash === capture.hash);
      if (twin !== undefined) collisions.set(capture.identity, twin.identity);
    }
  }
  return collisions;
}

/** Groups blocked cells by reason, worst-first, so the report routes work rather than listing it. */
export function summarizeOracleBlocks(blocked: readonly OracleBlockedCell[]): { reason: string; count: number }[] {
  const counts = new Map<OracleBlockReason, number>();
  for (const cell of blocked) counts.set(cell.reason, (counts.get(cell.reason) ?? 0) + 1);
  return BLOCK_REASON_ORDER.filter((reason) => counts.has(reason)).map((reason) => ({
    count: counts.get(reason)!,
    reason,
  }));
}

const BLOCK_REASON_ORDER: readonly OracleBlockReason[] = [
  'capture-failed',
  'no-scene-oracle',
  'nondeterministic',
  'determinism-unmeasured',
  'parity-disagreement',
  'backend-collision',
  'baseline-drift',
  'no-baseline',
  'held',
  'already-commissioned',
  'already-pinned',
];
