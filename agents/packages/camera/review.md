---
package: '@flighthq/camera'
status: solid
score: 82
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/camera.md
  - source
  - incoming/builder-67dc46d64
---

# Review: @flighthq/camera

## Verdict

**solid — 82/100.** The package has crossed from "the matrix half of a camera" (the prior depth review's 42/100) into a genuinely usable real-time 3D camera library: it now does unprojection, projection, frustum extraction + culling, frustum-corner reconstruction, eye/basis extraction, and linear-depth recovery — exactly the picking/culling surface the prior review named as the gap between "feeds the post-process effects" and "a camera a 3D app can actually use." The matrix core remains clean and correct, naming and alias-safety discipline stay exemplary, and every export is tested. It falls short of `authoritative` on four counts: a wrong-for-orthographic depth helper, the still-dead `inverseViewProjection` cache field (now written but never read in-package), the unverified Rust parity, and the deferred off-axis / reversed-Z / stored-viewport projection family.

The worker's self-estimate of 90/100 (Gold) is optimistic: it counts +19 for a Rust parity pass that was never compiled, and does not dock the depth helper's orthographic bug. Verified against the diff, the _TS_ surface is real and tested; the score reflects that minus the unverified crate and the bug.

## Status claims verified against the diff

Every cumulative claim in `status.md` checks out against `incoming/builder-67dc46d64`:

- New `Ray3D`/`Ray3DLike` in `packages/types/src/Ray3D.ts`, exported. Confirmed (`67dc46d64:packages/types/src/Ray3D.ts`).
- `Plane`/`PlaneLike`, `Frustum`/`FrustumLike`, `BoundingSphere`/`BoundingSphereLike` exist in `@flighthq/types` and have geometry backing (`createFrustum`, `setFrustumFromMatrix4`, `isFrustumContainingPoint`, `isFrustumIntersectingAabb`, `isFrustumIntersectingSphere`, `ray3d`, `plane`, `boundingSphere`). The diff shows these as part of the same delta (geometry `frustum.ts`/`plane.ts`/`ray3d.ts`/`boundingSphere.ts`), so the culling chain the camera delegates to is real, not assumed.
- All eight TS camera source files present: `basis`, `camera`, `culling`, `depth`, `frustumCorners`, `intersection`, `picking`, `projection` — each with a colocated `*.test.ts`.
- Every exported function (27) has a matching `describe` block — `exports:check` would pass; alphabetization within files is correct.
- `updateCameraInverseViewProjection` writes the cache via `__scratchInverse`, never clobbering on non-invertible (`camera.ts:85`). The dead-cache _updater_ gap from the prior review is closed.

Unverified: the entire Rust side (`crates/flighthq-*`). The diff contains the `.rs` files, but the worker states `cargo` was unavailable and the crates were "correct by inspection." Treat Rust parity as **as-claimed, not compiled** — the single biggest hole in the 90/100 self-estimate.

## Present capabilities

Projection descriptors (`projection.ts`): `createPerspectiveProjection`, `createOrthographicProjection`, `isPerspectiveProjection`/`isOrthographicProjection` narrowers, and `setProjectionMatrix4` (delegates to geometry; runtime `aspect` overrides a perspective descriptor's stored aspect; alias-safe).

Camera entity + composition (`camera.ts`): `createCamera`, `setCameraViewMatrix4FromLookAt`, `setCameraViewMatrix4FromMatrix4`, `getCameraViewProjectionMatrix4`, `getCameraInverseViewProjectionMatrix4` (sentinel `false` on non-invertible), `setCameraJitter`, and the new `updateCameraInverseViewProjection`.

Picking / projection (`picking.ts`): `getCameraScreenToWorldRay` (NDC → world `Ray3D`, near→far unproject, normalized direction, `false` on non-invertible) and `getCameraWorldToScreen` (world → NDC `Vector3`, `false` for behind-camera `w<=0`). Both manually inline the matrix-vector multiply and read all inputs before writing — alias-safe.

Eye + basis (`basis.ts`): `getCameraPosition` (eye = −(Rᵀ·t), no inversion, documented orthonormal-view assumption), `getCameraForward` (−row 2), `getCameraRight` (row 0), `getCameraUp` (row 1).

Frustum + culling (`culling.ts`): `getCameraFrustum` (6 clip planes via `setFrustumFromMatrix4`) plus `isBoxInCameraFrustum` / `isPointInCameraFrustum` / `isSphereInCameraFrustum`, each delegating to the geometry predicate over a shared scratch frustum.

Frustum corners (`frustumCorners.ts`): `getCameraFrustumCorners` — 8 world-space NDC-cube corners via inverse VP, documented ordering, computes all before writing (alias-safe), `false` on non-invertible.

Depth (`depth.ts`): `getCameraLinearDepth` (NDC-Z → signed view-space Z) and `getCameraViewSpaceZ` (its negation, for fog/SSAO).

Intersection helpers (`intersection.ts`): `getCameraRayThroughBoundingSphere` (project center → NDC → unproject to ray; `false` for empty/behind/non-invertible) and `intersectCameraRayWithPlane` (ray-plane hit, `false` for parallel/behind-origin).

Discipline holds across all of it: full unabbreviated names with `Matrix4`/`Vector3`/`Frustum`/`Plane` operand suffixes, `out`-param + alias-safety documented on every relevant function, `create*` the only allocators, sentinel `false`/`0` over throws, single root barrel, `sideEffects: false`, deps limited to `entity`/`geometry`/`types`.

## Gaps

- **`getCameraLinearDepth` is wrong for orthographic projection.** The function takes a `camera` but never branches on `camera.projection.kind`; it always applies the _perspective_ depth inversion `2·far·near / (ndcZ·(far−near) − (far+near))`. The doc comment claims "for orthographic projection the depth is already linear, so the same formula still applies" — this is false. Orthographic NDC depth is a different linear map (`ndcZ = −2·viewZ/(far−near) − (far+near)/(far−near)`), and the perspective inversion does not reproduce it. Tests only exercise perspective (`depth.test.ts`), so the bug is uncaught. Either branch on `kind` (the registry/closed-union fork — see below) or scope the function to perspective and say so.
- **`inverseViewProjection` is still a cross-package leak.** The field lives on the `Camera` _entity_, is now _written_ by `updateCameraInverseViewProjection`, but is _read_ only by the effects packages (TAA/velocity/fog/DoF), never within `camera`. The prior review flagged it as "effect-owned state that leaked onto the camera type"; that question is unresolved — it is on the public entity but no camera consumer reads it. This is the per-package `imageCache`/runtime-slot pattern not being applied: a derived cache an effects subsystem owns arguably belongs on a runtime slot, not a public entity field.
- **Off-axis / asymmetric projection** — no `createOffAxisPerspectiveProjection` / oblique frustum for stereo/VR/portals/tiled. Deferred (needs new `kind` strings + a `setProjectionMatrix4` branch).
- **Reversed-Z / infinite-far perspective** — standard depth-precision variants, absent. Deferred (couples to GPU NDC-range convention in `render-gl`/`render-wgpu`).
- **Stored viewport** — `aspect` is still threaded through every `get*`/`setProjection*` call; no `setCameraViewport(camera, w, h)` / `getCameraAspect`. The dual source of truth (descriptor `aspect` vs loose arg) the prior review called a smell persists.
- **Controllers** — no orbit/fly/first-person. Correctly out of scope here (status defers to a `@flighthq/camera-controller` neighbor); noted only as the one thing an "authoritative" camera offering usually ships somewhere.
- **`getCameraFrustumCorners` allocates per call** — builds `ndcCorners` and a `results: number[][]` each invocation (`frustumCorners.ts:36,48`). In a per-frame-per-camera path this is GC pressure; module-level scratch would remove it. The worker flagged this and deferred it as premature; for a hot culling/CSM path it is borderline, not premature. The `ndcCorners` table can be a module constant trivially.

## Charter contradictions

The charter's North star, Boundaries, Decisions, and Open directions are all `TODO` stubs — only "What it is" is filled (3D camera; photo/device capture out of scope to `@flighthq/webcam`). Against that one line there are **no contradictions**: everything in the package is projection / view / view-projection / picking / culling for the scene-render pipeline, and nothing reaches into device capture. The boundary to `@flighthq/geometry` is also respected — the camera owns descriptors + composition and delegates all matrix/frustum/ray math to geometry.

`intersectCameraRayWithPlane` is the one placement worth a second look: it is a general ray-plane intersection with nothing camera-specific in it. The worker's rationale (it is the ergonomic companion to `getCameraScreenToWorldRay` for ground-drag) is defensible, but a charter that defined the geometry↔camera boundary might well home it in `@flighthq/geometry` instead. Flagged as a candidate open direction, not a contradiction, because the charter is silent.

## Contract & docs fit

**Lives up to the contract well.** Types are `@flighthq/types`-first (`Ray3D`, `Plane`, `Frustum`, `BoundingSphere`, `Camera`, `Projection` all in the header, implemented against). Names are full and unabbreviated, `out`-params and alias-safety are documented everywhere, failures return sentinels, the package has one root export and `sideEffects: false`, and a `flighthq-camera` crate mirror exists (modulo the compile-unverified caveat). `*Like` structural inputs (`Ray3DLike`, `Vector3Like`, `AabbLike`, `BoundingSphereLike`, `PlaneLike`, `FrustumLike`) are used correctly on the input side, and the one structural literal in source (`__scratchNdc = { x, y, z }` in `intersection.ts:86`) is an internal scratch for a `*Like`, which the style rule permits.

Two source-style nits (the "leave files cleaner" rule):

- `getCameraPosition` in `basis.ts:30-36` carries a stream-of-consciousness derivation comment with a literal "... wait, this is col 1 of R" / "Actually ..." self-correction left in. The math is right; the comment should be cleaned to the final statement.
- `getCameraLinearDepth`'s doc comment makes the false orthographic claim noted above — a comment that actively misdescribes behavior.

**Candidate doc revisions.** The Package Map line for camera is implicit (camera is covered under the 3D family in the Rust map and `@flighthq/scene`'s neighborhood, but there is no dedicated camera bullet in the TS `index.md` Package Map). Given fork G's decision that full 3D is in scope and `scene`/`mesh`/`lighting`/ `texture`/`camera` are now real crates, the TS Package Map should gain explicit bullets for the 3D-subject packages — camera among them — rather than leaving the 3D family only documented in `rust/index.md`. Flag for the user; acting on it is their gate.

## Candidate open directions

These are questions the stub charter does not answer that this review had to assume:

1. **Does `inverseViewProjection` belong on the `Camera` entity at all?** It is derived, written by one updater, and read only by effects packages. Charter should rule: keep as a public cache field, move to a runtime slot owned by the effects subsystem, or drop and have effects compute it. (This is the entity/runtime-slot pattern applied to a 3D entity.)
2. **Is `getCameraLinearDepth` perspective-only or projection-aware?** If projection-aware, it must branch on `kind` (and the off-axis/ortho cases multiply) — which makes the depth/projection family a candidate for the **closed-union-vs-registry fork (B)**: `setProjectionMatrix4` is already a closed `kind` switch, and adding off-axis/reversed-Z/infinite variants grows it. Charter should decide whether projection kinds stay a closed union (small, tight) or become an open registry as the family grows.
3. **Where is the geometry↔camera line for ray/plane math?** `intersectCameraRayWithPlane` is general; the charter should say whether camera re-exports geometry ergonomics or whether such helpers home in geometry.
4. **Is a stored viewport (`setCameraViewport`) the intended end-state**, retiring the threaded `aspect` argument and the descriptor/arg dual source of truth? This touches every `aspect`-threaded call site in `scene-gl` effects — a cross-package change the charter should bless before a worker takes it.
5. **What is the camera's scope vs. controllers and the 3D pipeline?** The charter should state the boundary to a future `@flighthq/camera-controller` and to `scene`/`mesh` so the off-axis/stereo/VR question (single-camera asymmetric frustum vs. a stereo-rig abstraction) has a home.
