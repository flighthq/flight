---
package: '@flighthq/camera'
updated: 2026-06-24
basedOn: ./review.md
---

# Assessment: @flighthq/camera

Sorts the review's gaps and the prior maturation roadmap into sweep-safe in-package work (`Recommended`) and parked work (`Backlog`). The package is `solid` (82/100); the matrix core and the new picking/culling surface are real and tested. What remains is one in-package bug, two source-style nits, an allocation hot-spot, round-trip test coverage — and a cluster of larger questions that need a charter ruling (the charter's North star / Boundaries / Decisions are still stubs).

`Approved` is intentionally empty — approval is the user's verbal gate.

## Recommended

Sweep-safe: within `@flighthq/camera`, no cross-package coupling, no breaking change, no open design decision. The set a blanket "do all recommended" can safely bless.

- **Scope `getCameraLinearDepth` to perspective and fix its false doc comment.** The function always applies the perspective depth inversion but takes a `camera` whose projection may be orthographic; the doc comment claims the same formula holds for orthographic, which is false (orthographic NDC depth is a different linear map). The _non-design_ fix is to scope the function to perspective and say so in the name/doc (add an explicit precondition or `false`/sentinel guard on `isOrthographicProjection`). Making it projection-_aware_ instead is the design fork — see Backlog. (review.md › Gaps; depth.ts)
- **Clean the stream-of-consciousness comment in `getCameraPosition`.** `basis.ts:30-36` carries a literal "... wait, this is col 1 of R" / "Actually ..." self-correction. The math is correct; reduce the comment to the final coordinate-space statement ("leave files cleaner"). (review.md › Contract & docs fit)
- **Remove per-call allocation in `getCameraFrustumCorners`.** `frustumCorners.ts:36,48` builds the `ndcCorners` table and a `results: number[][]` every call. Make the NDC-cube corner table a module-level constant and write through caller-provided `out` / module scratch so the per-frame-per-camera culling/CSM path does not generate GC pressure. Pure refactor, observable behavior unchanged. (review.md › Gaps)
- **Add round-trip tests for the projection/picking pairs.** Project↔unproject (`getCameraWorldToScreen` ↔ `getCameraScreenToWorldRay`) and world↔screen↔world identity tests, colocated in the existing `*.test.ts` files. Closes the obvious coverage gap that let the orthographic depth bug go uncaught and fits the Gold roadmap's "round-trip tests" line without touching API shape. (depth roadmap › Gold)

## Backlog

Parked: cross-package coordination, a breaking change, a new package, or waiting on an Open direction. Each notes _why_.

- **Verify the `flighthq-camera` Rust crate compiles and conforms.** The diff carries the `.rs` mirror but the worker had no `cargo`; parity is **as-claimed, not compiled** — the largest hole in the worker's self-estimate. Parked: needs a Rust toolchain and crosses into `crates/`, outside the TS package. (review.md › Status claims verified; depth roadmap › Gold "1:1 Rust parity")
- **Resolve where `inverseViewProjection` lives.** Derived, written by one updater, read only by the effects packages, never within `camera`. Whether it stays a public entity field, moves to an effects-owned runtime slot, or is dropped is the entity/runtime-slot design question. Parked → charter Open direction #1 (a Boundary/ownership decision). (review.md › Gaps, Candidate open directions #1)
- **Make `getCameraLinearDepth` projection-aware (branch on `kind`).** The alternative to the Recommended "scope to perspective" fix. Branching on `projection.kind` — and the off-axis/ortho cases that follow — turns the depth/projection family into an instance of the **closed-union-vs-registry fork (B)**. Parked → charter Open direction #2 (a design fork the charter must settle). (review.md › Candidate open directions #2; structural-forks fork B)
- **Off-axis / asymmetric projection** (`createOffAxisPerspectiveProjection`, oblique frustum for stereo/VR/portals/tiled). Adds new `kind` strings and a `setProjectionMatrix4` branch — grows the projection union, so it rides on the fork-B union-vs-registry ruling. Parked → tied to Open direction #2. (review.md › Gaps; depth roadmap › Gold)
- **Reversed-Z / infinite-far perspective.** Standard depth-precision variants; couple to the GPU NDC-range convention in `render-gl`/`render-wgpu`. Parked: cross-package (GPU depth setup) coordination required. (review.md › Gaps; depth roadmap › Silver)
- **Stored viewport (`setCameraViewport` / `getCameraAspect`).** Would retire the threaded `aspect` argument and the descriptor-vs-arg dual source of truth — but it is a `@flighthq/types` entity change that touches every `aspect`-threaded call site in `scene-gl` effects. Parked: breaking + cross-package → charter Open direction #4. (review.md › Gaps, Candidate open directions #4)
- **Re-home `intersectCameraRayWithPlane`.** A general ray-plane intersection with nothing camera-specific; a defined geometry↔camera boundary might home it in `@flighthq/geometry`. Parked → charter Open direction #3 (a boundary decision; cross-package). (review.md › Charter contradictions, Candidate open directions #3)
- **Camera controllers** (`createOrbitCameraController` etc.). Correctly out of scope for this package — a separate `@flighthq/camera-controller` neighbor that depends on `@flighthq/input`. Parked: new package (bedrock test) + cross-package dependency; schedule after `input` is stable. (review.md › Gaps; depth roadmap › Gold)
- **Functional/visual scene exercising picking and culling.** Cross-tool work under `tests/functional/`, not within the package source. Parked: lives outside `@flighthq/camera`. (depth roadmap › Gold)
- **Explicit TS Package Map bullet for camera (and the 3D-subject family).** Per fork G's "full 3D is in scope" ruling, the TS `index.md` Package Map should gain dedicated bullets for `scene`/`mesh`/ `lighting`/`texture`/`camera`. Parked: edits a shared admin doc, not the package — flag for the user. (review.md › Contract & docs fit)

## Approved

_Frozen on the user's verbal approval only. None recorded yet._

---

### For the charter's Open directions (not edited here)

The review surfaced five questions the stub charter does not answer; route them to `charter.md › Open directions` in a direction session (do not act on them as Recommended):

1. Does `inverseViewProjection` belong on the `Camera` entity, an effects runtime slot, or nowhere?
2. Is `getCameraLinearDepth` perspective-only or projection-aware — and do projection kinds stay a closed union or become an open registry (fork B) as off-axis/reversed-Z/infinite variants land?
3. Where is the geometry↔camera line for ray/plane math (`intersectCameraRayWithPlane`)?
4. Is a stored viewport (`setCameraViewport`) the intended end-state, retiring the threaded `aspect` argument (a cross-package change through `scene-gl`)?
5. What is the camera's scope vs. `@flighthq/camera-controller` and `scene`/`mesh` — where does the stereo/VR asymmetric-frustum question live (single-camera vs. a stereo-rig abstraction)?
