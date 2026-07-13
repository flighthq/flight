---
package: '@flighthq/snapshot'
status: partial
score: 63
updated: 2026-07-13
ingested:
  - status.md
  - source
---

# snapshot — Review

## Verdict

partial — 63/100. The four built operations (capture, restore, interpolate, equals) are careful, well-documented, and match the charter's immutability contract exactly. It grades partial because the charter's own North star names delta compression (`diffSnapshots`/`applySnapshotDelta`) as part of "the complete recoverable-state toolkit" and it does not exist, non-plain data (Map/Set/Date) slips through capture into a snapshot that is *not actually immutable*, and the interpolation hot path allocates per leaf.

## Present capabilities

- **Types** (`packages/types/src/Snapshot.ts`): recursive `DeepReadonly<T>`, `Snapshot<T> = DeepReadonly<T>`, and `SnapshotSchema` (dotted paths, array indices by number) — per the 2026-07-10 decisions.
- **Capture** — `captureSnapshot` (`captureSnapshot.ts`): `structuredClone` then recursive `Object.freeze` over objects/arrays; non-cloneable input throws via `structuredClone` (documented as programmer error, consistent with the throw-for-API-misuse rule).
- **Restore** — `restoreSnapshot` (`restoreSnapshot.ts`): deep in-place assignment preserving the target's (and compatible nested containers') identity, resizing arrays to the snapshot's length, cloning fresh subtrees so live state never aliases the frozen snapshot; top-level primitive is a documented no-op.
- **Interpolation** — `interpolateSnapshots` (`interpolateSnapshots.ts`): `t` clamped to `[0,1]`; numeric-in-both leaves `lerp`; everything else snaps to `b` (cloned when an object); arrays resized to `b` and walked positionally; container reuse via `ensureSnapshotContainer` so `out` can be the caller's live render state; schema restricts which numeric paths blend.
- **Equality** — `equalsSnapshot` (`equalsSnapshot.ts`): deep structural, `===` leaves (NaN ≠ NaN, ±0 equal — documented), same-own-keys and array-length checks.
- **Hygiene** — deps `types` + `math` only; `sideEffects: false`; 25 tests across the 4 operation files.

## Gaps

- **Delta compression missing** — `diffSnapshots`/`applySnapshotDelta` are in the North star ("delta compression for bandwidth/history") and named `SnapshotDelta` is even reserved in the charter's types decision, but no delta type or function exists anywhere (nothing in `packages/types/src/Snapshot.ts` either).
- **Non-plain data silently corrupts the contract** — `structuredClone` happily clones `Map`/`Set`/`Date`/typed arrays, and `freezeSnapshotDeep` "freezes" them, but `Object.freeze` does not prevent `map.set(...)`: the returned `Snapshot` is mutable, violating the package's core promise. Downstream, `equalsSnapshot` sees a `Map` as an object with zero own keys (two different Maps compare *equal*), and interpolate/restore walk them as empty objects. The charter scopes input to JSON-shaped plain data, so this is caller misuse — but it is exactly the silent-misuse case the diagnostics inversion rule says needs a guard, and none exists.
- **Interpolation hot-path allocation** — `interpolateSnapshotsInto` builds a dotted path string per key per call and `isSnapshotPathInterpolated` does an `Array.includes` linear scan per numeric leaf. For the netcode/replay per-frame use the package is chartered for, this is allocation and O(paths) work in the hottest loop; a precompiled schema lookup would remove both.
- **History/undo stack** and **structural sharing** — charter Open directions 2 and 3, unbuilt (both explicitly parked as directions, not P1 scope).
- **Test depth** — no aliasing test interpolating into an `out` that is also the live object later restored; no test capturing then restoring deeply nested array shrink/grow round-trips combined; NaN/±0 semantics documented in comments but only partially pinned by tests.

## Charter contradictions

None in what is built — immutability, restore-in-place identity preservation, schema-guarded interpolation, and the dependency envelope all match the 2026-07-10 decisions. The absence of delta ops is a North-star gap, not a contradiction. One nit: the charter decision text says "`Snapshot`/`SnapshotSchema`/`SnapshotDelta` in `@flighthq/types`" — `SnapshotDelta` was never added, so the decision line overstates the header layer's current contents.

## Contract & docs fit

- **Contract**: good — full `Snapshot` names, sentinels/no-ops for expected degenerate input, throw only via `structuredClone` on programmer error, single root barrel. Uses JSDoc-style `/** */` comments where sibling game packages use `//` — cosmetic inconsistency only.
- **Docs**: the Package Map line matches the built four-function surface accurately (it does not promise delta ops, so no staleness there).

## Candidate open directions

- **Delta format** — path-list vs structural-mirror vs binary-friendly; the charter reserves the name but not the shape. Needs a ruling before `diffSnapshots` is buildable.
- **Non-plain-data policy** — guard-only (warn and proceed), or reject at capture (throw, extending the existing programmer-error stance). The guard module needs to know which.
- **Compiled schema** — whether `SnapshotSchema` stays a plain `readonly string[]` (header-friendly) with an internal per-call `Set`, or grows a public `compileSnapshotSchema` step for reuse across frames.
