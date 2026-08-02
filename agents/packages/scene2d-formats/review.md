---
package: '@flighthq/scene2d-formats'
status: partial
score: 62
updated: 2026-08-02
ingested:
  - status.md
  - charter.md
  - source
  - tests
---

# scene2d-formats — Review

Survey scoped to the **Lottie codec**, the question the user asked. SVG is characterized only
where the comparison is load-bearing; it deserves its own pass.

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

**The diagnostic surface is not trustworthy, and the charter's honesty guarantee is the thing it
breaks.** The charter states that an unresolvable case "must emit an accurate `ImportDiagnostic`
Skip crumb rather than silently approximating it"; the codebase map's diagnostics doctrine says the
same. Five cases silently approximate with an **empty** diagnostics array. Each was verified by
importing the case and the reduced document side by side and comparing the emitted shape command
stream — the loss is byte-identical absence, not a subtle divergence:

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
deliberate deferrals** — the distinction that matters, because the deferrals are honest and these
are not. The predeclared set itself is correctly crumbed; that machinery works.

The consequence is the reason this blocks "ready to move on": a consumer cannot use an empty
diagnostics array as evidence of a faithful import, which is precisely the contract the crumb
system exists to provide. Whether these five get *implemented* is a scope call; whether they get
*crumbed* is not — the charter already decided that.

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
