---
package: '@flighthq/camera'
status: solid
score: 84
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source
  - tests
---

# camera -- Review

## Verdict

**Solid -- 84/100.** The package is the unified 2D and 3D camera math domain: projection descriptors (perspective, orthographic), view-matrix construction, view-projection composition, picking rays, world/screen projection, frustum extraction and culling predicates, frustum corners, basis/eye extraction, linear-depth recovery, directional-shadow framing, parallax, zoom-to-cursor, and visible-bounds culling for Camera2D. 102 unit tests pass across 17 colocated test files covering every source module. The delegation fix from the prior review's scene-gl finding has landed (glMeshProgram now calls `getCamera3DPosition`), and `getCamera3DLinearDepth` correctly branches on projection kind. Two points above the prior review: the migration is complete and depth recovery is projection-aware. The remaining gaps are additive projection models (off-axis, reversed-Z, infinite-far), the Camera2D Entity invariant, one per-call allocation in frustumCorners, and a stale comment.

## Present capabilities

Grounded in source; file references are relative to `packages/camera/src/`.

**3D camera core (`camera.ts`):** `createCamera3D` allocates an Entity-backed Camera3D from `Camera3DOptions` (projection, near, far). `getCamera3DViewProjectionMatrix4` composes projection x view with jitter applied. `getCamera3DInverseViewProjectionMatrix4` inverts the VP, returning false on failure. `setCamera3DViewMatrix4FromLookAt` and `setCamera3DViewMatrix4FromMatrix4` set the view; the latter fires the guard seam (`setCamera3DViewGuard`). `setCamera3DAspect` writes the projection's aspect (perspective: direct; orthographic: `halfWidth = halfHeight * aspect`). `setCamera3DJitter` writes NDC sub-pixel jitter. `updateCamera3DInverseViewProjection` refreshes the cached inverse VP.

**Projection (`projection.ts`):** `createPerspectiveProjection` and `createOrthographicProjection` build discriminated descriptors (non-Entity plain objects). `setProjectionMatrix4` delegates to geometry's `setPerspectiveMatrix4` / `setOrthographicMatrix4`. `isPerspectiveProjection` / `isOrthographicProjection` narrow the union. `getOrthographicProjectionTexelSize` returns the conservative per-texel world footprint for shadow stabilization.

**Basis vectors (`basis.ts`):** `getCamera3DPosition`, `getCamera3DForward`, `getCamera3DRight`, `getCamera3DUp` -- all extract from the view matrix rows/columns without inversion, relying on the orthonormality precondition. All alias-safe.

**Culling (`culling.ts`):** `getCamera3DFrustum` extracts six planes via `setFrustumFromMatrix4`. `isBoxInCamera3DFrustum`, `isSphereInCamera3DFrustum`, `isPointInCamera3DFrustum` are one-shot convenience predicates over a scratch frustum.

**Depth (`depth.ts`):** `getCamera3DLinearDepth` converts NDC depth to signed view-space Z for both perspective (rational inverse) and orthographic (affine remap), per the 2026-07-21 charter decision. `getCamera3DViewSpaceZ` returns the negated (positive) version. Both return 0 for degenerate clip range.

**Frustum corners (`frustumCorners.ts`):** `getCamera3DFrustumCorners` writes 8 world-space corners into a caller-provided tuple of Vector3Like. Returns false on non-invertible VP.

**Picking (`picking.ts`):** `getCamera3DScreenToWorldRay` unprojects NDC coords through the inverse VP to produce a world-space ray. `getCamera3DWorldToScreen` projects a world point to NDC, returning false when behind the camera.

**Intersection (`intersection.ts`):** `getCamera3DRayThroughBoundingSphere` projects a sphere center to screen then unprojects back to a ray -- the "ray a user casts toward a sphere's center." `intersectCamera3DRayWithPlane` is a general ray-plane intersection (not camera-specific in its math; lives here as an ergonomic companion to the picking ray).

**Shadow camera (`shadowCamera.ts`):** `configureDirectionalShadowCamera3D` (bounding-sphere fit, rotation-stable) and `configureDirectionalShadowCamera3DTightFit` (tight light-space AABB fit with padding) configure a Camera3D for directional-light shadow mapping.

**Diagnostics:** `explainCamera3DView` (`explainCamera3DView.ts`) returns plain-data `Camera3DViewExplanation` measuring orthonormality. `enableCameraGuards` / `disableCameraGuards` / `areCameraGuardsEnabled` (`enableCameraGuards.ts`) install log-once warnings on non-orthonormal views and degenerate visible bounds. The guard seam pattern implements the diagnostics inversion rule: core stays message-free; the guard module is separately importable and tree-shakeable.

**Camera2D (`camera2d.ts`, `viewMatrix.ts`, `projection2d.ts`, `parallax.ts`, `visibleBounds.ts`, `zoom.ts`):** `createCamera2D` allocates a plain-data `Camera2D` (not Entity-backed). `getCamera2DViewMatrix` builds the world-to-screen affine. `projectCamera2DPoint` / `unprojectCamera2DPoint` project and invert through the view matrix. `getCamera2DParallaxPoint` computes parallax-layer scroll offsets. `getCamera2DVisibleBounds` returns the conservative cull rectangle (fails toward drawing on zero zoom with an unbounded rectangle and fires the guard seam). `zoomCamera2DAtScreenPoint` adjusts zoom while pinning the world point under the cursor.

**Export lanes:** `index.ts` is a hand-curated 43-export public barrel. `contract.ts` re-exports all modules via `export *`. Two-lane structure is correct.

**Package shape:** `sideEffects: false`, no top-level registration, dependencies are `@flighthq/entity`, `@flighthq/geometry`, `@flighthq/log`, `@flighthq/types` -- all imported via `./contract`. No dependency on `@flighthq/math`, `@flighthq/sdk`, or any render package.

## Gaps

Concrete absences relative to AAA camera-math completeness and the charter's in-scope items.

1. **No off-axis / asymmetric projection.** The charter lists it in scope (2026-07-03 decision), and no `createOffAxisPerspectiveProjection` or off-axis `kind` on the `Projection` union exists. Status.md confirms this is unblocked.

2. **No reversed-Z or infinite-far perspective.** Also in scope per charter (2026-07-03 decision). `getCamera3DLinearDepth` (`depth.ts:29`) assumes `[-1, 1]` NDC range. Status.md notes this is blocked on the depth-range convention shared with `render-gl` / `render-wgpu`.

3. **Camera2D is not Entity-backed.** `createCamera2D` (`camera2d.ts:7-20`) returns a plain structural object, not an Entity. `Camera2D` (`types/src/Camera2D.ts:13`) does not extend Entity. This violates the repository-wide `create*` -> Entity invariant and the directed assessment item #3.

4. **Projection descriptors are non-Entity plain objects.** `createOrthographicProjection` and `createPerspectiveProjection` (`projection.ts:14,24`) return `{kind, ...fields}` literals. Under the `create*` = Entity rule, they must either become Entity-backed or adopt a non-`create*` vocabulary (e.g. a descriptor name). Same directed item #3.

5. **`getCamera3DFrustumCorners` allocates on every call.** `frustumCorners.ts:34` builds a fresh `ndcCorners` array literal and `:45-58` pushes eight `[wx,wy,wz]` triples into a fresh `results` array. The file already has module-level matrix scratch (`:70-71`); these two arrays should receive the same treatment or the eight intermediate results should be computed into local scalars before writing `out`.

6. **Stale comment in `basis.ts:22-23`.** The comment says scene-gl's `setGlMeshCameraPosition` "should delegate here rather than recomputing it inline." That delegation has already landed (`scene3d-gl/src/glMeshProgram.ts:246` now calls `getCamera3DPosition`), and the comment still references the pre-rename `scene-gl`. The comment is a stale caller-facing suggestion -- exactly the kind the diagnostics convention says should not live inline.

7. **`intersectCamera3DRayWithPlane` is a general ray-plane intersection.** Nothing in its math is camera-specific. The charter's open direction #2 asks whether this should home in `@flighthq/geometry`. It is a convenience ergonomic for picking workflows, but its generality means a caller doing non-camera ray-plane math must import `@flighthq/camera`.

8. **`PerspectiveProjection.aspect` dual source of truth.** Status.md documents this: `setCamera3DAspect` stores `aspect` on the projection, but `setProjectionMatrix4` always uses its `aspect` parameter, never reading `projection.aspect`. Two sources of truth; the parameter silently wins.

9. **Camera3D stores no viewport.** Camera2D carries `viewportWidth` / `viewportHeight`, while Camera3D has none, which is why `aspect` is threaded through every function. The asymmetry between the two cameras is an undecided design question (charter open direction #3).

10. **No oblique clip plane.** A standard camera utility for portals, mirrors, and water reflections. Not mentioned in the charter as in- or out-of-scope.

## Charter contradictions

1. **The `basis.ts` comment violates the diagnostics convention.** The charter's North star says to follow the codebase-map design constraints, and the diagnostics convention bans inline caller-facing warning comments -- they become guard-layer runtime warnings. Lines 22-23 are a caller-facing suggestion (now stale) rather than a durable semantic comment.

2. **No other contradictions found.** The delegation of math to geometry, types-first header layout, allocation discipline, alias-safe out-params, and sentinel-on-failure pattern are consistently followed across all source files. The guard/explain diagnostics pair is exemplary.

## Contract and docs fit

**(a) Package -> contract conformance:**

- Types are correctly homed in `@flighthq/types`: `Camera3D`, `Camera3DLike`, `Camera3DOptions`, `Camera3DViewExplanation`, `Camera2D`, `Camera2DOptions`, `Camera2DFollowOptions`, `Projection`, `PerspectiveProjection`, `OrthographicProjection`, `PerspectiveProjectionOptions`, `OrthographicProjectionOptions` all live there. The package exports functions only.
- Full unabbreviated names on all exported functions: `getCamera3DFrustumCorners`, `isBoxInCamera3DFrustum`, `getCamera2DVisibleBounds`, etc.
- `out`-param style with alias safety is consistent across basis, picking, culling, frustumCorners, and Camera2D projection.
- Sentinels on failure: `false` return on non-invertible matrices, behind-camera points, empty spheres. No throws.
- `sideEffects: false`, no top-level registration.
- Two export lanes (`.` and `./contract`) are correct.
- `Readonly<T>` used on all input parameters.

**(b) Contract/docs -> reality candidate revisions:**

- **Package Map in `AGENTS.md`.** The line reads `camera (3D and 2D)` under the 3D-data grouping. Accurate. No revision needed.
- **`Camera3DViewExplanation` is exported only on the contract lane of `@flighthq/types`**, not the public (`.`) lane. Since `explainCamera3DView` is on the public lane of `@flighthq/camera`, a user importing from `@flighthq/types` cannot type its return value without switching to `@flighthq/types/contract`. This is likely intentional (the explain function is a diagnostic, not a core consumer API), but worth confirming.

## Candidate open directions

Questions the charter does not answer that this review had to assume or leave open.

1. **Should `intersectCamera3DRayWithPlane` move to `@flighthq/geometry`?** It is fully general ray-plane math with no camera input. The charter's open direction #2 asks this and it is still unanswered. The convenience argument (keep the picking workflow in one import) vs. the generality argument (a non-camera raycaster should not import camera) is a real boundary question.

2. **Is the `PerspectiveProjection.aspect` stored field intended to survive?** It is written by `setCamera3DAspect` but never read by any camera function (the `aspect` parameter always wins). Either it should become the default when no argument is supplied, or it should be removed and `setCamera3DAspect` dropped. The charter does not rule on this.

3. **Should `Camera2D` extend Entity?** The charter records the 2026-07-15 merge decision but does not address whether Camera2D takes on the Entity invariant. Camera3D extends Entity and `createCamera3D` calls `createEntity`; Camera2D does not. The assessment's directed item #3 names this but the charter carries no matching decision.

4. **Is an oblique clip plane in scope?** Portal/mirror/water-reflection cameras typically need `setCamera3DObliqueClipPlane`, which modifies the near plane of the projection matrix. The charter says nothing about it.

5. **Should `Camera3DViewExplanation` be on the public type lane?** It is currently contract-only in `@flighthq/types`. If `explainCamera3DView` is a public API (it is on camera's public lane), its return type should be importable from the public types lane too.
