---
package: '@flighthq/rive-formats'
role: package
absorbed: scene2d-formats
supersededBy: '@flighthq/scene2d-formats'
draft: true
lastDirection: 2026-07-25
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# rive-formats — Superseded Charter

> Superseded by [`@flighthq/scene2d-formats`](../scene2d-formats/charter.md). Rive `.riv` **format
> parse** is a codec *within* `scene2d-formats` (target-named `-formats`, like SVG/Lottie/SWF), not a
> source-named package. No `packages/rive-formats/` implementation was created. This file retains the
> original direction history and the still-open state-machine-runtime split.

## What it is

`@flighthq/rive-formats` was the reserved home for **Rive `.riv` import** — parsing Rive's runtime
format into Flight's primitives. It is the richest importer in the visual-authoring-artifact arc
([structural-forks](../structural-forks.md#i-visual-authoring-artifacts-import-as--formats-not-as-a-code-layout-dsl)):
on top of the vector + keyframe animation that Lottie covers, Rive adds **meshes**, **bones/skinning**,
and **state machines**. The parse folds into `scene2d-formats`; the state-machine *runtime* does not
(see below).

## The parse / runtime split (the reason this cell dissolved cleanly)

Rive is two things, and only the first is a `-formats` codec:

- **Format parse → `scene2d-formats`.** `.riv` bytes → Flight data: vector shapes → `@flighthq/shape`,
  deformable meshes + bones/skinning → `@flighthq/skeleton2d` (2D mesh warp, `MeshAttachment2D` — **not**
  the 3D `mesh`/`skeleton3d`, since Rive is a 2D tool), animations → `@flighthq/animation`, and a
  named-graph → a `Scene2DDocument` with slots ([`scene2d-resources`](../scene2d-resources/charter.md)).
  Its binary reader is injected through a registered seam (the `registerAwd2DeflateDecompressor`
  precedent), so it costs the SVG-only bundle nothing.
- **State-machine runtime → a _separate_ future cell.** Rive's interactive state machines — inputs
  driving state transitions that blend animations — are a *runtime interpretation*, not a format parse.
  They stay out of the codec, the same node/sim split Flight already draws (`particles` vs.
  `particleemitter`, `timeline` vs. `movieclip`). The codec emits the state-machine *descriptor* as
  data; a distinct runtime consumes it. This half is **not** absorbed and remains chartered-open.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-12] Chartered as a candidate; not built.** Part of the visual-authoring-import arc
  (fork I). Format-parse only; the state-machine runtime is a distinct future cell (parse/runtime
  split, mirroring `particles`/`particleemitter`). User-directed 2026-07-12 ("Rive in scope as a
  `-formats` member").
- **[2026-07-25] Superseded before build by `@flighthq/scene2d-formats`.** `-formats` is target-named:
  Rive is a *source*, so its parse is a codec within `scene2d-formats` (alongside SVG/Lottie/SWF), the
  same correction that absorbed `svg-formats`/`lottie-formats`. Its `@flighthq/skeleton2d` dependency is
  now built, and the earlier 3D `mesh`/`skeleton3d` routing was corrected to 2D `skeleton2d`. Rive
  remains the **primary modern named-graph (#3) source** (named + nested artboards + data binding =
  the slot/linkage model); it is the forward-authoring #3 path, with SWF the legacy/archive path.
  User-directed 2026-07-25 (named-2D-node-graph design session).

## Open directions

1. **State-machine runtime cell** — name and shape the interactive runtime that consumes the imported
   descriptor (the parse/runtime split's second half; a runtime, not a `-formats` concern — the one
   Rive piece that does *not* fold into `scene2d-formats`).
2. **Format-version tracking** — `.riv` evolves; decide how versions are pinned/migrated (a
   `scene2d-formats` codec concern now).
3. **Rust candidacy** — the binary reader / mesh deformation may be a `rust:` backend candidate once
   the shape is known (like `surface-rs`).
