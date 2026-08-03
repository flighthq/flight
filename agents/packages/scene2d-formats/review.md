---
package: '@flighthq/scene2d-formats'
status: partial
score: 71
updated: 2026-08-03
ingested:
  - status.md
  - charter.md
  - source
  - tests
---

# scene2d-formats — Review

Two passes are recorded here. The first, on 2026-08-02, surveyed the **Lottie codec** and is kept
below unchanged apart from what later work resolved. The second, on 2026-08-03, follows the Rive
build.

## Rive, as of 2026-08-03

Rive went from chartered-but-absent to the cell's **best-verified codec**, and the reason is
methodological rather than clever: it is the only one measured against real files. Sixty-four
editor-authored `.riv` assets caught, in order, a container that could not read any real file, a
missing alternate-key table, a naming bug that left every state machine unnamed, and a binary payload
being decoded as UTF-8 — none of which the synthetic suites would ever have shown. The other two
codecs in this cell have still never seen a real asset, and the gap in confidence between them is now
the most useful thing this review can say.

Built: container, type registry with inheritance, per-artboard component trees, transforms, path
geometry with corner rounding, ordered paint, blend modes, clipping, trim, linear animations, assets
with intact payloads, the state-machine descriptor, single-format text, and a version gate.

**Three items are closed as recorded rather than built**, each needing an answer above this codec —
draw-order overrides, rig deformation, and the blend-mode shortfall. The charter's open directions now
carry all three. That is the right disposition: each was measured, and each would have produced
plausible-but-wrong output if forced.

**The format's defining hazard is id spaces.** Four distinct ones are in play — `parentId` over
components, `interpolatorId` over all artboard objects, `assetId` over the asset list by order,
`styleId` over components — and each had to be established empirically. Anyone adding a fifth should
assume nothing from its neighbours.

**What Rive still lacks** is animated geometry and paint (145 of 383 clips carry no channels because
only transform properties bind), rich text, image wiring onto the `Image` drawable, and the
`Scene2DDocument` slot output the charter's named-graph mode wants.

## Lottie, as of 2026-08-02

Survey scoped to the **Lottie codec**, the question the user asked. SVG is characterized only
where the comparison is load-bearing; it deserves its own pass. The five silent losses below were
subsequently fixed or recorded, and the coverage document this pass called for now exists.

## Shape of the cell

Two codecs in one package, per the blessed 2026-07-25 "one target package, many source codecs"
decision: `svgDocument.ts` (1555 lines) and `lottieDocument.ts` (1205 lines). Both reach the
charter's North star — straight to `Node2D`, no duplicate normalized document. Lottie exports two
functions, `createScene2DFromLottieDocument` and `applyAnimationClipToLottieDocument`, on both
blessed lanes, and registers through `registerLottieScene2DDocumentImporter` in `scene2d-resources`.
The Bodymovin schema lives in `@flighthq/types` with source field names retained, so import does not
allocate a second document. Package shape, lane discipline, and type home are all correct.

The breadth genuinely present is real: all baseline layer families, parenting, static and animated
2D transforms with separated position and hold segments, analytic segment-local cubic-Bezier easing
with per-component splitting, bezier/rect/ellipse/polystar geometry, fill/stroke/gradient paint
animated through a format-owned binder, static trim, hard masks to `ClipRegion`, image resolution
through the injected seam, precomposition offset/stretch folding, and markers as clip events. That
is a substantial common path, not a stub.

## The finding that governs the maturity question

**Five common-path features are silently lost, and they are undocumented project facts.** Each was
verified by importing the case and the reduced document side by side and comparing the emitted shape
command stream — the loss is byte-identical absence, not a subtle divergence:

1. **A second fill in one shape group overwrites the first.** `LottieShapeState` holds one `fill`
   slot, one `stroke` slot, one `gradient` slot. `[rect, redFill, blueFill]` emits a stream
   *identical* to `[rect, blueFill]`. The red fill is gone, uncrumbed.
2. **A gradient fill beside a solid fill is dropped.** `renderLottieShapeState` selects fill *or*
   gradient with `if/else`. `[rect, solidFill, gradientFill]` is identical to `[rect, solidFill]`.
3. **Polystar corner roundness (`os`, `is`) is never read.** The fields are typed on
   `LottiePolystarShapeItem` and `createLottiePolystarPath` ignores them; roundness 0 and roundness
   100 emit identical geometry. A rounded star imports hard-cornered.
4. **Paint z-order within a group is order-independent.** `renderLottieShapeState` always emits
   fill, then stroke, then paths, so `[rect, stroke, fill]` and `[rect, fill, stroke]` produce the
   same stream. Lottie's item order carries stacking intent.
5. **Text stroke (`sc`/`sw`) and embedded glyph outlines (`chars`) are ignored.** `chars` and
   `fonts` are typed on `LottieDocument` and read by nothing. `chars` is how real Bodymovin exports
   ship text that renders without the author's font, so this is a common-path fidelity divergence,
   not an exotic one.

None of these five appear in the charter's predeclared exclusion list (expressions, text animators,
effect layers, audio, cameras, 3D transforms, exotic mattes, unsupported blend modes, arbitrary time
remapping, shape modifiers without a Flight equivalent). They are therefore **unnoticed gaps, not
deliberate deferrals** — the distinction that matters, because the deferrals were declared and these
were not.

**They are project facts, and their home is a document, not a crumb.**
[Diagnostics](../../conventions/diagnostics.md#import-diagnostics-asset-facts-not-project-facts)
settles this: a crumb reports what happened to *this file's data*, and the mechanical test is whether
a correct, idiomatic file from the format's own authoring tool would trigger it. A designer exporting
a two-fill group, a rounded star, or stroked text from After Effects produces a perfectly correct
Bodymovin file, so a crumb for any of the five would be announcing that we have not finished — once
per import, forever — which is unactionable noise that makes the actionable crumbs harder to see.
The scene3d sibling records exactly this class in
[scene3d format coverage](../../scene3d-format-coverage.md). **There is no `scene2d` equivalent.**
That missing document is the real gap these five expose; what is wrong today is that they are
recorded nowhere at all.

**A doc conflict this surfaces.** The charter says an unresolvable case "must emit an accurate
`ImportDiagnostic` Skip crumb rather than silently approximating it." That sentence predates the
asset-facts-not-project-facts rule and now over-claims — read literally it mandates exactly the
crumbs the convention forbids. The charter needs the narrower wording.

**And the same rule cuts the other way on what already ships.** Most of the existing
`lottie.unsupported-*` family fails the same mechanical test: `unsupported-camera-layer`,
`unsupported-3d-layer`, `unsupported-3d-transform`, `unsupported-skew-axis`, `unsupported-effect`,
`unsupported-text-animator`, `unsupported-animated-text-document`, `unsupported-matte`,
`unsupported-soft-mask`, `unsupported-mask-composition`, `unsupported-animated-dash`,
`unsupported-shape-item`, `trim-individual-approximated` all fire on correct idiomatic exports and
announce our incompleteness rather than an asset fact. A defensible middle band remains — the
convention keeps a crumb whose drop is *contingent on an author choice with a next action*, which is
plausibly `unsupported-expression` (bake it before export), `unsupported-blend-mode` (choose a
supported mode), and `unsupported-shape-modifier` for the repeater (expand it before export). Only
six are unambiguous asset facts: `invalid-document`, `unresolved-asset`, `unresolved-image` (the
caller did not supply the resolver — the archetype of a step the consumer should have performed),
`recursive-precomposition`, `text-missing-document`, and `incompatible-animated-shape-path`.

So the diagnostic surface is miscalibrated in both directions at once: it is silent on five real
losses and loud about roughly a dozen project facts. Neither half is a correctness bug — every
import produces the same pixels either way — which is why this is a maturity finding rather than a
defect list.

## Test rigor

12 tests, 39 assertions, all green, and they are honest about what they assert. But every one is a
hand-authored fixture checked against a hand-written expected value, and the package's own
scene3d-formats sibling learned the sharper lesson: a synthetic test that encodes the same guess as
the parser proves nothing. There is no format-derived invariant anywhere in the Lottie suite — no
analogue of `expectWorldPositionsPreserved`, which re-derives its expectation from the format's own
relation and is mutation-tested. The five silent drops above all sit inside "covered" areas and the
suite did not catch them, which is the concrete evidence that fixture-and-expected-value has hit its
ceiling here.

Two structural asymmetries with the SVG sibling, both unfavorable to Lottie:

- SVG has a dedicated `svgDocumentConformance.test.ts` (531 lines, a systematic matrix). Lottie's
  census is a `describe` block inside its main test file.
- Neither codec has a functional render scene — nothing under `functional/scenes` imports either
  format, so pixel fidelity is unverified on every backend. For a codec whose entire output is
  visual, that is the widest hole after the crumb gap.

No real Bodymovin asset has ever been imported. Charter open direction 3 parks this as a post-gate
checkpoint, which was the right call when the gate was being built; it is now the thing standing
between "conformant against our own fixtures" and "known to work."

## Contract fit

Clean on the mechanical surfaces: two lanes, types in `@flighthq/types`, no top-level side effects,
`Readonly<>` discipline, sentinel returns, no cross-package reach. `applyAnimationClipToLottieDocument`
correctly keeps playback explicit rather than smuggling in a runtime.

One design observation for the charter rather than a defect: the shape-item dispatch is a closed
`if/else` chain over `ty`, and the structural forks' registry-by-default rule says a growing
descriptor family should prefer an open registry. The family *is* growing — the unimplemented
repeater, merge-paths, and rounded-corners modifiers are all `ty` values that a registry would let a
user supply. This is a Boundary question, not sweep-safe work.
