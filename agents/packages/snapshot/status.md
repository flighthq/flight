---
package: '@flighthq/snapshot'
updated: 2026-08-08
by: principal
---

# snapshot — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Re-checked against `packages/snapshot/src/` on 2026-08-08. The package is small and its one live
design question was ruled after the last entry, so this list is short by fact rather than by neglect.

- **The contract is acyclic, and only `captureSnapshot` actually enforces anything.**
  `equalsSnapshot`, `interpolateSnapshots`, and `restoreSnapshot` walk without a visited set and
  recurse forever on a cyclic source; that is the ruled design (no per-frame visited-set tax), stated
  at `captureSnapshot.ts:16-17` and `enableSnapshotGuards.ts:22-24`. The only thing standing between
  a caller and a bare `RangeError` is the opt-in guard, so an app that never imports
  `enableSnapshotGuards` gets a stack overflow with no Flight frame in it.
- **Reject-vs-warn is still an open policy fork.** `enableSnapshotGuards` warns about non-plain
  values (`Map`, `Set`, `Date`, `RegExp`, typed arrays, `ArrayBuffer`) and about cycles; whether
  `captureSnapshot` should instead throw is a behavior decision the user has not made.
- **The delta pair is unbuilt and unreserved.** `diffSnapshots` / `applySnapshotDelta` are named in
  the charter's North star, but there is no `SnapshotDelta` type in `packages/types/src/` and no
  delta module in `contract.ts` (five entries: capture, guards, equals, interpolate, restore). The
  blocker is a design fork — path-list versus structural mirror — not effort.
- **No history/undo stack and no structural sharing.** Both are charter Open directions; neither has
  any source. Structural sharing in particular is a capture-strategy redesign, since `captureSnapshot`
  currently `structuredClone`s the whole tree (`captureSnapshot.ts:22-25`).

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The one carried claim that changed:
  the cycle question the 2026-07-30 entry left as "a policy call, recorded in assessment rather than
  guessed" **was ruled on 2026-07-31** — the contract narrows to acyclic, no visited sets in the
  per-frame walks, and `captureSnapshot` surviving a cycle is incidental robustness callers may not
  rely on. Restated above as settled design, not as a pending decision.
- **2026-07-30** — Guards, schema compilation, and the cycle sweep. `captureSnapshot`'s freeze walk
  uses `Object.isFrozen` as its visited mark (`captureSnapshot.ts:45-46`), so it terminates on cycles
  and stays linear on shared subtrees with no side table. `enableSnapshotGuards` installs through the
  `setSnapshotCaptureGuard` seam (`captureSnapshot.ts:32`) so the message text and the
  `@flighthq/log` dependency live only in the separately-importable module. `interpolateSnapshots`
  compiles its schema to a `Set` once per call (`interpolateSnapshots.ts:41`) and skips building the
  dotted path entirely when no schema is present; `undefined` (interpolate everything) stays distinct
  from an empty schema (interpolate nothing).
