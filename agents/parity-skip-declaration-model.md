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
and the size gate is the proof it is not parity-specific: the terser instrument (`scripts/size.ts` when
this was written, `scripts/size-minified.ts` since) compares bytes against
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

  **The band is one-sided, so the gate cannot detect a stale pin at all.**
  `size-runner.ts:247` is `passed = gzipSize < threshold` with `threshold = baseline * 1.05` — there
  is no lower bound. Both live rows pass:

  | key | pin | measured | threshold | verdict |
  | --- | --- | --- | --- | --- |
  | `pathboolean:dom` | 12523 | 12614 | 13150 | **pass** (+0.7%) |
  | `scene2d-embedded-png:canvas` | 1864 | 1723 | 1958 | **pass** (−7.6%) |

  A bundle 7.6% *below* its pin passes; a pin 141 bytes wrong passes. So the instrument is
  structurally incapable of ever reporting that its own baseline is out of date — a shrink is never
  checked, and a growth under 5% is never checked. **Wiring it as-is would install a gate reporting
  "139 of 139 passed" while four-fifths of the file is drift**, which is why "all 139 passed" is not
  evidence the wiring works — it is the symptom. Whichever instrument survives the decomposition
  question, **it has to be able to detect staleness**: a two-sided comparison, or a freshness check on
  the pin's measuring commit.

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

## Measured 2026-08-10: which y-origin skips were actually stale

A whole y-origin convention sweep landed (`1d71634fc` displacement/scanlines, `f8f77c15f` crt,
`6098bea01` tilt-shift, `0f0e85b23` glitch, `a9f7adccb` fog) and the parity skips citing y-origin
divergence were never revisited. Two were audited with the same three-leg method, each measured in
isolation — remove only that entry, run the parity leg, revert:

| Scene | webgl·webgpu | Scene can see a phase flip? | Commit that would explain agreement | Verdict |
| --- | --- | --- | --- | --- |
| `effect-displacement` | **0.00** | yes — hashed block tears, seed 2, frequency 14 | `1d71634fc` | stale, **retired** |
| `effect-god-rays` | **35.86 > 15** | yes — asymmetric light point, `centerY: 0.4` | none touches `glGodRaysEffect.ts` | **still valid, keep** |

All three legs matter and the third is what converts *"it passes now"* into *"it passes for a known
reason."* Leg two exists because a 0.00 has two innocent explanations besides a real fix: two blank
frames, and **a scene that cannot see the defect** — vertically symmetric content renders identically
under a flipped phase, so the pair agrees perfectly while the bug is fully present. Displacement's
fingerprints were checked for both: byte-identical *and* 117 distinct cell values, on asymmetric content.

Manager's note on their own prediction, recorded verbatim because the method outlived it:

> "I predicted god-rays was the same class, same sweep, same likely staleness. All three legs came back
> the opposite way. builder2's line is the correct lesson and I want it in the record verbatim: the
> generalization was right to CHECK, wrong to ASSUME. The three-leg method was the contribution; my
> prediction about where it would point was not."

The four `['canvas']` skips (lens-distortion, lens-flare, posterize, vignette) are out of this class and
were not measured: they declare capability and algorithm facts, not orientation bugs.

## Refuted, recorded so it is not re-proposed

**"The five canvas skips hide a canvas capability gap."** They do not.
[`support-matrix.md`](support-matrix.md) shows canvas `✓` for all five — the `·` is the DOM column —
and `scripts/support.ts` never reads `paritySkip`, so the matrix and the skip list are independent
instruments. Canvas renders all five and has committed baselines for all five.

File absence is not capability absence here: `packages/effects-canvas/src/` has no per-effect file
for four of the five, because they are served by the shared colour-pass path and, for
hue-saturation, by the adjustments tier. Under a three-tier effect model, a missing runner file is
expected rather than diagnostic.

## The repo has already answered this once, in a comment

`scripts/fixtures.ts:143-147` argues against exactly the mechanism the size gate uses, in the same
vocabulary, and got it right:

> These are EXCLUDED BY NAME from the fixture count rather than absorbed into a tolerance — a
> tolerance would re-hide exactly what the count exists to surface, since "11 fewer than expected" is
> indistinguishable from a truncated extraction once it is inside a slack band. Named here, so a pack
> that grows a new metadata file fails loudly and gets a deliberate decision rather than silently
> widening the band.

Twenty lines later, `:160-164` describes this document's defect and records having already fixed it
in that one instrument:

> The fetcher used to print a success tick after `tar` returned and copy the manifest's `files` count
> straight into the stamp — so THE RECORD STATED A COUNT NOTHING HAD CHECKED. The number needed to
> check it was already in hand and unused.

So the reasoning exists, is correct, and was applied — **and it did not generalize.** The size gate
has a 5% slack band and no document mentioning it; the parity skip list has nine unreasoned entries;
the ledger gate was inert where work lands. Not because anyone disagreed with the argument above, but
because **its home was a comment in the file it applied to**, and a comment reaches only the reader
already inside that file.

That is this document's own thesis turned on the remedy for it. The argument against slack bands was
recorded exactly where the gates that needed it would never show it.

## What the remedy has to be, and why this repo has already ruled out the alternatives

Three remedies are available and **they are not symmetric** — this repository has already run the
first two as experiments and both failed, in ways recorded above.

| remedy | run here as | result |
| --- | --- | --- |
| a field/argument in one file | `fixtures.ts:143-147` | correct, applied, **never travelled** — a comment reaches only the reader already inside that file |
| a convention in prose | `AGENTS.md` "never inflates"; `CONTRACT.md:3` | travelled, then **drifted from the instrument** — and prose is what agents reason from |
| a convention with a check | — | not yet tried |

The prose failure is the important one, because prose is the obvious remedy and it is the one already
disproven: `AGENTS.md` *is* a repo-wide convention, in the document every agent reads in full at
session start, and it did not reach `size-runner.ts:246`. A ruling that lands as a paragraph saying
"every gate exception must carry its reason" would be the third document that does not travel.

**So the remedy needs three properties, and the third is usually forgotten:**

1. **Stated**, so it travels between instruments — a convention, not a comment.
2. **Checked**, so it stays true — both a missing reason on a gate exception and a pinned number
   whose measuring commit is not an ancestor of HEAD are mechanically detectable, and `docs:check`
   already exists as an enforcement seam that reads documents and fails.
3. **Wired into the gate everyone runs** — *where it is meant to be gated.*

   **Corrected 2026-08-10 by user ruling: `size` is deliberately not gated, and the two size commands
   are synonyms.** The stated reason is that a gate going red on intentional growth pushes an agent to
   run `size:baseline`, which launders the regression into a new pin and re-arms the band around it —
   so gating it would *manufacture* the laundering this document describes two sections above. Four
   agents independently read the absence as the defect; it is the design.

   The instrument's real cost is **delta misattribution**, not a missing gate: `npm run size` prints a
   delta against a pin of unknown age, so a reader attributes to their own change what is everyone
   else's drift. That already cost a ruling — the kappa narrowing rested on a `+0.02 KB` figure read
   off a stale pin, on a tree that did not contain the change; the honest isolated figure was 19
   bytes. **The instrument did not need to gate in order to mislead.** The remedies that fit the
   stated intent add no enforcement: parent-versus-commit measurement for any reported figure, or
   provenance recording the commit each pin was measured at.

   **And the reason four of us got it wrong belongs in this document, because it is its inverse
   case.** Every instance above is *a rule stated, an instrument not matching it*.
   [`bundle-size.md`](bundle-size.md) is 29 lines in which the word "gate" appears **zero** times, and
   so does "check" — an instrument behaving correctly with **no rule stated at all**. A design decision
   recorded nowhere is indistinguishable from an oversight, and here the missing record made correct
   behaviour look broken.

**A gate must first be named as one — and that enumeration already exists and already works.**
`scripts/check.ts:15-21` states the wiring property itself ("EVERY GATE RUNS… a violation of any of
them could land while the gate that existed to catch it never executed"), four lines above the list
that omits `size`. So the failure is not distance — the argument did not have to travel at all.

But the diagnosis "`check.ts` forgot to call `size.ts`" is wrong, and the correct one is cheaper to
fix. Enumerating `package.json` scripts against the repo's own `check` naming vocabulary
([npm script naming](conventions/npm-scripts.md)) gives **28 declared checks, 22 wired and 6 absent.**
Three of the six are benign — `check` itself (the aggregator) and two composites of gates already
wired individually. **Three are genuinely unwired:**

| absent | runs |
| --- | --- |
| `capture:examples:check` | `tool-capture … --tool=examples --fail-on-changed` |
| `capture:functional:check` | `tool-capture … --tool=functional --fail-on-changed` |
| `check:import-conformance` | `conformance/core/check-import-conformance-ratchet.ts` |

Each carries a check name, each fails by construction, and `check.ts` calls none of them. **The
enumeration does not currently pass — run once, it flags three.**

Whether these exclusions are correct is a separate question, and they may well be:
[`AGENTS.md`](../AGENTS.md) says the full render matrix is CI's job and that functional regression is
only valid where its baselines were captured, so keeping capture out of a developer-run whole-repo
gate may be entirely deliberate. **The defect is that the reason is recorded nowhere the enumeration
would show it** — a reader running the mechanism sees three declared checks missing and cannot tell
deliberate from forgotten. That is the nine-unreasoned-skip-entries problem, in a different file,
about the instruments this document is about.

`size` is absent for a worse reason than a missing name: **there was never one thing to wire.**

Two instruments exist for one subject, and neither is wired anywhere —
`grep size scripts/check.ts scripts/test.ts` returns zero in both:

| script | runs | mechanism |
| --- | --- | --- |
| `size` / `size:baseline` | `scripts/size.ts` | direct build-and-compare; owns the 5% band |
| `test:size` / `test:size:baseline` | `scripts/test-size.ts` | spawns vitest against a separate size config |

**Resolved 2026-08-13.** The decomposition question above was answered when a fast unminified size
path was added and forced it: `test:size` / `test:size:baseline` and `scripts/test-size.ts` are
deleted, the terser instrument moved to `scripts/size-minified.ts` under `size:minified` /
`size:minified:baseline`, and `scripts/size.ts` now holds the unminified sweep under `size` /
`size:baseline`. Two subjects, one instrument and one baseline each. The paragraphs below describe
the state that prompted it and are kept as the record; the file and command names in them are
historical. What is **not** resolved is this document's actual subject — the 5% band, its one-sidedness,
and the unconditional re-pin are unchanged in `size-runner.ts`, which `size:minified` still uses.

**And the two docs name different commands as the size check.**
[`bundle-size.md:3`](bundle-size.md) calls `npm run size` "the preferred size command for agents";
[`npm-scripts.md:94`](conventions/npm-scripts.md) uses `test:size` as the canonical
baseline-comparing check, citing it by name as the worked example of the read-vs-write rule. Both are
current, both are read, and they disagree about which gate exists.

That is this document's defect at the level of the **vocabulary** rather than the gate — not a gate
whose green means less than a reader thinks, but two documents that disagree about which gate there
is. It is also how `size` stayed unwired with nobody being careless.

Two corollaries, both learned the hard way:

- **`size:check` is not the fix.** It would be a fourth name for one subject and would violate the
  naming convention it was meant to satisfy. Which instrument survives is a decomposition question,
  not a wiring commit.
- **A name-keyed enumeration is unsound here.** `check.ts` labels three gates with subject and action
  transposed against `package.json` — `license-provenance:check` vs `check:license-provenance`, and
  likewise for `append-only-ledgers` and `package-dist-orphans`. Any check must compare **artifact
  paths, not names**; the names already disagree between the two files it would compare.
- **Naming wires nothing.** `check.ts` has no discovery mechanism — every gate is an explicit `add()`.
  A convention that names a gate does not cause it to run.

That also terminates the obvious regress — a check keeps the convention true, wiring keeps the check
live, so what keeps the wiring live? The set is decidable from `package.json` and the naming
convention, its inputs are files rather than prose, and it currently passes. There is no fourth
level.

The check is also what makes the residual failure benign. Prose describing a check can still drift
from it — that is exactly `CONTRACT.md:3` — but with the check wired, the tree stays correct and only
the description misleads. Without it, the description misleads *and* nothing holds.

## What this is not

**It is not a claim that the reasoning here is weak.** Four times while researching this document, the
repository turned out to have already reasoned the point out correctly:

| where | what it already got right |
| --- | --- |
| `scripts/fixtures.ts:143-147` | excluded by name **rather than absorbed into a tolerance**, because a slack band re-hides what the count exists to surface |
| `scripts/fixtures.ts:160-164` | named this document's defect — "the record stated a count nothing had checked" — and fixed it in that one instrument |
| `scripts/check.ts:15-21` | "EVERY GATE RUNS" — a gate that never executes lets a violation land, with the recorded instance that proved it |
| [`capture-verification-tiers.md:42-43`](capture-verification-tiers.md) | the coverage verdict is **run-level, by design**, because "a single-backend scene legitimately compares nothing" |

The last one is not incidental. It is the exact property option 1's safety rests on, **stated as
intent with its rationale recorded**, anticipating our case: five canvas-skipped scenes become scenes
that legitimately compare nothing. The mechanism was built to tolerate that and says why. Option 1 is
therefore safe by a documented design decision, not by an accident of how the guard was written.

**The defect has never once been that someone thought wrongly. It has been where they wrote it down** —
each time in a comment or a doc that only a reader already inside that file would meet. So the remedy
is not discipline imposed on a codebase that lacks it. **The discipline is already here, correct,
four times over. What it lacks is a surface it can travel on.**

## WebGPU MSAA: a reasoned scope that does not settle this proposal

**Scoped ruling 2026-08-16.** Three edge-bearing scenes now exclude WebGPU for one named capability
gap: `effect-msaa`, `effect-msaa-bloom`, and `effect-invert`. Canvas and DOM antialias inherently and
offer no switch to turn it off; WebGL can opt into sampleCount 4, while WebGPU's effect-target pool is
deliberately fixed at sampleCount 1 until its pipelines gain multisample variants
(`packages/render-wgpu/src/wgpuRenderTargetPool.ts:14-15`). Uniform antialiasing is therefore
unreachable today in either direction.

The scope does not promise that adding WebGPU MSAA will make boundary pixels identical. It will remove
the systematic difference — one hard-edged backend against three antialiased backends — while Canvas's
rasterizer, WebGL MSAA, and a future WebGPU MSAA pass can still choose different samples. The three
declarations record scene-specific consequences at the entries themselves: `effect-msaa` isolates the
missing pass, `effect-msaa-bloom` feeds aliased geometry into bloom, and `effect-invert` differs on the
shape boundaries rather than on its interior colour transform.

The queued capability is an explicit caller-invoked multisample-and-resolve pass backed by
multisample-capable WebGPU pipeline variants. It is deliberately not an `antialias` render-state option
mirroring WebGL's context attribute; the existing unread `WgpuRenderOptions.antialias` field is an
orphan to remove, not the seam to wire.

This supplies real per-entry reasons but does **not** settle the proposal's mechanism question. The
reasons still live in comments because the current skip schema can carry only renderer names or
`'all'`; whether reasons become checked data remains the open ruling below. This case strengthens that
need: one backend cause narrows three gate entries for three different observable consequences, and a
bare `['webgpu']` value preserves none of that distinction.

## A run-level zero-check cannot detect a scene-level zero

**Measured 2026-08-16.** `isCaptureParityCoverageFailure` (`:493-496`) fires when
`parityComparisons === 0 && parityUncovered > 0` — **run-level**, summed across all scenes. A
scene-level zero is invisible as long as any sibling compares.

**Evidence.** Four scenes — `effect-lens-distortion`, `effect-lens-flare`, `effect-posterize`,
`effect-vignette` — have `['canvas']` parity skips. Because `canvas` is the visual group's reference,
removing it makes those scenes fall through to all-pairs among webgl and webgpu (1 pair each — a
substituted comparison nobody declared, as described above). So they are not zero-pair scenes on
today's code; they are **wrong-topology** scenes. Under option 1 (stop conflating no-reference with
skipped-reference), they would become zero-pair scenes that increment `parityUncovered`.

`effect-god-rays` has `skip = 'all'` and is already a zero-pair scene. It increments
`parityUncovered` today.

All five have been in this state since at least `3e55135123` (2026-08-10). The run-level floor never
fired because sibling scenes continued to compare. The per-scene `status: 'skipped'` check at `:846`
produces a warning but no failure — it increments `parityUncovered`, and the run-level guard at
`:493` asks only whether the **total** is zero.

**Blast radius of a per-scene floor (measured on committed baselines, 2026-08-16 tree).**

| Category | Count | Explanation |
| --- | --- | --- |
| 0 eligible backends (no baselines at all) | 47 | Scenes not yet baselined — structurally unable to pair |
| 1 eligible backend (single-column) | 19 | Scenes with only one fingerprinted backend — by construction cannot pair |
| 2+ eligible, 0 pairs from explicit skip | 2 | `effect-god-rays` (`'all'`) and `effect-msaa` (`['webgpu']`) |
| **Total with 0 pairs** | **68** | Out of 203 total scenes |
| Scenes with ≥1 pair | 135 | Would be unaffected |

**Only 2 scenes would newly fail that are not already structurally unable to pair.** The 47 + 19
no-baseline / single-column scenes cannot pair regardless of the check's granularity — they have
nothing to compare. A per-scene floor that fires on `scene.parityComparisons === 0 &&
scene.parityUncovered > 0` would newly fail `effect-god-rays` and `effect-msaa`, because their zeros
are **policy choices** (explicit skips) rather than **infrastructure absences** (no baseline or no
second backend).

The four `['canvas']` scenes are not in this count because under today's code they DO form 1 pair
each (webgl-vs-webgpu, via the all-pairs fallback). Under option 1, they would also have 0 pairs,
raising the newly-failing count from 2 to 6.

**Commits.** The coverage-floor fix `2ff7b9007` (2026-08-15) is tooling-only and does not change
which scenes pair or what they pair against. The original nine-skip commit was `3e55135123`
(2026-08-10).

## The open question

Does this generalize past parity? The same shape appeared twice more in one week: `CONTRACT.md`
overclaimed what `docs:check` enforced, and the append-only ledger gate was inert on push builds.
All three are the same defect — **what narrows a gate is recorded where the gate's output never
shows it** — which suggests the rule belongs to gates generally rather than to this list. That is the
part most needing a ruling, because it decides whether the remedy is one field in one file or a
convention every gate adopts.
