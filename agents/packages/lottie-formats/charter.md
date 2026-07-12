---
package: '@flighthq/lottie-formats'
draft: true
lastDirection: 2026-07-12
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# lottie-formats — Charter (reserved home)

## What it is

`@flighthq/lottie-formats` is the reserved home for **Lottie (Bodymovin JSON) import** — parsing an After-Effects vector-animation export into Flight's vector + animation primitives: `@flighthq/shape` command streams plus `@flighthq/animation` tracks. It is the animated-vector importer in the visual-authoring-artifact arc ([structural-forks](../structural-forks.md#i-visual-authoring-artifacts-import-as--formats-not-as-a-code-layout-dsl)) — the animated sibling of static `svg-formats`, and the simpler cousin of `rive-formats` (which adds meshes/bones/state machines).

Lottie is shape layers + transforms + keyframes: a designer's motion graphic as data. Import assembles the shape hierarchy into Flight `shape`/display nodes and the per-property keyframes into `@flighthq/animation` tracks a player can drive.

## Boundaries (for when it is built)

- **`-formats` codec, not a runtime.** Lottie JSON → Flight `shape` + `animation` data. The animation *plays* through the existing `@flighthq/animation` player; this cell only produces the tracks.
- **Two well-homed outputs.** Vector content → `shape`/display; motion → `animation` tracks. It introduces no new animation or geometry primitive; it maps Lottie's model onto Flight's.
- **Static-shape overlap with `svg-formats` is shared, not duplicated.** Where Lottie and SVG describe the same static vector shapes, the shape-construction path is common; only the keyframe layer is Lottie-specific. If the overlap is substantial, factor the shared vector builder rather than copying it.
- **Scope-bounded.** Expressions/scripting and effect layers are out (effects → `@flighthq/effects`); shape + transform + keyframe animation is the bedrock.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-12] Chartered as a candidate; not built.** Part of the visual-authoring-import arc (fork I). Output is `shape` + `animation` data driven by the existing player; expressions/effect-layers out of scope. Bless-to-build is the user's. User-directed 2026-07-12 ("Lottie in scope as a `-formats` member").

## Open directions

1. **Shared vector builder with `svg-formats`** — decide where the common shape-construction path lives once both are scoped.
2. **Animation-model fit** — mapping Lottie's property/keyframe/easing model onto `@flighthq/animation` tracks and `@flighthq/easing` curves without loss.
3. **Raster/precomp assets** — how embedded images and precompositions map onto Flight resources.
