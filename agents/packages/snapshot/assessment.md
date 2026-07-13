---
package: '@flighthq/snapshot'
updated: 2026-07-13
basedOn: ./review.md
---

# snapshot — Assessment

See [charter](./charter.md) for blessed direction; evidence in [review](./review.md).

## Recommended

Sweep-safe, within-package, no design fork:

1. **`enableSnapshotGuards`** — warn at `captureSnapshot` when the source tree contains non-plain values (`Map`, `Set`, `Date`, typed arrays, functions) whose capture silently breaks the immutability/equality contract (an `Object.freeze`d `Map` is still mutable; two different Maps compare equal in `equalsSnapshot`). Warn-and-proceed via `@flighthq/log`; whether to *reject* instead is the parked policy fork.
2. **Internal schema compilation** — inside `interpolateSnapshots`, build a `Set` from the schema once per call and stop allocating the dotted path string for leaves when no schema is present. Public `SnapshotSchema` type unchanged; removes the per-leaf `includes` scan and most hot-loop garbage.
3. **Test deepening** — round-trip capture→mutate→restore with nested array shrink *and* grow; interpolate into an `out` that is the same live object later restored; pin the documented NaN/±0 equality semantics; interpolate with a schema listing an array-indexed path (`'players.0.health'`).

## Backlog

Parked, with why:

- **`diffSnapshots` / `applySnapshotDelta`** — named in the North star and the types decision reserves `SnapshotDelta`, but the delta *format* (path-list vs structural mirror) is an undecided design fork; surface to charter Open directions before building.
- **Reject-vs-warn policy for non-plain data** — depends on the guard-layer ruling above; changing `captureSnapshot` to throw is a behavior decision.
- **History / undo stack** — charter Open direction 2; possibly its own small neighbor package (bedrock test applies).
- **Structural sharing** — charter Open direction 3; a capture-strategy redesign, not a sweep.
- **Public `compileSnapshotSchema`** — only worth adding if the internal compilation (Recommended 2) proves insufficient for per-frame reuse; API-surface decision.

## Approved

None.
