---
package: '@flighthq/rive-formats'
draft: true
lastDirection: 2026-07-12
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# rive-formats — Charter (reserved home)

## What it is

`@flighthq/rive-formats` is the reserved home for **Rive `.riv` import** — parsing Rive's runtime format into Flight's primitives. It is the richest importer in the visual-authoring-artifact arc ([structural-forks](../structural-forks.md#i-visual-authoring-artifacts-import-as--formats-not-as-a-code-layout-dsl)): on top of the vector + keyframe animation that `lottie-formats` covers, Rive adds **meshes**, **bones/skinning**, and **state machines**.

## The parse / runtime split (the important line)

Rive is two things, and this cell is only the first:

- **Format parse (`rive-formats`, this cell).** `.riv` bytes → Flight data: vector shapes → `@flighthq/shape`, meshes → `@flighthq/mesh`, bones → `@flighthq/skeleton3d`, animations → `@flighthq/animation`.
- **State-machine runtime (a _separate_ future cell).** Rive's interactive state machines — inputs driving state transitions that blend animations — are a *runtime interpretation*, not a format parse. Keep them out of the importer, the same node/sim split Flight already draws (`particles` sim vs. `particleemitter` node, `timeline` vs. `movieclip`). The importer produces the state-machine *description* as data; a distinct runtime consumes it.

This split is what keeps `rive-formats` an honest `-formats` codec rather than a Rive engine smuggled in under a codec name.

## Boundaries (for when it is built)

- **`-formats` codec, not the Rive runtime.** Output is Flight `shape`/`mesh`/`skeleton`/`animation` data + a state-machine descriptor; playback/interaction is a separate concern.
- **Well-homed outputs only.** Each Rive concept maps onto an existing Flight subject; the importer introduces no new primitive.
- **Binary format.** `.riv` is a binary runtime format (not JSON like Lottie); the parse layer owns its byte reader.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-12] Chartered as a candidate; not built.** Part of the visual-authoring-import arc (fork I). Format-parse only; the state-machine runtime is a distinct future cell (parse/runtime split, mirroring `particles`/`particleemitter`). Bless-to-build is the user's. User-directed 2026-07-12 ("Rive in scope as a `-formats` member").

## Open directions

1. **State-machine runtime cell** — name and shape the interactive runtime that consumes the imported descriptor (the parse/runtime split's second half).
2. **Format-version tracking** — `.riv` evolves; decide how versions are pinned/migrated.
3. **Rust candidacy** — the binary reader / mesh deformation may be a `rust:` backend candidate once the shape is known.
