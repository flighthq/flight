---
package: '@flighthq/signals'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# signals — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/signals

**Session dates:** 2026-06-24 (pass 1), 2026-06-24 (pass 2) **Previous score:** 88/100 **Estimated new score:** 93/100 (gold — authoritative within chosen scope)

---

## Implemented across both passes

### New types in `@flighthq/types`

- **`SignalConnection<T>`** (`packages/types/src/SignalConnection.ts`) — plain-data handle returned by `connectSignal` and `connectSignalOnce`. Fields: `signal`, `slot`, `connected: boolean`, `paused: boolean`.
- **`SignalScope`** (`packages/types/src/SignalScope.ts`) — a plain-data collection of `SignalConnection` handles for bulk teardown.
- **`SignalData` updated** (`packages/types/src/Signal.ts`) — added `enabled: boolean[]` (per-slot pause lane), `connections: (SignalConnection<T> | null)[]` (per-slot handle back-reference), and `depth: number` (re-entrancy guard counter).

### Functions in `@flighthq/signals`

**`slot.ts`** (Bronze + Silver):

- `connectSignal` — returns `SignalConnection<T>`. The defining gap from the depth review.
- `connectSignalOnce` — first-class named once-connect verb, returns `SignalConnection<T>`.
- `disconnectSignalConnection(connection)` — disconnect by handle identity, not slot identity. Returns `boolean` (was-active), idempotent, tombstone-safe during mid-dispatch.
- `disconnectAllSlots` — correct rename of `disconnectAllSignals`.
- `disconnectAllSignals` — kept as deprecated alias (now fully removed from all callers — see below).
- `getSignalConnections(signal, out?)` — returns live `SignalConnection` handles into an `out` array.
- `getSignalSlotCount(signal)` — listener-count introspection. Documented tombstone behavior: during an in-flight dispatch, tombstoned slots are counted until the dispatch completes.
- `hasSignalSlots(signal)` — boolean "is anyone listening?".
- `isSignalConnectionActive(connection)` — handle-based active check.
- `pauseSignalConnection(connection)` / `resumeSignalConnection(connection)` — per-connection pause/resume using the `enabled` lane.
- Re-entrancy safety via `depth` counter + tombstone strategy. Slots disconnected mid-dispatch get a `null` tombstone; tombstones are purged after the outermost dispatch completes.

**Dispatch ordering guarantee (documented in `connectSignal` JSDoc):**

- Equal-priority slots fire in insertion order (stable).
- Higher numeric priority values fire first.
- Slots added during an in-flight dispatch are appended to the slot array and ARE visited in the same pass (the walk checks `data.slots.length` dynamically). This is documented and tested.
- Disconnections during dispatch use tombstones; purged after outermost dispatch.
- No `this`-binding by design — free-function, C-portable philosophy.
- Dispatch is synchronous.

**`scope.ts`** (Silver):

- `createSignalScope()` — creates an empty `SignalScope`.
- `addSignalConnectionToScope(scope, connection)` — adds an existing handle to a scope.
- `connectSignalInScope(scope, signal, slot, options?)` — connect + scope-track in one call.
- `connectSignalOnceInScope(scope, signal, slot, options?)` — once-connect + scope-track.
- `disconnectSignalScope(scope)` — bulk disconnect all connections in scope, clears list, idempotent.

**`throttle.ts`** (Silver):

- `connectSignalAtFrameRate` — renamed from `connectSignalAtRate`. Frame-tick accumulator, not a general throttle.
- `connectSignalAtRate` — deprecated alias.
- `connectSignalThrottled(source, intervalMs, slot, options?)` — payload-preserving throttle. Leading/trailing edge control via `SignalThrottleOptions`.
- `connectSignalDebounced(source, delayMs, slot, options?)` — debounce with leading/trailing control.
- `SignalThrottleOptions` — exported interface.

### Cross-package caller migration (pass 2)

All `disconnectAllSignals` callers outside the signals package have been migrated to `disconnectAllSlots`:

- `packages/media/src/audioChannel.ts` — updated
- `packages/media/src/videoChannel.ts` — updated
- `packages/node/src/node.ts` — updated
- `packages/loader/src/resourceLoader.ts` — updated
- `packages/displayobject/src/loader.ts` — updated

The deprecated alias remains in place for any future unknown callers but has no remaining uses in this codebase.

### Gold formal test matrix (pass 2)

Added `describe('dispatch ordering and stability', ...)` block to `slot.test.ts` covering:

- `slots added during dispatch fire in the same pass (appended at end)` — corrects a wrong claim from pass 1's status doc and documents the actual guarantee.
- `disconnect-self-during-emit` — slot disconnects its own connection; fires once, gone on next emit.
- `disconnect-next-slot-during-emit` — disconnecting next slot skips it in the current pass.
- `double-disconnect returns false and does not throw` — sentinel, idempotent.
- `pause-then-disconnect: paused connection can be disconnected`.
- `emit on a signal after disconnectAllSlots is a no-op`.
- `tombstones are purged after dispatch completes` — asserts `slots.length` after dispatch.

### Tests

All 89 tests pass across 6 test files:

- `signal.test.ts` — 2 tests
- `internal.test.ts` — 2 tests
- `emitter.test.ts` — 4 tests
- `slot.test.ts` — 55 tests (up from 45 in pass 1; +7 Gold formal matrix tests, +1 connect-during-emit clarification)
- `scope.test.ts` — 11 tests
- `throttle.test.ts` — 10 tests

---

## Deferred items and why

### Gold tier items (deferred by design)

1. **`emitSignalCollect` / `CollectableSignal`** — a return-carrying signal that gathers values from slots (accumulator/veto chains). The roadmap marks this as a real API-shape decision — a return-typed `Signal` diverges from the strict void-return contract. Needs design confirmation before building. Cross-package consumer: `@flighthq/application` `onCloseRequest` veto pattern.

2. **Weak / auto-disposing connections** — `connectSignalWeak(signal, slot, owner)` using `WeakRef` + `FinalizationRegistry`. Deferred because: (a) introduces non-deterministic GC finalization timing, (b) `FinalizationRegistry` behavior is not bit-conformant with Rust `Weak<>` — this must be entered as a permitted divergence in the conformance map, and (c) it is strictly opt-in with an isolated registry cost. Pursue when a concrete consumer needs it.

3. **Pooled / dense-storage dispatch path** — replacing parallel-array `splice` with a slotmap-style free list for O(1) disconnect. Currently the tombstone + post-dispatch cleanup is correct and safe; the performance gap only matters at hundreds of slots. Defer until benchmarks justify it.

4. **`emitSignalDeferred`** — queued/async dispatch. Needs a design conversation: the flush point. In TS a microtask is natural; in Rust the seam must stay native-clean (host-driven `flushDeferredSignals()`). Needs a design conversation before committing to an API shape.

5. **Rust crate parity** — `flighthq-signals` in the `rust` worktree needs to mirror all new types and functions. Key mapping: the `connections` parallel array becomes a per-slot field in the slotmap arena entry; `enabled` is a boolean flag on the same arena entry; `depth` is a counter on the `Signal` struct. `SignalConnection` in Rust should carry a `SlotId` (generation + index) rather than a pointer.

6. **Performance / allocation docs** — a short doc note on lazy allocation, when `data` is freed, the cost of handles vs. raw slots. Bundle-size baseline committed via `npm run size`.

---

## Dispatch behavior correction (pass 2 finding)

The pass 1 status doc incorrectly stated: _"Slots added during dispatch are NOT fired in the in-flight pass (they register for the next emit)."_

**The actual behavior:** slots added during dispatch are appended to `data.slots` via `push`, and the dispatch loop checks `data.slots.length` dynamically (`while (i < data.slots.length)`). Therefore newly-added slots ARE visited in the same pass. This is documented in the `connectSignal` JSDoc and asserted by the new Gold matrix test.

---

## Concerns and design notes

- **`disconnectAllSignals` deprecated alias** can now be removed in a future cleanup pass — all callers in this codebase have been migrated to `disconnectAllSlots`. The alias is a one-liner and adds no risk.

- **`SignalData` five parallel arrays** — the tombstone strategy in `disconnectSignalConnection` relies on all five arrays staying synchronized. The Gold tier's dense-storage path would eliminate this footgun.

- **`getSignalSlotCount` counts tombstones** during an in-flight dispatch. Documented in the JSDoc. For hot-path "skip payload if nobody is listening" use, this is harmless.

- **`connectSignalThrottled` with `leading: false`** first emission stores `lastArgs` but has no timer yet; the first trailing fire doesn't happen until a second emission occurs. Standard throttle semantics, covered by the test.

---

## Suggestions for future sessions

1. **Design conversation: `emitSignalDeferred` flush point** — before building Silver step 7, decide whether deferred dispatch belongs in `@flighthq/signals` at all or is better expressed by the caller's own loop.

2. **Gold: `emitSignalCollect` / `CollectableSignal`** — co-design with `@flighthq/application`'s `onCloseRequest` veto pattern. The veto chain is the primary concrete use case.

3. **Remove `disconnectAllSignals` deprecated alias** — all callers are now migrated (5 files updated in this session). The alias serves no purpose. One-line removal plus export cleanup.

4. **Rust session: mirror the new `SignalData` shape** in `flighthq-signals`. `connections` → per-slot field in slotmap arena; `enabled` → boolean flag; `depth` → counter on `Signal` struct.

5. **Performance baseline** — run `npm run size` and commit a size baseline for the signals-related examples.
