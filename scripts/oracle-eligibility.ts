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
  /**
   * `provenance.sourceHash` — the scene source's sha256 AT CAPTURE TIME. Comparing it against the tree's
   * current hash is what makes a stale capture mechanically detectable instead of archaeological.
   */
  sourceHash: string | null;
}

export type OracleDeterminismVerdict = 'agreed' | 'disagreed' | 'incomplete';

/** Whether the compared capture roots came from separate machines or repeats on one. */
/**
 * How the capture roots relate, DERIVED from recorded host identity — never declared by the caller.
 *
 * ★ `host-identity-missing` is a THIRD state and not a synonym for `one-host`. "The captures do not record
 * which machine made them" and "the captures record one machine" are opposite conditions with opposite
 * remedies — wire the producer, versus re-run on a second host — and collapsing them into one bucket is
 * how a reader concludes a measurement was taken that never was.
 */
export type OracleDeterminismScope = 'independent-hosts' | 'one-host' | 'host-identity-missing';

export interface OracleEligibilityInput {
  captures: readonly OracleCaptureFact[];
  /** Every `subject/entry/renderer` the coverage manifest lists, with the evidence kinds it requires. */
  coverage: ReadonlyMap<string, readonly string[]>;
  /** Identities the lock already supplies blessed bytes for. */
  pinned: ReadonlySet<string>;
  /** Identities an open request already claims. Re-commissioning one would be a `request-overlap` failure. */
  outstanding: ReadonlySet<string>;
  /** Identities the parity leg withholds, and whether it judged them or could not judge them at all. */
  parityWithheld: ReadonlyMap<string, OracleParityWithholding>;
  /** Identities a peer has claimed for repair, or a ruling has held. Never overridden by local evidence. */
  held: ReadonlyMap<string, string>;
  /** Per-identity verdict from `compareCalibrationRuns`. A cell absent from this map is unmeasured. */
  determinism: ReadonlyMap<string, OracleDeterminismVerdict>;
  /**
   * Where the compared capture roots came from. The caller declares it; NOTHING can derive it.
   *
   * ★ `compareCalibrationRuns` IS HANDED DIRECTORIES AND CANNOT TELL. Two runs on one machine and two
   * runs on separate machines produce byte-identical input to it and answer completely different
   * questions, and its own header records that its first real run was within-host while announcing a
   * conclusion only cross-host data could support. So the scope is an input here, not an inference.
   */
  determinismScope: OracleDeterminismScope;
}

/**
 * Why a cell may not be commissioned. Ordered worst-first: a cell that trips several is reported under
 * the first, so the report names the condition that must be fixed FIRST rather than the last one checked.
 */
export type OracleBlockReason =
  /** The captures carry no host identity, so independence could not be evaluated at all. */
  | 'host-identity-missing'
  /** The capture errored. Its scene oracle may not even have run, so nothing was verified. */
  | 'capture-failed'
  /** A sibling backend of the same scene failed, so the scene is under repair and this column with it. */
  | 'sibling-column-failed'
  /** No `assertRender`: nothing in-tree ever asserted this render means what the scene claims. */
  | 'no-scene-oracle'
  /** Repeated captures disagreed. A reference blessed from one of them would fail against the next. */
  | 'nondeterministic'
  /** No repeated capture covered it, so determinism is unknown — which is not the same as stable. */
  | 'determinism-unmeasured'

  /** Backends disagree on this scene, so at least one of them is wrong and it is not known which. */
  | 'parity-disagreement'
  /** Parity could not judge this scene at all — no comparable pair, so no cross-backend evidence exists. */
  | 'parity-unevaluated'
  /** The scene has ONE backend column, so parity is not merely unrun — it can never apply. */
  | 'parity-single-column'
  /**
   * The committed baseline does not reproduce HERE. Named for the question the check actually answers,
   * which is narrower than the one commissioning needs — see the check itself for why the distinction
   * is load-bearing rather than pedantic.
   */
  | 'baseline-unreproduced-here'
  /** A peer or a ruling holds this cell. Local evidence never overrides that. */
  | 'held'
  /** Already claimed by an open request. */
  | 'already-commissioned'
  /** Already blessed and gating. Re-commissioning is a re-bless, which is a separate decision. */
  | 'already-pinned'
  /** Everything else agreed, and the repeats were on ONE host. Stage one clear, cross-host unmeasured. */
  | 'determinism-within-host-only';

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
  /**
   * Cells whose capture is byte-identical to a sibling backend's. REPORTED, NEVER BLOCKING — see
   * `findBackendCollisions` for the measurement that took this out of the bar.
   */
  collisions: readonly OracleBackendCollision[];
}

export interface OracleBackendCollision {
  identity: string;
  twin: string;
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
  const collided = findBackendCollisions(input.captures.filter((capture) => input.coverage.has(capture.identity)));
  // ★ ONLY LIVE CELLS COUNT AS SIBLINGS, AND A REAL RUN PROVED WHY. A capture root is a directory that
  // ACCUMULATES: it keeps output for scenes and columns that have since been removed, because a fresh
  // capture writes the current suite and deletes nothing. `bitmap-downscale-smoothing/webgl` sat there
  // from three weeks earlier, `error`, for a column the scene no longer has — and it withheld the two
  // live columns of that scene as `sibling-column-failed`. A cell that no longer exists cannot be under
  // repair, and residue must not be able to withhold anything.
  const live = input.captures.filter((capture) => input.coverage.has(capture.identity));
  const brokenScenes = findScenesWithAFailedColumn(live);
  const columns = countSceneColumns(input.coverage.keys());

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
    // ★ A SCENE IS REPAIRED AS A WHOLE, SO ITS HEALTHY COLUMNS ARE NOT SEPARATELY BLESSABLE. When one
    // backend of a scene fails its own oracle, the fix lands in that scene — and a fix for, say, a
    // smoothing defect on webgl will usually move the canvas column too. A reference blessed from the
    // passing column today would then read the repair as a regression tomorrow, against a picture nobody
    // ever meant to freeze. The whole scene waits for the repair track.
    const brokenSibling = brokenScenes.get(sceneOf(identity));
    if (brokenSibling !== undefined) {
      blocked.push({ detail: `${brokenSibling} failed in this scene`, identity, reason: 'sibling-column-failed' });
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

    // ★ DETERMINISM IS TWO STAGES, AND THE TWO ANSWERS ARE NOT SYMMETRIC.
    // DISAGREEMENT is conclusive at either scope: a cell that cannot reproduce itself on one machine
    // will not reproduce across two, so no further measurement is owed and the cell is simply out.
    // AGREEMENT is not. Repeats on one host prove that host reproduces itself — necessary, and nowhere
    // near sufficient for a lock verified on a DIFFERENT machine at maxChannelDelta 0. `tests.yml`
    // records SwiftShader pinning already failing to survive a machine change once. So local agreement
    // advances a cell to the cross-host stage; it never completes it.
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

    // ★ TWO PARITY OUTCOMES, TWO REASONS, BECAUSE THEY ROUTE TO DIFFERENT PEOPLE. A scene whose backends
    // DISAGREE has a defect somebody must find. A scene parity could not EVALUATE has no defect on the
    // evidence — it has no comparable pair, so it needs a parity group or a second backend column. Folding
    // them together would file the second kind on the repair track, where nobody can act on it.
    const parity = input.parityWithheld.get(identity);
    if (parity === 'disagreement') {
      blocked.push({ detail: 'backends disagree on this scene', identity, reason: 'parity-disagreement' });
      continue;
    }
    if (parity === 'unevaluated') {
      // ★ UNRUN AND UNRUNNABLE ARE DIFFERENT PROBLEMS AND ONLY ONE OF THEM IS A BUG. A scene with two or
      // more backend columns that formed no pair has something to fix — a reference backend the topology
      // could not reach, a column that failed. A scene with exactly ONE column has nothing to fix ever:
      // cross-backend agreement is not evidence that exists for it, and reporting it as though a repair
      // would produce it sends someone looking for a defect that is a property of the scene.
      if (columns.get(sceneOf(identity)) === 1) {
        blocked.push({ detail: 'the scene has one backend column', identity, reason: 'parity-single-column' });
        continue;
      }
      blocked.push({ detail: 'parity formed no comparable pair', identity, reason: 'parity-unevaluated' });
      continue;
    }
    // ★ A COMMITTED BASELINE IS CHECKED WHEN ONE EXISTS AND IS NOT REQUIRED TO EXIST.
    // Requiring one was wrong, and the argument that killed it is worth keeping: a baseline WRITTEN TODAY
    // is not cross-time evidence for a decision made today. It is a first capture, and it proves nothing
    // about reproduction until something later re-runs against it — so "capture the missing 42 and accept
    // them" would have been circular, on any host. Cross-time reproduction comes from stage-one
    // determinism instead, measured now rather than stored earlier; and correctness comes from the
    // scene's own `assertRender`, which states the picture is RIGHT where a baseline only states it is
    // the same as last time.
    //
    // An EXISTING baseline still gates, and it earns that: of 450 baselined cells, 14 reproduced
    // byte-for-byte across both of today's runs and still disagreed with their committed baseline. Stage
    // one called all 14 `agreed`, because it compares today to today and cannot see a render that moved
    // last week. That is a real check no other condition here performs.
    //
    // ★ THE NAME ANSWERS THE QUESTION THE CHECK ASKS, WHICH IS NOT THE QUESTION COMMISSIONING NEEDS.
    // This compares against a baseline captured somewhere else, so what it settles is "does this
    // reproduce in THIS environment" — while a blessing needs "does it reproduce in the BLESSING
    // environment". Calling the verdict `baseline-drift` named it as a property of the CELL, as though
    // the render had moved; on the 14 cells this caught, nothing that could move the render had moved,
    // and the weight of evidence was that the baseline does not reproduce here. Same shape as asking
    // whether a bad state can reach a gate: a true verdict about a narrower question, read as an answer
    // to the wider one. The block is unchanged — a cell whose committed evidence does not reproduce
    // where the capture ran is not one to bless — only the claim the label makes.
    if (capture.baselineHash !== null && capture.hash !== capture.baselineHash) {
      blocked.push({
        detail: 'the committed baseline does not reproduce in this environment',
        identity,
        reason: 'baseline-unreproduced-here',
      });
      continue;
    }

    // ★ CHECKED LAST, BECAUSE IT IS NOT A DEFECT AND IT MUST NOT MASK ONE. Every other reason names work
    // somebody can do — write an oracle, fix a render, capture a baseline. This one names a measurement
    // only a cross-host workflow run can supply, and it is true of every cell at once. Checked earlier it
    // swallowed all 445 otherwise-clean cells under one heading and the repair track lost its list; a
    // cell that ALSO lacks an oracle should report the oracle, which is the thing anyone can act on.
    // Checked BEFORE the one-host arm, because an unevaluable precondition is worse news than a measured
    // one and must never be reported as it. The remedy differs: this one is fixed in the capture producer.
    if (input.determinismScope === 'host-identity-missing') {
      blocked.push({
        detail: 'captures record no host identity, so independence is UNEVALUATED — not measured as one host',
        identity,
        reason: 'host-identity-missing',
      });
      continue;
    }
    if (input.determinismScope === 'one-host') {
      blocked.push({
        detail: 'stage one clear; cross-host portability is unmeasured',
        identity,
        reason: 'determinism-within-host-only',
      });
      continue;
    }

    eligible.push(identity);
  }

  const collisions = [...collided.entries()]
    .filter(([identity]) => input.coverage.has(identity))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([identity, twin]) => ({ identity, twin }));
  return { blocked, collisions, eligible };
}

/**
 * Adds the `referenceImage` evidence kind to each commissioned identity's coverage entry.
 *
 * ★ THE COVERAGE IDENTITY AND THE REQUEST ARE ONE CHANGE (§5), AND THIS IS THE HALF THAT CAN BE WRONG
 * SILENTLY. Filing only the request leaves the cell unrequired, so nothing ever fails when the bytes do
 * not arrive: the commission expires quietly and CI never asked for it. The failure is invisible because
 * everything that DID happen looks correct — the request is well-formed, the queue accepts it, and the
 * consumer gate simply has nothing to say about a cell it was never told to require.
 *
 * Returns a sentinel rather than throwing when an identity is absent: it means the manifest changed
 * between the read that selected the batch and the write that records it, which the caller must report
 * against the specific cell rather than as a crash.
 */
export function addReferenceImageCoverage(
  subjectCoverage: Readonly<Record<string, readonly string[]>>,
  identities: readonly string[],
): { coverage: Record<string, string[]> } | { missing: string } {
  const coverage: Record<string, string[]> = {};
  for (const [cell, kinds] of Object.entries(subjectCoverage)) coverage[cell] = [...kinds];
  for (const identity of identities) {
    const cell = identity.split('/').slice(1).join('/');
    const kinds = coverage[cell];
    if (kinds === undefined) return { missing: identity };
    if (!kinds.includes('referenceImage')) kinds.push('referenceImage');
    kinds.sort();
  }
  return { coverage };
}

/**
 * Cells whose capture describes a DIFFERENT version of their scene than the tree currently holds.
 *
 * ★ A CENSUS COMPUTED FROM STALE CAPTURES IS CONFIDENTLY WRONG, AND IT WAS. Capture facts record the
 * scene's source hash at capture time. When the tree moves under a capture root, every cell of a changed
 * scene keeps describing the old source — and the failure is silent and BIDIRECTIONAL: a deleted scene
 * over-reports (its stale error looks like a live defect) and an improved scene under-reports (a cell was
 * filed as `no-scene-oracle` for a scene that had since gained one). Both happened here, a day apart, from
 * the same root.
 *
 * Compares per-cell rather than per-repository on purpose: a commit sha tells a reader the whole census is
 * suspect, while a source hash tells them exactly which cells are, which is the difference between "re-run
 * everything" and "these eleven".
 *
 * ★ IT RETURNS HOW MANY CELLS IT COULD COMPARE, AND THE CALLER MUST NOT IGNORE IT. `sourceHash` is a field
 * on a record this does not own: it can be renamed, moved, or emptied by work elsewhere. If it goes away,
 * every cell takes the `null` branch and the honest answer becomes "cannot tell" — but the STALE LIST
 * WOULD STILL BE EMPTY, and an empty list reads as "everything is fresh". That is a silent flip from a
 * gate to a rubber stamp, in the one instrument whose whole job is detecting that a record has drifted out
 * from under a reader. `compared` is what makes the difference visible. Same rule as
 * `compareCalibrationRuns` printing what it saw: a zero denominator is unconfigured, not clean.
 */
export function findStaleCaptures(
  captures: readonly Readonly<OracleCaptureFact>[],
  currentSourceHash: (identity: string) => string | null,
): { stale: string[]; compared: number } {
  const stale: string[] = [];
  let compared = 0;
  for (const capture of captures) {
    if (capture.sourceHash === null) continue;
    const current = currentSourceHash(capture.identity);
    if (current === null) continue;
    compared += 1;
    if (current !== capture.sourceHash) stale.push(capture.identity);
  }
  return { compared, stale: stale.sort() };
}

/** One `parity` row of a validation report: the scene it judged, and the verdict it reached. */
export interface OracleParityCheck {
  entry?: string;
  kind?: string;
  status?: string;
}

/** Why the parity leg withholds a cell: it judged the scene and it differed, or it could not judge it. */
export type OracleParityWithholding = 'disagreement' | 'unevaluated';

/**
 * Expands the parity leg's verdicts into the cells they withhold and why, or refuses the report.
 *
 * ★ THE WHOLE SCENE IS WITHHELD, NOT THE FAILING COLUMN. Parity says the backends disagree; it does not
 * say WHICH is wrong. Blessing the one that happened to match the reference backend would pin whichever
 * picture the comparison used as its yardstick, and a disagreement is exactly the case where that choice
 * cannot be justified.
 *
 * ★ A REPORT-ONLY RUN IS REFUSED, NOT READ AS AGREEMENT. `--report` records every pair as `reported` —
 * a distance with no verdict, because that mode gates nothing. Treating those rows as "no scene
 * disagreed" would convert the loudest possible ABSENCE of a parity judgement into the strongest
 * possible parity pass, and every cell in the corpus would clear a condition nothing had evaluated.
 */
export function findParityWithholdings(
  checks: readonly Readonly<OracleParityCheck>[],
  identities: Iterable<string>,
): { withheld: Map<string, OracleParityWithholding> } | { refused: string } {
  const parity = checks.filter((check) => check.kind === 'parity');
  if (!parity.some((check) => check.status === 'passed' || check.status === 'failed')) {
    return { refused: 'the report carries no gated parity verdict, so it cannot say any scene agreed' };
  }

  const scenes = new Map<string, OracleParityWithholding>();
  for (const check of parity) {
    if (check.entry === undefined || check.status === 'passed') continue;
    // A scene with several rows takes the worse one: one failed pair is a disagreement even if another
    // pair of the same scene was merely uncomparable.
    if (check.status === 'failed') scenes.set(check.entry, 'disagreement');
    else if (!scenes.has(check.entry)) scenes.set(check.entry, 'unevaluated');
  }

  const withheld = new Map<string, OracleParityWithholding>();
  for (const identity of identities) {
    const verdict = scenes.get(identity.split('/')[1] ?? '');
    if (verdict !== undefined) withheld.set(identity, verdict);
  }
  return { withheld };
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

/** How many backend columns each scene carries in the coverage manifest. */
function countSceneColumns(identities: Iterable<string>): Map<string, number> {
  const columns = new Map<string, number>();
  for (const identity of identities) {
    const scene = sceneOf(identity);
    columns.set(scene, (columns.get(scene) ?? 0) + 1);
  }
  return columns;
}

/** Scenes with at least one failed column, mapped to the identity of one that failed. */
function findScenesWithAFailedColumn(captures: readonly OracleCaptureFact[]): Map<string, string> {
  const broken = new Map<string, string>();
  for (const capture of captures) {
    if (capture.state !== 'ready' && !broken.has(sceneOf(capture.identity))) {
      broken.set(sceneOf(capture.identity), capture.identity);
    }
  }
  return broken;
}

/** `subject/entry` of a cell identity. */
function sceneOf(identity: string): string {
  const parts = identity.split('/');
  return `${parts[0] ?? ''}/${parts[1] ?? ''}`;
}

/**
 * Finds cells whose capture hash equals a SIBLING BACKEND's hash for the same scene.
 *
 * ★ THIS WAS A BLOCKING CONDITION AND THE MEASUREMENT REFUTED IT. The premise was that independent
 * rasterizers never agree to the byte, so equality had to mean one backend did not render its own path.
 * On this corpus, 33 of the 76 scenes with both a canvas and a webgl column are byte-identical — 43% —
 * and canvas (Skia) and webgl (SwiftShader) are genuinely separate implementations. Integer-aligned
 * solid fills and unfiltered blits simply are exactly reproducible. Blocking on it withheld 179 of 493
 * cells, most of them the simplest and safest in the suite.
 *
 * ★ AND THE GPU PAIR IS NOT INDEPENDENT AT ALL. `captureBrowser.ts` pins
 * `--use-webgpu-adapter=swiftshader`, and headless WebGL rasterizes through SwiftShader too, so
 * `webgl == webgpu` is one rasterizer answering twice. It is the single most common collision here (60
 * of 157 scenes) and it is evidence of the capture configuration, not of a fallback.
 *
 * So this is REPORTED, never blocking: it is a real observation with no discriminating power on its
 * own, and there is no in-tree signal that separates "trivial content" from "one backend did not run".
 * A collision on a scene whose content could not plausibly be pixel-exact — a blur, a gradient, an
 * antialiased curve — is still worth a human look, which is why the census is printed rather than
 * dropped.
 */
function findBackendCollisions(captures: readonly OracleCaptureFact[]): Map<string, string> {
  const byScene = new Map<string, OracleCaptureFact[]>();
  for (const capture of captures) {
    if (capture.hash === null || capture.state !== 'ready') continue;
    const scene = sceneOf(capture.identity);
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
  'sibling-column-failed',
  'no-scene-oracle',
  'host-identity-missing',
  'nondeterministic',
  'determinism-unmeasured',
  'parity-disagreement',
  'parity-unevaluated',
  'parity-single-column',
  'baseline-unreproduced-here',
  'held',
  'already-commissioned',
  'already-pinned',
  // Last on purpose: it is the only reason that names no defect, and it is true of every cell at once.
  'determinism-within-host-only',
];
