# Parity skips — what a skip must declare, and what it silently changes

**Status: proposal, awaiting ruling. Raised 2026-08-10 after an audit of `FLIGHT_PARITY_SKIP` found
nine entries landed in one commit with no per-entry reasoning.** Nothing here is settled. Read it
before adding, removing, or relying on a parity skip; do not build on it as ratified.

Read before touching `FLIGHT_PARITY_SKIP` in
[`packages/tool-capture/src/captureFlightPreset.ts`](../packages/tool-capture/src/captureFlightPreset.ts),
before reading a green parity result as coverage, or before adding a skip mechanism to any other
gate. The narrow question is why nine skips carry no reason. The wider one this document exists to
settle: **what must a gate record at the point where it is narrowed, so that its output cannot claim
more than it checked?**

## The rule this is an instance of

**A gate that counts is not enough. It has to compare what it did against what was declared.**

The parity gate below is the worked case, but the rule generalises to every instrument in the repo,
and the size gate is the proof it is not parity-specific: `scripts/size.ts` compares bytes against
`tools/size/size.baseline.json` and never asks whether that number was produced by a measurement of
*this* tree — nor whether the prose it enforces says what it enforces. Measured on a tree at
`d03a0bb57`, all four `pathboolean` entries disagree with their pins (+0.6%, −0.4%, −0.1%, −0.1%),
because `scripts/check.ts` contains no reference to size and so nothing re-derives them.

Two further mismatches in that same instrument, recorded because they are the same defect and not
this document's subject:

- **The stated rule and the enforcing instrument disagree.** `AGENTS.md` states it absolutely — an
  assembly never inflates the bundle cost of a primitive — while `size-runner.ts:246` permits
  `baselineSize * 1.05`. On `pathboolean:dom` that is 626 bytes of silent headroom. The prose is the
  artifact every agent reads in full at session start; the tolerance is the thing that actually
  holds. Either the prose states the tolerance or the gate tightens to match it, but they must not
  disagree.

  The tolerance is not merely undocumented — **the documented workflow contradicts it.**
  [`bundle-size.md`](bundle-size.md), the doc the map points at for the full rule, restates the
  invariant absolutely, describes `npm run size:baseline` as "rewrite the size baseline after an
  intentional, measured change", and permits growth only "unless the size tradeoff is intentional and
  measured". A reader concludes that every byte of growth requires a deliberate, measured act and a
  baseline rewrite. In fact anything under 5% requires none of the three. The docs describe a
  ratchet; the gate implements a band. Following the pointer does not rescue the reader, because the
  only artifact in the repo where the 5% is written down is the implementation. `bundle-size.md:3`
  compounds it by naming `npm run size` "the preferred size command for agents" and describing it as
  reporting against the committed baseline, while never saying the gate is absent from `check` — so a
  diligent reader concludes running it is a courtesy on top of automatic enforcement, when it is the
  only enforcement there is.

  **And the band is re-armed by the workflow the doc prescribes.** The 5% is computed against a pin
  that moves. Follow `bundle-size.md:16` exactly — make an intentional, measured change, run
  `npm run size:baseline` — and `size-runner.ts:275` sets the pin to the *new measurement*, granting
  a fresh 5% above the higher floor. Per step it is bounded; across steps it is a staircase whose
  every riser is invisible. **The diligent agent re-arms the band; the negligent one does not**,
  because growth under 5% passes without rewriting anything.

  **There is no magnitude at which the tool forces a decision.** Under 5% passes silently. Over 5%
  fails — and the documented remedy erases the objection unconditionally: `size-runner.ts:274` makes
  `adjustedPassed = updateBaseline || passed`, and `:275` re-pins regardless of how far the value
  moved, with no bound, no confirmation, and no record of what was forgiven. A 50% regression re-pins
  as quietly as a 0.1% one. The gate's only effect is to prompt someone to run the command that
  erases it.
- **A pin is stale, not false.** `scene2d-embedded-png:canvas` at 1,864 reproduces exactly at the
  commit that introduced it and has since drifted to ~1,723. A one-line baseline diff is *not*
  evidence a measurement never ran: `size-runner.ts:263` seeds `pendingBaseline` from the existing
  baseline and overwrites only measured keys, so a one-line diff is the signature of a correct run
  when nothing else moved.

## The mechanism, as it actually behaves

Verified in [`captureValidation.ts`](../packages/tool-capture/src/captureValidation.ts) (the skip is
*declared* in `captureFlightPreset.ts`, which holds no comparison logic):

```js
const allowed = (renderer) => skip !== 'all' && !skip?.includes(renderer);
const present = group.targets.filter((r) => eligible.has(r) && allowed(r));
if (group.reference !== undefined && present.includes(group.reference)) {
  // pair every present renderer against the reference
} else {
  // ALL-PAIRS among present
}
```

The `visual` group declares `targets: ['dom', 'canvas', 'webgl', 'webgpu']` and
`reference: 'canvas'`.

**A skip naming the reference backend does two things, not one.** With `skip = ['canvas']`:

1. `allowed('canvas')` is false, so canvas leaves `present`. **Canvas is never compared to
   anything** — it is the reference, and removing it removes the reference itself.
2. `present.includes(reference)` is now false, so the reference branch does not fire and control
   falls through to **all-pairs among the survivors**. The scene silently changes comparison
   *topology* — not a reduced comparison, a different one.

Nothing in the output announces either effect. A reader sees a green parity result.

## The two defects this separates

These are independent and should not be remedied together.

**Entry-level — the reasons are missing.** All nine entries arrived in `3e55135123`
(`Apply work from review4`), no per-entry reasoning:

| entry | scope |
| --- | --- |
| `playingvideo` | all |
| `effect-displacement` | all |
| `effect-god-rays` | all |
| `effect-screen-space-fog` | all |
| `effect-hue-saturation` | canvas |
| `effect-lens-distortion` | canvas |
| `effect-lens-flare` | canvas |
| `effect-posterize` | canvas |
| `effect-vignette` | canvas |

`playingvideo` is the instructive case: video frames are inherently non-deterministic across
backends, so it is probably a *correct* skip. That is the problem. **A plausible reason that is not
written down does not count, because nobody downstream can separate a good skip from a bad one — and
the good ones are what make the list look trustworthy enough that nobody audits it.**

**Mechanism-level — a skip can silently demote a comparison.** Independent of whether any entry is
justified: the reference-to-all-pairs fallback is invisible. A future correctly-reasoned skip on a
reference backend still quietly weakens every remaining comparison for that scene.

## Proposed remedies

**A skip entry carries its reason at the point of declaration.** Whether that is a required field on
the record (`{ renderers, reason }`) or a convention with a `check:` gate is open. The requirement is
that the reason live where the skip lives — not in a commit message, not in a review doc. Both were
available in `3e55135123` and neither was used.

**A skip that removes the reference must not silently re-topologise the scene.** Four options, now
ranked after review:

1. **Stop conflating "no reference declared" with "reference skipped away"** — *preferred*. Line 719
   asks `present.includes(group.reference)`, which is false in both situations, so the second
   inherits the fallback written for the first. When a group declares a reference and the skip
   removes it, the scene yields **no pairs**; the all-pairs branch keeps its actual purpose, a group
   that genuinely declares no reference. This matches intent rather than merely being safer: in
   reference mode every pair is reference-vs-X, so "do not compare canvas" already means "do not
   compare this scene" — a canvas-only skip on a canvas-referenced group is **semantically identical
   to `'all'`**. It also cannot turn the gate red, because it only ever removes comparisons, and it
   needs no config migration. The four `'all'` entries are already correct under today's code
   (`present` is empty, so all-pairs yields nothing); only the five named-reference entries change,
   and only toward comparing less.
2. **Refuse it** — a skip may not name its group's `reference`. Sound on the house rule (throw only
   for programmer errors), but it invalidates five live entries that must each be re-expressed before
   the tool runs again. Better landed *behind* option 1, and per the diagnostics inversion it belongs
   in a guard or `check:` gate rather than a throw in the comparison path — once option 1 lands the
   config is unambiguous and there is nothing left to refuse.
3. **Announce it** — strictly weaker: converts a silent topology change into a noisy one that a
   reader must still decode and a CI log buries.
4. **Re-reference it** — the most dangerous. It keeps the run green while changing what the
   comparison means, which is this same disease one level up.

What option 1 gives up, stated rather than glossed: those five scenes currently get a
webgl-vs-webgpu comparison, and it would go. That is a gain — nobody chose it, nobody documented it,
it reports green as though the scene were covered, and it is the weakest pairing available since
those two backends share far more implementation with each other than either shares with canvas. If
it is genuinely wanted, declare it as an explicit group.

Only one group is declared today (`visual`, which has a reference), so **the all-pairs branch's only
live use in Flight is the accidental one.**

### Why option 1 cannot redden the gate, on the guard's own definition

The repo already has a guard that fires on *removed* comparisons —
`isCaptureParityCoverageFailure`, which the `FLIGHT_VISUAL_PARITY_GROUPS` comment cites. If it were
per-scene, taking the last pair off five scenes would turn it red and option 1's deciding property
would be false. **It is run-level:** `:438` is `parityComparisons === 0 && parityUncovered > 0`, fed
at `:1026` by `parityPasses + parityFailures` summed across the whole run. Five scenes dropping to
zero cannot zero a run-wide total while any other scene compares.

**And the five do not go quiet.** `:738` — a gated entry with zero pairs increments
`parityUncovered` *and* pushes a per-entry check with `status: 'skipped'` and an
`explainCaptureParityUncovered` message. Each of the five reports itself **by name, with a reason**;
the run-level count surfaces at `:1044` as a `warn`.

So option 1 does not trade *compares the wrong thing, reports green* for *compares nothing, reports
green*. It trades it for **compares nothing and says so, five times, by name** — the thesis of this
document satisfied by machinery that already exists. Nothing new is added; an existing signal is let
fire where control flow currently routes around it.

**Why the existing guard misses the fallback today.** With a canvas skip, `present` still holds
webgl and webgpu, so `pairs.length` is not zero and the uncovered accounting at `:738` never runs.
The guard asks *did we compare anything?* — not *did we compare what was declared?* **A coverage
guard that counts comparisons is blind to a substitution.** The comment above that accounting was
written against "the entry reports success having checked nothing"; the fallback is its sibling,
*reports success having checked something nobody asked for*, and it slips past the guard written for
its twin purely because the count is non-zero.

**Operational consequence, to be stated in advance so it is not misread as a regression:** the
parity-uncovered count goes from 0 to 5 the moment option 1 lands, as a warn. **That is the defect
becoming visible, not a new defect.** A builder who sees the number rise and "fixes" it by restoring
the fallback puts us back where we started.

## What is already known, so it is not re-measured

Mean absolute per-byte difference over the committed 16×16 fingerprints, canvas vs webgl. **This is
an ad-hoc ordering metric, not the project's parity comparison** — treat it as a ranking hint only.

| scene | diff | skip |
| --- | --- | --- |
| `effect-vignette` | 58.72 | canvas |
| `effect-lens-flare` | 43.59 | canvas |
| `effect-posterize` | 25.65 | canvas |
| `effect-lens-distortion` | 15.78 | canvas |
| `effect-displacement` | 10.02 | all |
| `effect-hue-saturation` | 0.41 | canvas |
| `effect-scanlines` | 0.11 | **none (control)** |

Two things follow. The four large divergences are in **a comparison that does not run**, so they
describe what the gate would find if it were looking — not a live failure being ignored.
And `effect-hue-saturation` sits with the control, so **the five canvas entries are not one
population**: four look like hidden divergence, one looks like a skip that was never needed.

An un-skip experiment should therefore start with `effect-hue-saturation`, which is most likely to
pass and so proves the procedure without turning the gate red, and only then take `effect-vignette`,
where the divergence is largest and `canvasVignetteEffect.ts` exists so capability cannot be argued.

## Refuted, recorded so it is not re-proposed

**"The five canvas skips hide a canvas capability gap."** They do not.
[`support-matrix.md`](support-matrix.md) shows canvas `✓` for all five — the `·` is the DOM column —
and `scripts/support.ts` never reads `paritySkip`, so the matrix and the skip list are independent
instruments. Canvas renders all five and has committed baselines for all five.

File absence is not capability absence here: `packages/effects-canvas/src/` has no per-effect file
for four of the five, because they are served by the shared colour-pass path and, for
hue-saturation, by the adjustments tier. Under a three-tier effect model, a missing runner file is
expected rather than diagnostic.

## The open question

Does this generalize past parity? The same shape appeared twice more in one week: `CONTRACT.md`
overclaimed what `docs:check` enforced, and the append-only ledger gate was inert on push builds.
All three are the same defect — **what narrows a gate is recorded where the gate's output never
shows it** — which suggests the rule belongs to gates generally rather than to this list. That is the
part most needing a ruling, because it decides whether the remedy is one field in one file or a
convention every gate adopts.
