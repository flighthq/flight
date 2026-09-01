# signals — Tracked connections, scopes, and snapshot emission

## Motivation

openfl-flight (and any consumer with complex listener lifecycle) needs three capabilities the signal system does not provide: mutation-safe dispatch, connection handles for lifecycle management, and bulk teardown. These are general-purpose signal lifecycle primitives, not event-routing concerns. They belong in `@flighthq/signals` as additional tree-shakable exports layered over the existing base path.

The charter (Open direction #2) and status already identify the dispatch-during-dispatch hazard and the unimplemented `SignalConnection`/`SignalScope` types as open items.

## Constraint: the base path is unchanged

`createSignal`, `connectSignal`, `emitSignal`, `disconnectSignal`, `cancelSignal`, `clearSignal`, `hasSignalSlots`, `isSlotConnected` -- all unchanged in signature, behavior, and cost. A consumer who never imports the new functions pays nothing.

## Deliverables

### 1. Dispatch-during-dispatch safety (tombstone discipline)

Add a `depth` counter to `SignalData`. When `depth > 0` (inside a dispatch), `disconnectSignal` and once-slot removal tombstone the entry (null the slot, mark it dead) instead of splicing. The dispatch loop skips tombstones. On outermost exit (`depth` returns to 0), a compaction pass purges tombstones.

This fixes:
- A slot that disconnects a later slot no longer skips the shifted-into-position entry.
- A re-entrant emit gets its own cursor over the same array without index interference from the outer loop's splice.
- `once` slots tombstone after firing instead of splicing mid-walk.

Changes to `SignalData` (in `@flighthq/types`): add `depth: number` (init 0). The `cancelled` field stays as-is. The parallel arrays gain a tombstone convention (null slot = dead entry).

The base `emitSignal` path gains the depth increment/decrement and tombstone skip. This is a behavioral fix for existing signals, not an opt-in feature -- the current splice-during-dispatch behavior is a bug, not a feature.

Performance: tombstone check is a null guard per slot (branch-predicted, negligible). Compaction is amortized to outermost exit only. No allocation during dispatch. Splice cost is replaced by O(1) tombstone write during dispatch, which is strictly cheaper.

### 2. Snapshot emission (`emitSignalSafe`)

`emitSignalSafe(signal, ...args)` -- copies the slots array before iterating. Listeners added during dispatch do not fire in the current emission. Listeners removed during dispatch are still called if already copied.

This is the opt-in "event dispatch" semantic: the set of listeners is frozen at emit time. More expensive than the tombstone path (one array copy per emit), but deterministic in a way the tombstone path is not (tombstone still visits slots added during dispatch if they land after the cursor).

Consumers choose: `emitSignal` for fast dispatch with tombstone safety (internal signals, frame ticks), `emitSignalSafe` for event-dispatch semantics where the listener set must be frozen (user-facing event systems).

### 3. Tracked connections (`connectSignalTracked`)

`connectSignalTracked(signal, slot, options?) -> SignalConnection` -- same as `connectSignal` but returns a `SignalConnection` handle. The handle provides:
- `disconnectSignalConnection(connection)` -- disconnect by handle (idempotent, sets `connected = false`).
- `pauseSignalConnection(connection)` / `resumeSignalConnection(connection)` -- skipped during dispatch but retains priority position.

Implementation: `SignalConnection` is an external record `{ signal, slot, connected, paused }`. Disconnect delegates to `disconnectSignal(connection.signal, connection.slot)`. Pause needs a way to skip a slot during dispatch without removing it -- the tombstone discipline provides the mechanism (a paused slot is "alive but skipped," like a tombstone that can be un-tombstoned).

The `paused` state requires either:
- (a) An `enabled` parallel array on `SignalData` (checked during dispatch alongside the tombstone null-check), or
- (b) A wrapper slot that checks `connection.paused` before calling through (no `SignalData` change, but adds one indirection per paused connection).

Option (b) is simpler and keeps `SignalData` changes minimal. The wrapper is only created for tracked connections; untracked connections have no wrapper.

The existing `SignalConnection` type in `@flighthq/types` matches this shape. Verify it still fits after the tombstone changes; adjust if needed.

### 4. Signal scopes (`createSignalScope`, `disconnectSignalScope`)

`createSignalScope() -> SignalScope` -- creates a scope (a plain `{ connections: [] }` record).

Tracked connections can be added to a scope: `connectSignalTracked(signal, slot, { scope, ...options })` pushes the returned connection into `scope.connections`.

`disconnectSignalScope(scope)` -- disconnects all connections in the scope and empties the array. Idempotent.

The existing `SignalScope` type in `@flighthq/types` matches this shape.

## What this does NOT include

- Three-phase event routing (capture/target/bubble) -- that is an openfl-flight concern or a future `@flighthq/events` package, not signals.
- Event objects, propagation control, `stopImmediatePropagation` -- same.
- Changes to `emitSignal` signature or return type -- the void slot contract holds (charter Decision #2).
- Weak connections -- out per charter Decision #3.
- Deferred/async dispatch -- out per charter Decision #1.

## Verification

- All existing signal tests pass unchanged (the tombstone discipline is a behavioral fix, not a breaking change).
- New tests for: disconnect-during-dispatch (no skip), add-during-dispatch (not fired in current emission for `emitSignalSafe`), nested re-entrant emit (independent cursors), once-slot in nested emit, connection disconnect/pause/resume, scope bulk disconnect, scope with mixed tracked/untracked.
- `npm run fix`, `npm run check signals`, `npm run test signals`, `npm run exports:check`, `npm run api:check`, `npm run size`.

## Charter updates needed

- Resolve Open direction #2 (dispatch-during-dispatch safety) with a Decision recording the tombstone approach.
- Resolve the `SignalConnection`/`SignalScope` backlog item ("if desired, they are a separate feature addition") -- they are now desired.
- Open direction #3 (storage strategy) may partially resolve if the tombstone discipline settles the parallel-array question.
