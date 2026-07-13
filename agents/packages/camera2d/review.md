---
package: '@flighthq/camera2d'
status: solid
score: 74
updated: 2026-07-13
ingested:
  - status.md
  - source
---

# camera2d — Review

## Verdict

solid — 74/100. The charter's North star is fully realized in a small, clean surface: every named capability (view matrix, project/unproject, deadzone+damp follow with bounds clamp, zoom-at-point, parallax, visible bounds) exists, is alias-safe, and is allocation-free past `createCamera2D`. What keeps it below authoritative is breadth: the conveniences a mature 2D game camera ships (shake, look-ahead, smoothed zoom/rotation, multi-target framing) are absent, and there is no guard layer.

## Present capabilities

- **Entity** — `createCamera2D(viewportWidth, viewportHeight, options?)` (`camera2d.ts`); the only allocating function, per its own comment. `Camera2D`/`Camera2DOptions`/`Camera2DFollowOptions` live in `packages/types/src/Camera2D.ts` per the charter decision.
- **View matrix** — `getCamera2DViewMatrix` (`viewMatrix.ts`): `T(center)·R(-rotation)·S(zoom)·T(-x,-y)` composed via geometry's `setTransformMatrix` + `translateMatrixByVectorXY`, documented and alias-safe.
- **Projection** — `projectCamera2DPoint` / `unprojectCamera2DPoint` (`projection.ts`) through the view matrix and its inverse.
- **Follow** — `updateCamera2DFollow` (`follow.ts`): deadzone half-extents → goal, `damp(1/smoothTime)` frame-rate-independent smoothing (snap when `smoothTime <= 0` or `deltaTime <= 0`), optional `worldBounds` clamp that centers on an axis the level is smaller than the view. Inputs read to locals before writes (aliasing-safe, documented).
- **Zoom** — `zoomCamera2DAtScreenPoint` (`zoom.ts`): pin-the-cursor via unproject-before/after re-centering.
- **Parallax** — `getCamera2DParallaxPoint` (`parallax.ts`): factor-scaled camera screen translation, zoom/rotation-aware; the 0 / 0.5 / 1 convention is documented at the callsite.
- **Culling** — `getCamera2DVisibleBounds` (`visibleBounds.ts`): inverse-transform of the viewport rect; documented as the enclosing AABB (over-covers under rotation).
- **Hygiene** — deps exactly `geometry` + `math` + `types` (matches Boundaries); `sideEffects: false`; scratch objects at file bottom; 23 tests across 7 colocated files.

## Gaps

Measured against a mature 2D game-camera library (and useful beyond games — any pan/zoom canvas or map view):

- **Camera shake / impulse** — additive positional/rotational noise with decay (charter Open direction 1). The standard juice primitive; nothing composes it today.
- **Smoothed zoom + rotation follow** — `damp` smoothing exists only for position; zoom/rotation targets snap (Open direction 3).
- **Follow look-ahead** — leading the camera by target velocity/facing, the canonical companion to a deadzone; no option for it in `Camera2DFollowOptions`.
- **Multi-target framing** — fit a set of world points with margin (position + zoom out), the split-screen/co-op staple.
- **Deadzone frame under rotation** — the deadzone is world-axis-aligned (documented in `follow.ts`); a rotated camera arguably wants a view-aligned box. Currently a documented limitation, not a bug.
- **No guard layer** — `zoom <= 0` or a zero viewport silently produces a non-invertible view matrix (NaNs from `inverseMatrix`); per the diagnostics inversion rule this wants `enableCamera2DGuards`, not a comment.
- **Test depth** — no test asserts the rotation over-cover property of `getCamera2DVisibleBounds`, and no fuzz/invariant test for the zoom-at-point pin (project(worldBefore) == screen after).

## Charter contradictions

None found. The code matches all three 2026-07-10 decisions (plain-data center-anchored entity, `damp`-based follow with explicit options, types in the header layer), and dependency boundaries hold.

## Contract & docs fit

- **Contract**: exemplary — full unabbreviated `Camera2D` names, `out` params everywhere, single root barrel, `Readonly<>` on inputs, module scratch at bottom, no throws.
- **Docs**: the codebase-map Package Map line for `camera2d` matches reality closely (function names, follow semantics, conventions). No stale claims found.

## Candidate open directions

- Split-screen viewport-offset convention (already charter Open direction 2) — the view matrix assumes the viewport starts at screen (0,0).
- World-aligned vs view-aligned deadzone under camera rotation — the charter is silent; the code chose world-aligned and documented it.
- Shake composition shape — a stateful `Camera2DShake` stepped per frame vs a pure offset function the caller adds; the charter gestures at "a composing helper" without fixing the shape.
