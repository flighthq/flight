---
package: '@flighthq/snapshot'
updated: 2026-07-13
basedOn: ./review.md
---

# snapshot — Assessment

See [charter](./charter.md) for blessed direction; evidence in [review](./review.md).

## Recommended

1. **Decide whether `equalsSnapshot`, `interpolateSnapshots`, and `restoreSnapshot` support cycles or reject them.** _Needs a policy call, not just code._ `structuredClone` supports cycles and the package doc admits "structured-cloneable data", so a cyclic source is inside the stated contract — but all three of those walks recurse without tracking what they have visited and overflow the stack. `restoreSnapshot` is the one that hides: the first restore into a fresh target clones and succeeds, and only the second — once the live target itself holds the cycle — recurses forever, which is the ordinary per-frame usage. `captureSnapshot` was fixed in this sweep (`Object.isFrozen` doubles as the visited mark, so it costs nothing), and `enableSnapshotGuards` now warns at capture time that the other three cannot walk what was just captured. The remaining question is the policy: **support** cycles in all three (a visited set in `equals`/`interpolate`, which run per frame in netcode — a real cost on the common acyclic path, and the "assembly never inflates the primitive" rule argues against paying it for a rare shape), or **reject** them at capture and narrow the documented contract to acyclic plain data. The guard makes today's failure diagnosable either way, so this is not urgent — but it should be answered rather than left as an undocumented crash. Raised 2026-07-30.

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
