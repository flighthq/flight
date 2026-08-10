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

**A skip that removes the reference is either refused or announced.** Options, unranked:

- refuse it — a skip may not name the group's `reference`; express it as a narrower group instead;
- announce it — the validation output states that the scene fell back to all-pairs and why;
- re-reference it — the group declares a fallback reference for when the primary is skipped.

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
