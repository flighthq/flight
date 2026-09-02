---
package: '@flighthq/camera2d'
status: solid
score: 82
updated: 2026-09-02
ingested:
  - charter.md
  - source (packages/camera/src/ -- camera2d.ts, viewMatrix.ts, projection2d.ts, parallax.ts, visibleBounds.ts, zoom.ts, enableCameraGuards.ts)
  - source (packages/camera-controls/src/follow.ts)
  - types (packages/types/src/Camera2D.ts)
  - packages/camera/package.json
---

# camera2d — Review

## Verdict

absorbed, 82/100. `@flighthq/camera2d` no longer exists as a package directory; the charter's 2026-07-21 decision merged it into `@flighthq/camera`, and target-follow moved to `@flighthq/camera-controls`. Every capability the charter's North star named is implemented and lives in one of those two packages: view matrix, project/unproject, deadzone+damp follow with bounds clamping, zoom-at-point, parallax, and visible bounds. The two gaps flagged in the prior review that were within-package work have been closed: the guard layer now exists (unified `enableCameraGuards` covering degenerate visible bounds), and the test holes around rotation over-cover and zoom-at-point invariants are filled. The score rises from 74 to 82 because the guard layer and test depth were the main within-package blockers; what remains is breadth (shake, look-ahead, smoothed zoom/rotation, multi-target framing), all of which are charter open directions, not oversights.

## Present capabilities

All paths verified against `packages/camera/src/` and `packages/camera-controls/src/` at this tree, not carried from prior review.

- **Entity** -- `createCamera2D(viewportWidth, viewportHeight, options?)` in `camera2d.ts`. The only allocating function. `Camera2D`, `Camera2DOptions`, and `Camera2DFollowOptions` live in `packages/types/src/Camera2D.ts` per the charter decision. The entity is a plain data bag with six fields: `x`, `y`, `zoom`, `rotation`, `viewportWidth`, `viewportHeight`.
- **View matrix** -- `getCamera2DViewMatrix` in `viewMatrix.ts`. Composes `T(viewportCenter) * R(-rotation) * S(zoom) * T(-x, -y)` using geometry's `setTransformMatrix` + `translateMatrixByVectorXY`. Writes to an `out` parameter, alias-safe, documented inline.
- **Projection** -- `projectCamera2DPoint` / `unprojectCamera2DPoint` in `projection2d.ts`. World-to-screen and screen-to-world through the view matrix (and its inverse). Both use a module-level scratch matrix, take `Readonly<Camera2D>`, and write to `out`.
- **Follow** -- `updateCamera2DFollow` in `packages/camera-controls/src/follow.ts` (no longer in this cell). Deadzone half-extents produce a goal; `damp(1/smoothTime)` for frame-rate-independent smoothing (snaps when `smoothTime <= 0` or `deltaTime <= 0`); optional `worldBounds` clamp that centers on axes where the level is smaller than the view. Reads inputs to locals before writing. Depends on `@flighthq/camera/contract` for `getCamera2DVisibleBounds` and `@flighthq/math/contract` for `damp`/`clamp`.
- **Zoom** -- `zoomCamera2DAtScreenPoint` in `zoom.ts`. Unprojects a screen point before and after setting the new zoom, then adjusts `x`/`y` by the difference, pinning the world point under the cursor.
- **Parallax** -- `getCamera2DParallaxPoint` in `parallax.ts`. Extracts the camera's screen-space scroll offset from the view matrix translation (minus viewport center), scaled by `factor`. Convention: 0 = screen-locked, 0.5 = half-speed drift, 1 = world-locked. Zoom/rotation-aware.
- **Culling** -- `getCamera2DVisibleBounds` in `visibleBounds.ts`. Inverse-transforms the viewport rectangle to get the world-space AABB. On a non-invertible matrix (zoom = 0), writes a finite unbounded rectangle (half `MAX_VALUE` origin, `MAX_VALUE` extent) so the fail mode is over-drawing rather than silent content removal. Fires a guard seam (`setCamera2DVisibleBoundsGuard`) on degenerate input.
- **Guard layer** -- `enableCameraGuards` / `disableCameraGuards` / `areCameraGuardsEnabled` in `enableCameraGuards.ts`. Installs a `logOnce` warning (through `@flighthq/log`) when `getCamera2DVisibleBounds` hits a non-invertible view matrix, naming the zoom value and the consequence ("nothing is culled"). Also covers 3D cameras (non-orthonormal view matrix). Tree-shakes out entirely when not imported; the core modules stay message-free.
- **Hygiene** -- `camera` package dependencies are `entity`, `geometry`, `log`, `types`; `sideEffects: false`. All function names carry the full `Camera2D` prefix. All camera inputs typed `Readonly<Camera2D>`. Out-params used consistently. Scratch objects at file bottom per convention. No `@flighthq/math` dependency in `camera` (math moved with follow to `camera-controls`).

## Test coverage (2D-relevant files in `packages/camera/src/`)

- `camera2d.test.ts` -- 2 tests: identity defaults, options override.
- `projection2d.test.ts` -- 3 tests: project center to viewport center, zoom, round-trip across multiple camera configs (zoom + rotation + offset).
- `viewMatrix.test.ts` -- 4 tests: center mapping, right-of-center at zoom 1, magnification at zoom 2, rotation.
- `visibleBounds.test.ts` -- 5 tests: full viewport at zoom 1, half at zoom 2, rotation AABB larger than viewport with corner containment check, degenerate fail-toward-drawing with finite max-edge and distant intersection, guard seam fires on degenerate.
- `parallax.test.ts` -- 3 tests: factor 0 (screen-locked), 1 (world-locked), 0.5.
- `zoom.test.ts` -- 2 tests: corner pin at identity, arbitrary screen point pin under rotation.
- `enableCameraGuards.test.ts` -- 5 tests (2 are 2D-specific): degenerate warn names zoom and consequence, stays silent for invertible camera; plus toggle and 3D tests.

Total: ~24 2D-relevant tests across 7 colocated files. The prior review's two test-depth gaps (rotation over-cover property, zoom-at-point invariant) are now covered.

## Gaps

Measured against the charter's North star and a mature 2D game-camera surface:

- **Camera shake / impulse** -- additive positional/rotational noise with decay (charter Open direction 1). The standard juice primitive; nothing composes it today. The composition shape (stateful entity vs pure offset helper) is an undecided design fork.
- **Smoothed zoom + rotation follow** -- `damp` smoothing exists only for position in `updateCamera2DFollow`; zoom and rotation targets snap (charter Open direction 3). This now lives in `camera-controls`, so extending it is that package's scope.
- **Follow look-ahead** -- leading the camera by target velocity/facing, the canonical companion to a deadzone; no field for it in `Camera2DFollowOptions`. Again, `camera-controls` scope.
- **Multi-target framing** -- fit a set of world points with margin (position + zoom out), the split-screen/co-op staple. Could live in either `camera` or `camera-controls`.
- **Deadzone frame under rotation** -- the deadzone is world-axis-aligned (documented in `follow.ts`); a rotated camera arguably wants a view-aligned box. Documented limitation in `camera-controls`, not a bug.
- **Additional 2D guards** -- `enableCameraGuards` covers degenerate visible bounds but does not warn on `zoom <= 0` at creation, non-positive viewport dimensions, or negative `smoothTime`. The first two would go in `camera`, the last in `camera-controls`.
- **`Camera2DFollowOptions` type placement** -- the type still references `updateCamera2DFollow` in its doc comment and lives in `@flighthq/types`, but the function is in `camera-controls`, not `camera`. Not a defect, but the coupling is looser than other type-to-function pairs.

## Charter contradictions

None. The charter's three 2026-07-10 decisions are realized:

1. Plain-data `Camera2D`, center-anchored, free functions -- verified. `Camera2D` is six mutable fields, no methods. All operations are free functions writing to `out` params.
2. Frame-rate-independent follow smoothing via `damp` -- verified in `camera-controls/src/follow.ts`. Deadzone, snap-on-zero, world-bounds clamping all present. Parameters are explicit, no hidden defaults.
3. `Camera2D` type in `@flighthq/types` -- verified. `Camera2D`, `Camera2DOptions`, `Camera2DFollowOptions` all in `packages/types/src/Camera2D.ts`.

The 2026-07-21 absorption decision is realized: `packages/camera2d/` is gone, source lives in `packages/camera/src/`, follow moved to `camera-controls`.

## Contract & docs fit

- **Naming**: every exported function carries the full `Camera2D` prefix (`getCamera2DViewMatrix`, `projectCamera2DPoint`, etc.). Globally unique, self-identifying.
- **Out params**: every derive function writes to an `out` parameter. `createCamera2D` is the sole allocator.
- **Readonly**: all `camera` parameters typed `Readonly<Camera2D>` in the pure-read functions; `zoomCamera2DAtScreenPoint` and `updateCamera2DFollow` take mutable `Camera2D` since they mutate it, which is correct.
- **Guard layer**: uses the diagnostics inversion pattern -- a seam function (`setCamera2DVisibleBoundsGuard`) keeps the core message-free; the guard module installs through it and depends on `@flighthq/log`.
- **Scratch placement**: module-level scratch objects (`scratchMatrix`, `scratchInverse`, `scratchBefore`, `scratchAfter`, `scratchBounds`) at file bottom in every file, per style convention.
- **Side effects**: `sideEffects: false` in `package.json`. No top-level registrations or state mutations.
- **Export lanes**: `.` and `./contract` both present. `index.ts` is a curated public barrel; `contract.ts` re-exports everything.
- **Package Map**: AGENTS.md lists `camera` under "3D data" with the note "(3D and 2D)". The absorbed 2D surface is accounted for.

## Candidate open directions

- **Shake/impulse composition shape** -- charter Open direction 1. A stateful `Camera2DShake` descriptor stepped per frame (allocated, with decay state) vs a pure offset function the caller adds to `camera.x`/`camera.y`. The charter gestures at "a composing helper" without fixing the form; this needs direction before building.
- **Split-screen / viewport-offset convention** -- charter Open direction 2. The view matrix in `getCamera2DViewMatrix` translates to `(viewportWidth/2, viewportHeight/2)`, assuming the viewport starts at screen (0, 0). Multiple cameras on sub-viewports would need an origin offset, either in `Camera2D` or as a parameter.
- **Smoothed zoom + rotation targets** -- charter Open direction 3. Extending `updateCamera2DFollow` in `camera-controls` to `damp` toward a target zoom/rotation, not just position.
- **Follow look-ahead and multi-target framing** -- canonical capabilities not yet charted as open directions. Look-ahead (velocity-based camera lead) is a `Camera2DFollowOptions` extension; multi-target framing (fit N points with margin, producing position + zoom) is a new function family.
- **View-aligned deadzone under rotation** -- the deadzone box is world-axis-aligned. Under a rotated camera this may track the wrong edges. A design choice, not a bug, but the charter is silent on which alignment is intended.
