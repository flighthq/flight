---
package: '@flighthq/snapshot'
updated: 2026-07-30
---

## 2026-07-30 — guards, schema compilation, and a cycle that crashed four ways (builder)

All three cell items landed. The sweep also found that a cyclic source — which `structuredClone` supports and the package doc admits as "structured-cloneable data" — crashes with `RangeError: Maximum call stack size exceeded` in every deep walk the package has. Probed all four:

- `captureSnapshot` — the freeze walk recursed forever.
- `equalsSnapshot` — same.
- `interpolateSnapshots` — same. (My first probe missed this by passing 3 args to a 4-arg function, so it returned early at the `out` guard and looked clean. Re-probed correctly; a probe can manufacture a false negative as easily as a false positive.)
- `restoreSnapshot` — the one that hides. The first restore into a fresh target clones and succeeds; only the *second*, once the live target itself holds the cycle, recurses forever. That is the ordinary per-frame usage.

`captureSnapshot` is fixed and cost nothing: `Object.isFrozen` doubles as the visited mark, since `structuredClone` always yields a fresh unfrozen tree, so freezing before descending makes the walk terminate on cycles and linear on shared subtrees with no side table. Cycles and diamonds are both preserved and deep-frozen.

The other three are **not** fixed, deliberately. Supporting cycles there means a visited set in `equals` and `interpolate`, which run per frame in netcode — a real cost on the common acyclic path, and the "an assembly never inflates the cost of a primitive" rule argues against paying it for a rare shape. Rejecting instead means narrowing the documented contract. That is a policy call, so it is recorded in [assessment](./assessment.md) rather than guessed, and `enableSnapshotGuards` now warns at capture time that the operations downstream cannot walk what was just captured — turning a `RangeError` with no Flight frame in the stack into a message naming the three functions.

On the items: the guard installs through a `setSnapshotCaptureGuard` seam so the messages and the `@flighthq/log` dependency live only in the separately-importable module. Schema compilation replaced a per-leaf `includes` scan with a `Set` built once per call, and stopped building the dotted path entirely when no schema is present — it was the walk's main per-leaf allocation and is never consulted in that case. `undefined` (no schema, interpolate everything) stays distinct from an empty schema (interpolate nothing); a mutation collapsing them fails a test written for exactly that.

35 → 55 tests. Three mutations, each confirmed applied and disjoint. One test was written and removed before landing: it asserted `logOnce` warns only once, which is `@flighthq/log`'s guarantee rather than this package's, and passed or failed purely on test ordering within the file.

# snapshot — Status Log
