---
package: '@flighthq/snapshot'
updated: 2026-07-13
basedOn: ./review.md
---

# snapshot — Assessment

See [charter](./charter.md) for blessed direction; evidence in [review](./review.md).

## Recommended

1. ~~**Decide whether `equalsSnapshot`, `interpolateSnapshots`, and `restoreSnapshot` support cycles or reject them.**~~ **Ruled 2026-07-31: the contract narrows to acyclic.** No visited sets in the per-frame walks — that would tax the common netcode path for a shape almost no game state has, which is the store rule (an assembly never inflates the cost of a primitive) applied to a hot loop. A cycle is programmer error, `enableSnapshotGuards` reports it at capture time where it is diagnosable, and the contract text in `captureSnapshot` and the guard module now says "acyclic" explicitly rather than letting "structured-cloneable" imply cycle support. `captureSnapshot` still happens to survive a cycle (`Object.isFrozen` doubles as its visited mark, at no cost) but that is incidental robustness, not a guarantee callers may rely on.

## Landed

- ~~**`enableSnapshotGuards`.**~~ Landed. Warns once via `@flighthq/log` about non-plain values (`Map`, `Set`, `Date`, `RegExp`, typed arrays, `ArrayBuffer`) that clone but break both the immutability and the equality contract, and about cycles. Installed through a `setSnapshotCaptureGuard` seam so the messages and the `@flighthq/log` dependency live only in the separately-importable guard module. Whether to *reject* rather than warn remains the parked policy fork, now joined by the cycle question above.
- ~~**Internal schema compilation.**~~ Landed. The schema is compiled to a `Set` once per `interpolateSnapshots` call instead of a per-leaf `includes` scan, and the dotted path is no longer built at all when no schema is present — it was the walk's main per-leaf allocation and is never consulted in that case. `undefined` (no schema) stays distinct from an empty schema (interpolate nothing); collapsing them inverts the caller's intent, and there is a test pinning that.
- ~~**Test deepening.**~~ Landed: capture→mutate→restore round trip, nested array shrink *and* grow, interpolate into an `out` that is subsequently restored into, the documented `NaN`/`±0` equality semantics, and a schema listing an array-indexed path. 35 → 55 tests.

## Backlog

Parked, with why:

- **`diffSnapshots` / `applySnapshotDelta`** — named in the North star and the types decision reserves `SnapshotDelta`, but the delta *format* (path-list vs structural mirror) is an undecided design fork; surface to charter Open directions before building.
- **Reject-vs-warn policy for non-plain data** — depends on the guard-layer ruling above; changing `captureSnapshot` to throw is a behavior decision.
- **History / undo stack** — charter Open direction 2; possibly its own small neighbor package (bedrock test applies).
- **Structural sharing** — charter Open direction 3; a capture-strategy redesign, not a sweep.
- **Public `compileSnapshotSchema`** — only worth adding if the internal compilation (Recommended 2) proves insufficient for per-frame reuse; API-surface decision.

## Approved

None.
