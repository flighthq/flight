---
package: '@flighthq/camera2d'
crate: flighthq-camera2d
draft: false
lastDirection: 2026-07-10
review: ./review.md
assessment: ./assessment.md
status: ./status.md
absorbed: '@flighthq/camera'
---

# camera2d — Charter

## What it is

`@flighthq/camera2d` is the **2D camera cell** — a plain-data camera over a world that produces the world↔screen transform, follows a target with a deadzone and smoothing, clamps to world bounds, computes parallax-layer offsets, and reports the visible world rectangle for culling. It is the missing piece between a 2D game's world coordinates and what the renderer draws: the thing that decides "where the view is looking and how the world maps to the screen."

## North star

The complete 2D game camera: center + zoom + rotation over a viewport; `worldToScreen`/`screenToWorld` and a composed view matrix; target follow with a deadzone box, frame-rate-independent smoothing, and world-bounds clamping; zoom-about-a-screen-point; per-factor parallax offsets; and a visible-bounds query that feeds `@flighthq/spatial`/the renderer's cull. Plain-data camera, small side-effect-free functions writing to `out` params — no display object, no hidden per-frame state.

## Boundaries

- **Depends on `@flighthq/geometry` (Matrix/Vector2/Rectangle) + `@flighthq/math` (`damp`/`lerp`/`clamp` for smoothing) + `@flighthq/types`.** No display object, no renderer, no scene graph.
- **A camera, not a viewport manager.** It computes transforms and follow/cull math on a plain `Camera2D`; it does not own the canvas/DOM viewport, apply itself to a renderer, or hold a render target — the caller reads the view matrix and hands it to the renderer.
- **2D only.** 3D cameras (perspective/orthographic frustums) are the scene/3D-pipeline layer.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-10] Plain-data `Camera2D`, center-anchored, free functions.** `Camera2D` = `{ x; y; zoom; rotation; viewportWidth; viewportHeight }` where `(x,y)` is the world point at the viewport center (center-anchored is the game-camera norm). Functions compose a world→screen `Matrix` via `@flighthq/geometry` and write results to `out` params, allocation-free in the hot path. Follows the SDK's plain-data-over-stateful-object rule (no `Camera` class that mutates on `.update()` behind the scenes).
- **[2026-07-10] Frame-rate-independent follow smoothing.** Target follow uses `@flighthq/math`'s `damp` (exponential smoothing by a time constant), not a raw per-frame `lerp` factor, so behavior is stable across frame rates. A deadzone box (half-extents around the view center) suppresses motion until the target leaves it; optional world-bounds clamping keeps the view inside the level. All parameters are explicit options, no hidden defaults mutating the camera.
- **[2026-07-10] `Camera2D` type in `@flighthq/types`.** Header layer owns the shape so renderer/culling consumers reference it without importing this package. Function names carry the full `Camera2D` type name per the naming rule (`getCamera2DViewMatrix`, `updateCamera2DFollow`, `getCamera2DVisibleBounds`, world/screen projection + parallax + zoom-at-point helpers).
- **[2026-07-21] Absorbed into `@flighthq/camera`.** The dimension changes the representation, not the camera's mathematical role, so `Camera2D` and `Camera3D` share one package. This cell remains only as historical direction and must not cause `@flighthq/camera2d` to be recreated.

## Decisions

- **[2026-07-15] Merge into `@flighthq/camera`.** Both camera packages are pure math (matrix producers, no graph dependency). `Camera2D` moves into the unified `camera` package alongside the renamed `Camera3D`. The `camera2d` package is retired. User-directed.

## Open directions

1. **Camera shake / impulse.** Additive positional/rotational noise over a decay — a composing helper on top of the base transform.
2. **Multi-camera / split-screen.** Several `Camera2D`s over sub-viewports; mostly falls out of the plain-data design but the viewport-offset convention wants a ruling.
3. **Smoothed zoom + rotation follow.** Extend `damp`-based smoothing to zoom and rotation targets, not just position.
