---
package: '@flighthq/snapshot'
status: partial
score: 72
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source
  - tests
  - types
---

# snapshot — Review

## Verdict

partial -- 72/100. The four core operations (capture, restore, interpolate, equals) plus the guard layer are well-implemented, thoroughly tested (55 tests across 5 files), and match the charter's immutability contract. The acyclic-only ruling is settled and documented in source. Internal schema compilation to a `Set` per call removed the old per-leaf `Array.includes` scan, and the dotted path is no longer built at all in the schema-free case. It grades partial because the charter's North star names delta compression (`diffSnapshots`/`applySnapshotDelta`) as part of "the complete recoverable-state toolkit" and neither the type nor the functions exist, and the two charter open directions (history/undo, structural sharing) are entirely unbuilt.

## Present capabilities

- **Types** (`packages/types/src/Snapshot.ts`): `DeepReadonly<T>` (recursive readonly), `Snapshot<T> = DeepReadonly<T>`, and `SnapshotSchema` (`readonly string[]`, dotted paths with numeric array indices). No `SnapshotDelta` type exists despite the charter decision text naming it.
- **Capture** -- `captureSnapshot(source): Snapshot<T>` (`captureSnapshot.ts`): `structuredClone` then recursive `Object.freeze` via `freezeSnapshotDeep`. Uses `Object.isFrozen` as a zero-cost visited mark, making the freeze walk terminate on cycles and stay linear on shared (diamond) subtrees without a side table. Guard seam via `setSnapshotCaptureGuard` (contract-only export) so the `@flighthq/log` dependency stays in the separately-importable guard module.
- **Restore** -- `restoreSnapshot(snapshot, target): void` (`restoreSnapshot.ts`): deep in-place assignment preserving the target's object identity and compatible nested container identity. Arrays are length-matched (truncated or extended). Incompatible type changes (object-to-array, array-to-object) allocate a fresh `structuredClone`. Object keys present in `target` but absent from the snapshot are preserved -- restore is additive/overwriting, not a full replacement (pinned by test). Top-level primitive is a documented no-op.
- **Interpolation** -- `interpolateSnapshots(a, b, t, out, schema?): void` (`interpolateSnapshots.ts`): `t` clamped to `[0, 1]`; numeric-in-both leaves are `lerp`-ed; everything else snaps to `b` (cloned when an object so `out` stays mutable and unaliased). Arrays resized to `b`'s length and walked positionally. Schema compiled to a `Set` once per call; when no schema is present (`undefined`), the dotted path is never constructed and numeric leaves interpolate unconditionally. An empty schema (`[]`) means "interpolate nothing" -- distinct from `undefined`, pinned by test. Container reuse via `ensureSnapshotContainer` so `out` can be the caller's live render-state object.
- **Equality** -- `equalsSnapshot(a, b): boolean` (`equalsSnapshot.ts`): deep structural comparison. Leaves use `===`, so `NaN !== NaN` and `-0 === +0` -- both documented and tested. Same-own-keys and array-length checks.
- **Guards** -- `enableSnapshotGuards()` / `disableSnapshotGuards()` (`enableSnapshotGuards.ts`): opt-in capture-time diagnostics via `@flighthq/log`. Warns once about non-plain values (`Map`, `Set`, `Date`, `RegExp`, typed arrays, `ArrayBuffer`) and about cycles. The guard walks with its own `Set<object>` visited tracker so it terminates on the cyclic source it reports. Not importing the module costs production nothing.
- **Export lanes**: public lane (`index.ts`) exports 6 functions (`captureSnapshot`, `restoreSnapshot`, `interpolateSnapshots`, `equalsSnapshot`, `enableSnapshotGuards`, `disableSnapshotGuards`). Contract lane (`contract.ts`) adds `setSnapshotCaptureGuard` as a seventh, SDK-internal seam.
- **Hygiene**: deps `types` + `math` + `log`; all intra-SDK imports resolve to `*/contract`; `sideEffects: false`; no module-level side effects; no `@flighthq/sdk` import.

## Gaps

- **Delta compression missing.** `diffSnapshots`/`applySnapshotDelta` are in the charter's North star. The charter decision text names `SnapshotDelta` as belonging in `@flighthq/types`, but the type does not exist in `packages/types/src/Snapshot.ts` and no delta function exists in the package. Blocked on a design fork (path-list vs structural mirror), recorded in `status.md` and parked in the assessment.
- **Non-plain data passes through capture.** `structuredClone` clones `Map`/`Set`/`Date`/typed arrays; `Object.freeze` on a `Map` leaves `set`/`delete` functional; `equalsSnapshot` sees a `Map` as an object with zero own keys (two different Maps compare equal). The guard module warns, but `captureSnapshot` itself does not reject. Whether to throw (extending the programmer-error stance) or continue warning is an open policy fork.
- **Schema-path interpolation allocates a string per key.** When a schema is present, `snapshotPath` concatenates the dotted prefix on every node of the walk. The no-schema path is clean (no path string built), but the schema path still creates intermediate strings per recursive step. For per-frame netcode use with a schema, this is allocation in a hot loop. A precompiled schema (trie or depth-keyed `Set`) would eliminate it.
- **`restoreSnapshot` preserves extra target keys.** Restoration writes every snapshot key into the target but does not remove keys the target carries that the snapshot does not. This is pinned by test and intentional, but it means a round-trip of capture-then-restore is not identity when the target has been extended between capture and restore -- the extra keys survive. For undo/redo the semantics are safe only if the target shape never grows between snapshots.
- **History/undo stack** and **structural sharing** -- charter open directions 2 and 3, unbuilt. Neither has source, types, or tests.

## Charter contradictions

None in what is built. Immutability, acyclic contract, restore-in-place identity preservation, schema-guarded interpolation, and the dependency envelope all match the 2026-07-10 decisions and the 2026-07-31 acyclic ruling. The only discrepancy between the charter decision text and the type layer is that the decision says "`Snapshot`/`SnapshotSchema`/`SnapshotDelta` in `@flighthq/types`" and `SnapshotDelta` was never created -- an overstated promise, not a contradiction in the built code.

## Contract & docs fit

- **Export lanes**: two lanes, correct split. Public lane excludes the `setSnapshotCaptureGuard` seam; contract lane includes it. No unauthorized subpaths.
- **Naming**: all exported functions carry the full `Snapshot` name. `enableSnapshotGuards`/`disableSnapshotGuards` match the SDK's `enable*Guards` pattern. `equalsSnapshot` (not `snapshotsEqual`) is the exported name, matching the `{verb}{Type}` pattern despite the `package.json` description mentioning `snapshotsEqual` -- the description is stale on this point.
- **Diagnostics inversion**: clean. Core modules expose the `setSnapshotCaptureGuard` seam; messages and `@flighthq/log` dependency live only in the guard module. Every silent behavior (non-plain data, cycles) has a corresponding guard warning.
- **Readonly**: `captureSnapshot` takes `Readonly<T>`, interpolation schema is `Readonly<SnapshotSchema>`, returned snapshots are `Snapshot<T>` = `DeepReadonly<T>`. Mutable outputs are named `out` or `target`.
- **Import discipline**: all intra-SDK imports use the `/contract` subpath. Type imports are on separate `import type` lines.
- **Test coverage**: 55 tests across 5 test files (captureSnapshot: 12, enableSnapshotGuards: 5, equalsSnapshot: 11, interpolateSnapshots: 14, restoreSnapshot: 13). Tests cover round-trips, identity preservation, array resizing (shrink and grow), type-change replacement, NaN/+-0 semantics, cyclic/diamond/shared structures, schema-indexed array paths, empty-vs-undefined schema distinction, and the interpolate-then-restore sequence.

## Candidate open directions

- **Delta format ruling.** Path-list vs structural-mirror vs binary-friendly -- the charter reserves `SnapshotDelta` but the shape is undecided. Needs a ruling before `diffSnapshots`/`applySnapshotDelta` can be built, and the type needs to land in `@flighthq/types`.
- **Non-plain-data rejection.** Guard-only (warn and proceed, current behavior) or reject at capture (throw, extending the programmer-error stance for class instances). The guard module has the detection; the policy decision is whether `captureSnapshot` itself enforces the plain-data contract.
- **Precompiled schema.** Whether to expose a public `compileSnapshotSchema` that returns an opaque lookup structure for reuse across frames, eliminating the per-call `new Set(schema)` and per-key `snapshotPath` string concatenation in the schema-present path. The internal `Set` compilation already removed the per-leaf `includes` scan; the remaining cost is string allocation during the walk.
- **Restore key cleanup.** Whether `restoreSnapshot` should optionally (or always) delete keys from the target that are absent in the snapshot, making restore a full shape replacement rather than an additive merge. The current behavior is safe for fixed-shape state but surprising for state that gains or loses keys.
- **History/undo stack.** Charter open direction 2 -- a thin composition over `captureSnapshot`/`restoreSnapshot` (`pushSnapshot`, `undo`, `redo`, bounded). May belong in its own small neighbor package (bedrock test applies).
- **Structural sharing.** Charter open direction 3 -- persistent-data-structure captures where unchanged subtrees share identity between snapshots. A capture-strategy redesign, since `captureSnapshot` currently `structuredClone`s the entire tree.
