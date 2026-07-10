---
package: '@flighthq/snapshot'
crate: flighthq-snapshot
draft: false
lastDirection: 2026-07-10
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# snapshot — Charter

## What it is

`@flighthq/snapshot` is the **immutable recoverable-state cell** — it captures a plain state object into a frozen `Snapshot` value, restores a snapshot back into live state, and interpolates or diffs between snapshots. It's the primitive under save/load, undo/redo, netcode interpolation, and replay: the thing that answers "what was the app at this instant," as an immutable value you can store, send, rewind, or tween toward.

It is deliberately **immutable**. A snapshot is a frozen point-in-time capture — that's the whole point of the name and the contract: undo stacks need each entry fixed, netcode treats received frames as facts, replay can't have its frames mutate, and interpolation tweens between two *fixed* endpoints. Mutability would corrupt every one of those.

## North star

The complete recoverable-state toolkit over plain data: `captureSnapshot` (deep, frozen), `restoreSnapshot` (write a snapshot back into live state), `interpolateSnapshots` (schema-aware numeric lerp between two snapshots — the netcode/replay "tween over instances"), `diffSnapshots`/`applySnapshotDelta` (delta compression for bandwidth/history), and structural equality — all immutable-value operations. Scope is the caller's: a snapshot can capture a small slice or the full context.

## Boundaries

- **Depends on `@flighthq/types` + `@flighthq/math`** (`lerp` for interpolation). No display, no renderer, no scene graph.
- **Operates on the app's plain state, does not own it.** Input is a plain serializable object (numbers, strings, booleans, arrays, nested objects — JSON-shaped); the live mutable state lives in the app (or a future `@flighthq/session` container). `snapshot` only produces frozen captures and operations over them — it is not a state store.
- **Values, not persistence or serialization format.** It yields immutable in-memory `Snapshot` values; writing them to disk is `@flighthq/storage`, and a wire/JSON format for them (if needed) is a separate concern. Class instances / entity-runtime objects are out of scope — snapshots are of plain data.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-10] Snapshots are immutable frozen values.** `captureSnapshot(source): Snapshot` deep-clones and deep-freezes; the returned value never changes. This is the contract that makes undo/netcode/replay/interpolation correct (no aliasing, no accidental mutation of a stored state). `restoreSnapshot(snapshot, target): void` deep-assigns a snapshot's fields back into a live mutable target.
- **[2026-07-10] Interpolation is the "tween over instances".** `interpolateSnapshots(a, b, t, out, schema?): void` lerps numeric fields between two snapshots into a mutable `out` (for smooth netcode/replay rendering). Default: auto-detect and `lerp` numeric leaf fields, snap non-numerics to `b`; an optional `schema` restricts which paths interpolate (so a numeric id isn't lerped). This is where a snapshot leans on `@flighthq/tween`/`spring` conceptually, but the core is a direct `lerp` to stay dependency-light.
- **[2026-07-10] Plain-data only; `Snapshot`/`SnapshotSchema`/`SnapshotDelta` in `@flighthq/types`.** Snapshots are deep-cloneable plain data. `Snapshot<T>` is a `DeepReadonly<T>` brand over the captured shape; the header owns the shapes. Functions carry the `Snapshot` name.

## Open directions

1. **Delta compression.** `diffSnapshots(a, b): SnapshotDelta` + `applySnapshotDelta` for bandwidth-efficient netcode and compact undo history (store deltas, not full snapshots).
2. **History / undo stack.** A `@flighthq/snapshot`-based bounded undo/redo stack (`pushSnapshot`, `undo`, `redo`) — a thin composition, possibly its own small neighbor.
3. **Structural sharing.** Persistent-data-structure captures so an unchanged sub-tree is shared between snapshots (cheap capture of large mostly-static state), instead of a full deep clone each time.
4. **`@flighthq/session` integration.** When the live-state container lands, `captureSnapshot(session)` / `restoreSnapshot(snap, session)` become its natural save/load path.
