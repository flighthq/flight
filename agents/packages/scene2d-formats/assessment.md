---
package: '@flighthq/scene2d-formats'
updated: 2026-08-02
basedOn: ./review.md
---

# scene2d-formats — Assessment

Scoped to the Lottie codec, per the review. The governing question — is Lottie mature enough to move
on from — resolves to: **the breadth is there; what is missing is the written record of where it
stops.** The five silent losses in the review are real, but they are project facts, so the artifact
they are waiting on is a coverage document, not a runtime diagnostic and not necessarily an
implementation.

## Recommended

Sweep-safe: all within `@flighthq/scene2d-formats` and its `agents/` docs, no cross-package coupling,
no open design decision.

1. **Write `agents/scene2d-format-coverage.md`.** The scene3d sibling has one and scene2d does not,
   which is why five real gaps are recorded nowhere. Mirror its structure: per-codec, what is read
   and what is not, verified against source rather than changelog. Seed it with the five findings
   (multiple fills per group, gradient-beside-solid, polystar roundness, paint z-order, text stroke
   and `chars`) plus the already-declared exclusions and SVG's own deferred set. This is the highest
   -value item in the cell, it costs a shipped app nothing, and it is what makes "move on" a
   defensible choice — the gaps become known rather than merely absent.

2. **Audit the existing `lottie.unsupported-*` family against the mechanical test.** Roughly a dozen
   crumbs announce our incompleteness on correct idiomatic exports; the review lists them. Retire
   those into the coverage document from item 1, keep the six unambiguous asset facts, and rule on
   the contingent-with-a-next-action middle band (`unsupported-expression`, `unsupported-blend-mode`,
   repeater). The precedent is `mtl.pbr-extension-unbound`, dropped last session for this exact
   reason. Do this *with* item 1, since the retired crumbs are the document's first entries.

3. **Correct the charter's degradation sentence.** It currently mandates a Skip crumb for any
   unresolvable case, which read literally requires the crumbs the convention forbids. It needs the
   narrower asset-fact wording. (Note for the charter — I do not edit it.)

4. **Add a format-derived invariant to the Lottie suite.** The suite's fixture-and-expected-value
   pattern demonstrably missed all five findings. Follow the `expectWorldPositionsPreserved`
   precedent: assert a relation the *format* states — sampling the emitted clip at a keyframe's own
   time reproduces that keyframe's stated value, across easing kinds, separated position, and hold
   segments — and mutation-test it so it is load-bearing rather than assumption-echoing.

5. **Promote the Lottie census into `lottieDocumentConformance.test.ts`.** Matches the SVG sibling's
   existing 531-line structure and gives the matrix a greppable home separate from unit tests.

6. **Read polystar roundness (`os`/`is`).** Bounded geometry work in `createLottiePolystarPath`; the
   fields are already typed. Closing it is cheap and removes one line from the coverage document.

7. **Support multiple fills and strokes per shape group.** Widen `LottieShapeState`'s three
   single-value slots to ordered paint entries emitted in item order — one root cause behind three of
   the five findings. Larger than item 6 but still local. Where Flight's shape recorder cannot
   express a resulting stacking order, that limit is itself a coverage-document entry.

Items 6 and 7 are the only ones that change behavior; 1–5 are the ones that make the cell honest
about itself. If only part of this lands, land 1–3.

## Backlog

Parked, with the reason.

- **A real-asset fidelity checkpoint.** Charter open direction 3, and the single largest remaining
  unknown — everything green today is green against fixtures we wrote. Parked on a user ruling for
  which asset, under the licensing discipline set for scene3d-formats.
- **A functional render scene for Lottie (and SVG).** Cross-package (`functional/scenes` plus backend
  baselines) and the charter is silent on whether codec cells own functional scenes. Widest
  structural hole for a codec whose whole output is visual, but not sweep-safe.
- **Embedded glyph outlines (`chars`) as real text geometry.** Routes glyph outlines into the shape
  path builder; interacts with `@flighthq/text` / `glyphatlas` ownership.
- **The unimplemented shape modifiers** — repeater, merge-paths, rounded-corners, animated trim,
  animated dash. Declared deferrals; merge-paths additionally wants `@flighthq/path-boolean`.
- **Text animators and animated text documents.** Declared exclusions; a feature area, not a patch.

## Open directions for the charter

Design forks, routed here rather than into Recommended.

1. **Registry versus closed dispatch for shape items.** The `ty` chain in `appendLottieShapeItems` is
   a closed `if/else` over a family that is still growing. The structural forks' registry-by-default
   rule favors opening it so users supply vendor-prefixed items and unused ones tree-shake out.
2. **Does a `-formats` cell own its functional render scenes?** Unblocks the Backlog item above and
   applies equally to SVG, Rive, and the `@flighthq/swf` peer.
3. **What "done" means for a codec without a real asset.** Lottie is the first cell to reach a
   complete hand-authored gate having never imported a real input. The answer generalizes to every
   remaining `-formats` cell.

## Approved

_Empty — approval is the user's gate._
