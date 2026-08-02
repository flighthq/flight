---
package: '@flighthq/scene2d-formats'
updated: 2026-08-02
basedOn: ./review.md
---

# scene2d-formats — Assessment

Scoped to the Lottie codec, per the review. The governing question — is Lottie mature enough to move
on from — resolves to: **the breadth is there, the honesty is not.** The five silent drops in the
review are what separate the two, and closing them is small, in-package work. Implementing the
underlying features is a larger, separable question.

## Recommended

Sweep-safe: all within `@flighthq/scene2d-formats` (plus `@flighthq/types` where a schema field is
already declared), no cross-package coupling, no open design decision.

1. **Crumb the five silent approximations.** The charter already ruled that an unresolvable case
   emits an accurate Skip crumb rather than silently approximating; these five simply do not obey
   it. Emitting `lottie.multiple-fills-collapsed`, `lottie.gradient-fill-shadowed`,
   `lottie.unsupported-polystar-roundness`, `lottie.paint-order-flattened`, and
   `lottie.unsupported-text-stroke` / `lottie.unsupported-embedded-glyphs` restores the guarantee
   that an empty diagnostics array means a faithful import. This is the highest-value item in the
   cell and does not require implementing any of the five features. Do this first and independently
   of everything below.

2. **Read polystar roundness (`os`/`is`).** The fields are already typed and the path builder is
   local; rounding a star's points is bounded geometry work in `createLottiePolystarPath`. If it
   lands, item 1's roundness crumb retires with it. If it proves fiddlier than it looks, the crumb
   is the honest floor and this drops to Backlog without blocking anything.

3. **Support multiple fills and strokes per shape group.** Widen `LottieShapeState`'s three
   single-value slots to ordered paint entries and emit them in item order. This subsumes the
   fill/gradient exclusivity bug and the paint z-order flattening — three of the five findings are
   one root cause, a single-slot model where the format has a list. Whether Flight's shape recorder
   can express every resulting stacking order is the part to verify while doing it; where it cannot,
   crumb rather than approximate.

4. **Add a format-derived invariant to the Lottie suite.** The suite's fixture-and-expected-value
   pattern demonstrably missed all five findings. Follow the `expectWorldPositionsPreserved`
   precedent from scene3d-formats: assert a relation the *format* states — e.g. sampling the emitted
   clip at a keyframe's own time reproduces that keyframe's stated value, across easing kinds,
   separated position, and hold segments — and mutation-test it so it is load-bearing rather than
   assumption-echoing.

5. **Promote the Lottie census into `lottieDocumentConformance.test.ts`.** Matches the SVG sibling's
   existing structure and gives the conformance matrix a greppable home separate from unit tests.
   Purely organizational, but it is the file the next two items will grow.

6. **Correct the charter's exclusion list.** The predeclared exotic set does not mention multiple
   fills, gradient/fill coexistence, polystar roundness, paint order, text stroke, or `chars`. The
   list reads as complete and is not. (Note for the charter — I do not edit it.)

## Backlog

Parked, with the reason.

- **A real-asset fidelity checkpoint.** Charter open direction 3. Parked on sourcing a licensed
  Bodymovin asset and on the licensing discipline the user set for scene3d-formats (facts may be
  learned, no third-party code or assets carried without a ruling). This is the single largest
  remaining unknown — everything currently green is green against fixtures we wrote — but it needs a
  user decision on which asset, not more parser work.
- **A functional render scene for Lottie (and SVG).** Cross-package: `functional/scenes` plus
  backend baselines, and the charter is silent on whether codec cells own functional scenes. For a
  codec whose whole output is visual this is the widest structural hole, but it is not sweep-safe.
- **Embedded glyph outlines (`chars`) as real text geometry.** Larger than a crumb: routes Lottie
  glyph outlines into the shape path builder and interacts with `@flighthq/text` / `glyphatlas`
  ownership. Item 1's crumb is the honest interim.
- **The unimplemented shape modifiers** — repeater, merge-paths, rounded-corners, animated trim,
  animated dash. Correctly crumbed today, so they are honest deferrals rather than defects. Repeater
  and merge-paths in particular want the registry question below settled first; merge-paths also
  wants `@flighthq/path-boolean`, a cross-package call.
- **Text animators and animated text documents.** Predeclared exclusions; a genuine feature area,
  not a gap to patch.

## Open directions for the charter

Design forks, routed here rather than into Recommended.

1. **Registry versus closed dispatch for shape items.** The `ty` chain in `appendLottieShapeItems` is
   a closed `if/else` over a family that is still growing (repeater, merge-paths, rounded-corners
   unimplemented). The structural forks' registry-by-default rule favors opening it so users can
   supply vendor-prefixed items and unused ones tree-shake out. A Boundary decision, not a sweep.
2. **Does a `-formats` cell own its functional render scenes?** Settling this unblocks the Backlog
   item above and applies equally to SVG, Rive, and the `@flighthq/swf` peer.
3. **What "done" means for a codec without a real asset.** Lottie is the first cell to reach a
   complete hand-authored gate with no real input ever imported. The answer generalizes to every
   remaining `-formats` cell.

## Approved

_Empty — approval is the user's gate._
