---
package: '@flighthq/motionpath'
updated: 2026-09-08
basedOn: ./review.md
---

# motionpath — Assessment

Sorted from the 2026-09-02 review (`review.md`). All 8 review gaps verified open against source 2026-09-08: no cached arc-length table, no completion query, no orient matrix, no eased speed, no offset sampling, scratch vector mid-file, no direction mutator, `mp` parameter naming.

## Directed

_None — no user-approved program work._

## Recommended

Strictly sweep-safe: within `@flighthq/motionpath`, no unresolved design decision.

- **Move `scratchTangent` to the bottom of `motionPath.ts`.** Currently at line 38 between two exported functions; convention says loose module variables belong after all exports.
- **Rename `mp` parameter to `motionPath`** across all 6 function signatures. Sibling packages spell out the entity name; `mp` is an abbreviation the naming convention disallows in exported function signatures.
- **Add `isMotionPathComplete(motionPath)` or equivalent completion query.** Callers currently compare `distance` vs path length manually. A boolean predicate is the standard accessor pattern (`is*`).
- **Add `setMotionPathDirection(motionPath, direction)` mutator.** Currently requires direct field assignment; the `set*` convention earns a mutator when the field has a discrete set of valid values (forward/reverse).

## Depth gaps

1. **Cached arc-length table.** Per-frame `getPathPositionAtDistance`/`getPathTangentAtDistance` re-walk the path from the start. A pre-computed polyline or arc-length LUT would make sampling O(log n) instead of O(n). Charter Open direction 1 defers this.
2. **Orient-along-path matrix helper.** Composing position + heading into a transform matrix is the standard motion-path consumer pattern. Charter Open direction 2.
3. **Eased / variable speed.** Speed curves or easing over the normalized progress. Charter Open direction 3.
4. **Offset / look-ahead sampling.** Sampling at a lateral offset or a look-ahead distance from the current position — common for AI steering and camera rail.

## Backlog

_None._

## Approved

_None._
