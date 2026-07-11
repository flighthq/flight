---
package: '@flighthq/motionpath'
crate: flighthq-motionpath
draft: false
lastDirection: 2026-07-10
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# motionpath — Charter

## What it is

`@flighthq/motionpath` is the **path-following animation cell** — it advances a marker along a `@flighthq/path` over time at a controlled speed and reports the marker's world position and heading, so a caller can move (and orient) an object along a curve. It is the animation-family driver on top of `@flighthq/path`'s arc-length sampling: path owns the geometry and the "point at distance D" query; motionpath owns the "where is the marker now, and where is it heading, given speed and a loop mode" state over frames.

The name is `motionpath` (one word, no dash): a first-level compound domain, per the SDK's no-dash-first-level rule (`displayobject`, `movieclip`, `camera2d`), not a `-subpackage` neighbor of `path`.

## North star

The complete path-follow primitive: drive a marker by **arc length** (constant real speed along the curve, not the speed-distorting raw parameter), control speed/direction, choose an end behavior (clamp / loop / ping-pong), and read the current position, tangent, and heading angle — plus progress queries (distance, normalized `0..1`) — everything "move this thing along this path" needs, as plain-data state + small `out`-param functions.

## Boundaries

- **Depends on `@flighthq/path` (arc-length sampling: `getPathLength`, `getPathPositionAtDistance`) + `@flighthq/geometry` (Vector2) + `@flighthq/types`.** No display object, no renderer.
- **Follows a path, does not build or measure one.** Path construction and geometry are `@flighthq/path`'s; motionpath consumes a `Path`. It does not move a display object either — the caller reads position/heading and applies them to whatever it is animating.
- **Arc-length, not raw parameter.** Progress is real distance along the flattened curve so speed is uniform; the raw bezier parameter (non-uniform speed) is not the drive axis.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-10] Arc-length (distance) parameterization, plain-data `MotionPath` state.** `MotionPath = { path; length; distance; speed; loopMode }` (distance = current arc-length position; speed in units/sec; length cached at create). `updateMotionPath(mp, deltaTime)` advances `distance` by `speed·deltaTime` and applies the end behavior; `getMotionPathPosition(mp, pointOut, tangentOut)` samples via `@flighthq/path`'s `getPathPositionAtDistance`, and a heading-angle helper derives rotation from the tangent. Constant real speed (arc length) is the whole point — the raw parameter would speed up on straight segments and crawl on tight curves.
- **[2026-07-10] End behaviors: `clamp` / `loop` / `pingpong` (`MotionPathLoopMode`).** clamp stops at the ends; loop wraps modulo length; ping-pong reflects direction at each end. A `getMotionPathProgress` reports normalized `0..1`; `setMotionPathProgress`/`setMotionPathDistance` seek.
- **[2026-07-10] `MotionPath`/`MotionPathLoopMode` in `@flighthq/types`.** Header owns the shapes; functions carry the `MotionPath` name (`createMotionPath`, `updateMotionPath`, `getMotionPathPosition`, `getMotionPathHeading`, `getMotionPathProgress`, seek helpers).

## Open directions

1. **Cached arc-length table.** `@flighthq/path`'s distance queries re-flatten the path each call; a `MotionPath` could precompute the flattened polyline + cumulative-length table once at create for O(log n) per-frame sampling. Performance-only follow-on; the first build uses path's sampling directly.
2. **Orient-along-path convenience.** A helper that writes a `Matrix` (position + heading rotation) for the caller to apply directly to a display object.
3. **Eased / variable speed.** Drive `distance` through an easing curve or a speed-over-distance function for non-constant traversal.
