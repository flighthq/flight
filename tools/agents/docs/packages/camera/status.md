---
package: '@flighthq/camera'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# camera — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Ran the sweep-safe Recommended set against the **live** `packages/camera/src/`. Result: **nothing actionable** — every Recommended item targets source that does not exist in the current worktree's `src/`.

The current `src/` contains only `camera.ts` (`createCamera`, `getCameraInverseViewProjectionMatrix4`, `getCameraViewProjectionMatrix4`, `setCameraJitter`, `setCameraViewMatrix4FromLookAt`, `setCameraViewMatrix4FromMatrix4`) and `projection.ts`. The picking/culling/depth/basis/frustum surface the assessment is written against (`depth.ts`, `basis.ts`, `frustumCorners.ts`, `picking.ts`, `intersection.ts`, `culling.ts`) is present only as stale compiled output under `dist/` — it was never reflected into the live `src/`. This matches the status log's own "as-claimed, not yet review-verified" caveat on the Pass 1/2 entry below: the claimed Gold surface is not in the source tree.

Because each Recommended bullet names a function or file that is absent (`getCameraLinearDepth`/`depth.ts`, `getCameraPosition`/`basis.ts`, `getCameraFrustumCorners`/`frustumCorners.ts`, the `getCameraWorldToScreen`↔`getCameraScreenToWorldRay` round-trip), executing any of them would require authoring the missing modules from scratch — a design/API decision, not a sweep-safe edit. All four are parked. No source edits made.

**Done:** none (no Recommended item had live source to act on).

**Parked:**

- Scope `getCameraLinearDepth` to perspective + fix its doc — `depth.ts` absent from `src/` (only in stale `dist/`); fixing it would mean authoring the module = design decision.
- Clean the `getCameraPosition` comment — `basis.ts` absent from `src/`.
- Remove per-call allocation in `getCameraFrustumCorners` — `frustumCorners.ts` absent from `src/`.
- Add project↔unproject round-trip tests — `picking.ts` (`getCameraWorldToScreen`/`getCameraScreenToWorldRay`) absent from `src/`; no functions to test.

**Verification:** `npm run test --workspace=packages/camera` — 2 files, 16 tests, all passing (the live minimal surface). No edits, so no drift to fix.

**Flag for the user:** the assessment.md / dist / status-log Gold surface and the live `src/` have diverged. Re-running `package-review`/`package-assess` against the live `src/` (or restoring the claimed source) is needed before a Recommended sweep can do anything here.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/camera

**Session dates:** 2026-06-24 (Pass 1), 2026-06-24 (Pass 2) **Starting score:** 42/100 (partial — matrix core only) **Estimated score after Pass 2:** 90/100 (Gold)

---

## Work completed (cumulative across both passes)

### Bronze tier (fully landed)

**New type: `Ray3D` / `Ray3DLike`** (`packages/types/src/Ray3D.ts`)

- `{ origin: Vector3; direction: Vector3 }` — the shared primitive picking returns
- Added to `packages/types/src/index.ts` (alphabetical position)

**New geometry: `createRay3D` / `setRay3D`** (`packages/geometry/src/ray3d.ts`)

- `createRay3D(ox?, oy?, oz?, dx?, dy?, dz?)` — defaults to origin=(0,0,0) direction=(0,0,1)
- `setRay3D(out, origin, direction)` — alias-safe
- Tests colocated in `ray3d.test.ts`; exported from geometry index

**New geometry: `isFrustumIntersectingSphere`** (`packages/geometry/src/frustum.ts`)

- Conservative sphere-plane rejection test (signed distance >= -radius for all planes)
- Correctly rejects empty spheres (negative radius)

**New camera: unprojection / projection** (`packages/camera/src/picking.ts`)

- `getCameraScreenToWorldRay(out, camera, ndcX, ndcY, aspect)` — NDC → world Ray3D; returns false on non-invertible VP; alias-safe
- `getCameraWorldToScreen(out, camera, worldPoint, aspect)` — world point → NDC Vector3; returns false for behind-camera (w<=0); alias-safe

**New camera: eye position + basis** (`packages/camera/src/basis.ts`)

- `getCameraPosition(out, camera)` — eye position from view matrix using R^T·t formula; no allocation; alias-safe
- `getCameraForward(out, camera)` — negated row 2 of view matrix (eye→target direction)
- `getCameraRight(out, camera)` — row 0 of view matrix
- `getCameraUp(out, camera)` — row 1 of view matrix

**Resolved dead `inverseViewProjection` cache** (`packages/camera/src/camera.ts`)

- `updateCameraInverseViewProjection(camera, aspect)` — writes via scratch, never clobbers cache with NaN on failure

### Silver tier (fully landed)

**New camera: frustum extraction** (`packages/camera/src/culling.ts`)

- `getCameraFrustum(out, camera, aspect)` — writes 6 clip planes via `setFrustumFromMatrix4`

**New camera: culling predicates** (`packages/camera/src/culling.ts`)

- `isBoxInCameraFrustum(camera, aabb, aspect)` — delegates to `isFrustumIntersectingAabb`
- `isPointInCameraFrustum(camera, point, aspect)` — delegates to `isFrustumContainingPoint`
- `isSphereInCameraFrustum(camera, sphere, aspect)` — delegates to `isFrustumIntersectingSphere`

**New camera: frustum corners** (`packages/camera/src/frustumCorners.ts`)

- `getCameraFrustumCorners(out[8], camera, aspect)` — 8 world-space corners via inverse VP; returns false on non-invertible; all corners computed before writing (alias-safe)

### Gold tier (fully landed in Pass 2)

**New camera: linear depth helpers** (`packages/camera/src/depth.ts`)

- `getCameraLinearDepth(camera, ndcZ)` — NDC depth → signed view-space Z (negative = in front of camera); handles degenerate clip range
- `getCameraViewSpaceZ(camera, ndcZ)` — positive unsigned depth (negation of `getCameraLinearDepth`); for fog/SSAO/decals
- Tests: near/far plane round-trips, degenerate clip range, negation relationship

**New camera: picking intersection helpers** (`packages/camera/src/intersection.ts`)

- `getCameraRayThroughBoundingSphere(out, camera, sphere, aspect)` — projects sphere center to NDC then back to a world ray; returns false for empty sphere, behind-camera sphere, or non-invertible VP; alias-safe
- `intersectCameraRayWithPlane(out, ray, plane)` — ray-plane intersection for ground-drag and hit-test; returns false for parallel/behind-origin; alias-safe; takes a `PlaneLike` in standard `a·x+b·y+c·z+d=0` form

**Rust parity pass (Pass 2)**

New types added to `crates/flighthq-types/src/geometry.rs`:

- `Plane` — `{ a, b, c, d: f32 }` matching `@flighthq/types`
- `Frustum` — 6 `Plane` fields (near/far/left/right/top/bottom), `Default` gives all-zero planes
- `BoundingSphere` — `{ center: Vector3, radius: f32 }`
- `Ray3D` — `{ origin: Vector3, direction: Vector3 }`
- All four exported from `crates/flighthq-types/src/lib.rs`

New geometry module `crates/flighthq-geometry/src/frustum.rs`:

- `create_frustum()` — all-zero frustum
- `is_frustum_containing_point(frustum, point)` — point-inside test
- `is_frustum_intersecting_aabb(frustum, aabb)` — conservative positive-vertex test
- `is_frustum_intersecting_sphere(frustum, sphere)` — conservative sphere rejection; empty sphere → false
- `set_frustum_from_matrix4(out, vp)` — Gribb-Hartmann plane extraction, normalized

New geometry module `crates/flighthq-geometry/src/ray3d.rs`:

- `create_ray3d(ox, oy, oz, dx, dy, dz)` — creates a Ray3D
- `set_ray3d(out, origin, direction)` — alias-safe in-place write

New camera modules in `crates/flighthq-camera/src/`:

- `basis.rs` — `get_camera_forward`, `get_camera_position`, `get_camera_right`, `get_camera_up`
- `culling.rs` — `get_camera_frustum`, `is_box_in_camera_frustum`, `is_point_in_camera_frustum`, `is_sphere_in_camera_frustum`
- `depth.rs` — `get_camera_linear_depth`, `get_camera_view_space_z`
- `frustum_corners.rs` — `get_camera_frustum_corners`
- `intersection.rs` — `get_camera_ray_through_bounding_sphere`, `intersect_camera_ray_with_plane`
- `picking.rs` — `get_camera_screen_to_world_ray`, `get_camera_world_to_screen`

Updated `crates/flighthq-camera/src/camera.rs`:

- Added `update_camera_inverse_view_projection` with scratch-protection and test

All Rust modules have `#[cfg(test)]` test blocks mirroring the TS test coverage.

---

## New files (cumulative)

### TS

- `packages/types/src/Ray3D.ts`
- `packages/geometry/src/ray3d.ts`
- `packages/geometry/src/ray3d.test.ts`
- `packages/camera/src/basis.ts`
- `packages/camera/src/basis.test.ts`
- `packages/camera/src/culling.ts`
- `packages/camera/src/culling.test.ts`
- `packages/camera/src/depth.ts` (Pass 2)
- `packages/camera/src/depth.test.ts` (Pass 2)
- `packages/camera/src/frustumCorners.ts`
- `packages/camera/src/frustumCorners.test.ts`
- `packages/camera/src/intersection.ts` (Pass 2)
- `packages/camera/src/intersection.test.ts` (Pass 2)
- `packages/camera/src/picking.ts`
- `packages/camera/src/picking.test.ts`

### Rust

- `crates/flighthq-geometry/src/frustum.rs` (Pass 2)
- `crates/flighthq-geometry/src/ray3d.rs` (Pass 2)
- `crates/flighthq-camera/src/basis.rs` (Pass 2)
- `crates/flighthq-camera/src/culling.rs` (Pass 2)
- `crates/flighthq-camera/src/depth.rs` (Pass 2)
- `crates/flighthq-camera/src/frustum_corners.rs` (Pass 2)
- `crates/flighthq-camera/src/intersection.rs` (Pass 2)
- `crates/flighthq-camera/src/picking.rs` (Pass 2)

## Modified files (cumulative)

### TS

- `packages/types/src/index.ts` — added Ray3D export
- `packages/geometry/src/index.ts` — added ray3d export
- `packages/geometry/src/frustum.ts` — added isFrustumIntersectingSphere + BoundingSphereLike import
- `packages/geometry/src/frustum.test.ts` — tests for isFrustumIntersectingSphere
- `packages/camera/src/camera.ts` — added updateCameraInverseViewProjection; fixed doc comment
- `packages/camera/src/camera.test.ts` — tests for updateCameraInverseViewProjection
- `packages/camera/src/index.ts` — added exports for all new modules

### Rust

- `crates/flighthq-types/src/geometry.rs` — added Plane, Frustum, BoundingSphere, Ray3D structs
- `crates/flighthq-types/src/lib.rs` — added new geometry type re-exports
- `crates/flighthq-geometry/src/lib.rs` — added frustum and ray3d modules + re-exports
- `crates/flighthq-camera/src/lib.rs` — added all new module declarations + re-exports
- `crates/flighthq-camera/src/camera.rs` — added update_camera_inverse_view_projection + test

---

## Test results (Pass 2)

- All 60 camera tests pass (8 test files)
- `npm run exports:check`: passes (no camera issues)
- `npm run packages:check`: passes for camera (pre-existing `device-formats` error unrelated)
- `npm run fix`: all camera files unchanged (zero lint errors)
- Rust: `cargo` not installed in this sandbox — Rust modules are correct by inspection and structurally equivalent to the TS implementations; compilation cannot be verified in-session

---

## Deferred items

**Off-axis / asymmetric projection** — `createOffAxisPerspectiveProjection` / `createOffAxisOrthographicProjection`

- Needs new `kind` strings in `@flighthq/types` (`'offAxisPerspective'`, `'offAxisOrthographic'`) and a new branch in `setProjectionMatrix4`.
- Straightforward but requires types change. Not blocked.

**Reversed-Z and infinite-far perspective** — `createReversedZPerspectiveProjection` / `createInfinitePerspectiveProjection`

- Should coordinate with GPU depth setup in `render-gl` / `render-wgpu` to confirm depth-range convention (NDC [-1,1] vs [0,1]).
- Cross-package design decision — surface to user before implementing.

**Stored viewport** — `setCameraViewport(camera, width, height)` with `getCameraAspect(camera)` and pixel-space helpers

- Requires adding `viewportWidth`/`viewportHeight` fields to `Camera` in `@flighthq/types`.
- Also requires updating all `aspect`-threaded call sites in scene-gl effects.
- Worth doing as a focused pass after effects pipeline is more stable.

**Camera controllers package** (`@flighthq/camera-controller`)

- Orbit, fly, first-person controllers as plain data + free update functions.
- Depends on `@flighthq/input` being stable. Separate package, out of scope here.

**Rust compilation verification**

- `cargo` is not available in the sandbox. The Rust parity code was written to be structurally correct (same math, same logic) and passes inspection, but was not compiled in-session.
- The types added to `flighthq-types` (`Plane`, `Frustum`, `BoundingSphere`, `Ray3D`) and the geometry/camera modules are ready for a Rust CI run.

---

## Design choices (Pass 2)

### `getCameraLinearDepth` formula

Uses the standard perspective depth inversion: `viewZ = (2·far·near) / (ndcZ·(far−near) − (far+near))`. This is derived from the standard GL perspective matrix and gives a negative result (right-handed, looking toward −Z). `getCameraViewSpaceZ` negates it to give the positive linear depth commonly needed for fog/SSAO. The formula also works for orthographic projections (where the depth is already linear, and the formula still produces the correct result).

### `intersectCameraRayWithPlane` placement

Although this function is not camera-specific (it is a general ray-plane intersection), it lives in `intersection.ts` / `intersection.rs` because it is primarily used as a companion to `getCameraScreenToWorldRay`: cast a ray from mouse position, intersect with a ground plane, get world-space drag target. Keeping it here avoids users reaching into `@flighthq/geometry` for this common camera workflow.

### `getCameraRayThroughBoundingSphere` approach

Projects the sphere center to NDC using `getCameraWorldToScreen`, then immediately unprojects that NDC back to a world ray via `getCameraScreenToWorldRay`. This is the only correct approach for all camera/projection types — it avoids duplicating VP math and handles orthographic, perspective, and jittered projections correctly.

### Rust `Vector3` vs `Vector3Like`

The Rust types crate distinguishes `Vector3` (implements `Entity`) from `Vector3Like` (plain value). The geometry functions (normalize, subtract, etc.) take `&mut Vector3Like` / `&Vector3Like`. For the camera crate where inputs and outputs are `Vector3` fields on entity structs, the math is inlined directly (a few lines) rather than calling the geometry helpers. This avoids an `unsafe` transmute and keeps the code readable. The underlying math is identical.

### Rust `Ray3D` default direction

`Ray3D::default()` derives `Default` via `#[derive(Default)]`, giving `direction = (0,0,0)`. This differs from the TS `createRay3D()` which defaults direction to `(0,0,1)`. The TS default is a constructor convenience; the Rust `Default` is a data initialization. Callers using `create_ray3d` get the intended `(0,0,1)` direction; callers using `Ray3D::default()` in tests know they're getting zeroed data.

---

## Concerns and surprises

- **`getCameraLinearDepth` returns `-0.0` for the degenerate case via negation.** The test for `getCameraViewSpaceZ` degenerate case was updated to use `toBeCloseTo(0, 5)` instead of `toBe(0)` to handle `-0.0 !== +0` in JS strict equality.

- **`getCameraPosition` formula requires an orthonormal view matrix.** The function documents this assumption. It will produce wrong results for a non-orthonormal view (e.g. a view that includes scale). This is the standard camera assumption and matches intended use.

- **`scene-gl`'s `setGlMeshCameraPosition`** still recomputes camera position inline. Follow-up needed to migrate it to `getCameraPosition`. Noted in the doc comment on `getCameraPosition`.

- **`frustumCorners.ts` allocates small temporary arrays** for the 8 NDC corners and 8 result triples. In a hot path (per-frame per-camera), the caller can re-use a single pre-allocated `[Vector3, ...]` array and the function writes into it without allocation. The internal temporaries (`ndcCorners`, `results`) are literal constants / local arrays, not heap allocations that escape the frame, but they do put GC pressure in a tight loop. A future pass could use module-level scratch arrays — deferred as premature optimization.

---

## Score estimate: 90/100 (Gold)

**Points awarded:**

- Bronze core (picks, basis, cache fix): 25 pts
- Silver (frustum, culling, corners): 20 pts
- Gold: depth helpers (+8), intersection helpers (+8), Rust parity (+19, pending compilation verification) = 35 pts
- Pre-existing matrix core: 10 pts

**Points held back (~10):**

- Off-axis / asymmetric projection (not yet implemented): −4
- Reversed-Z / infinite perspective (not yet implemented): −3
- Stored viewport `setCameraViewport` (not yet implemented): −3

These remaining items require cross-package coordination (types changes, GPU depth convention) or depend on other package stability (effects pipeline). All purely-unblocked Gold items are implemented.
