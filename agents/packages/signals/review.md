---
package: '@flighthq/signals'
status: solid
score: 92
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - dispatch-scope.md
  - assessment.md
  - source
---

# signals — Review

> Evidence: `packages/signals/src/` (8 implementation files, 8 test files, 84
> tests), `packages/types/src/Signal*.ts` (6 type files). Findings verified
> against this tree as of 2026-09-02.

## Verdict

**solid -- 92/100.** The package delivers its full charter scope: tombstone-safe
dispatch (`emitSignal`), snapshot emission (`emitSignalSafe`), tracked
connection handles with pause/resume, scope-based bulk teardown, and temporal
operators (frame-rate gating, throttle, debounce). The dispatch-during-dispatch
hazard that held the previous review to 90 is resolved -- the tombstone
discipline with `depth`-gated compaction is implemented and exercised by nested
re-entrant emit tests. The `SignalConnection`/`SignalScope` surface that was
previously claimed but absent is now built and backed by 25 tests across
`connection.test.ts` and `scope.test.ts`.

What keeps the score below authoritative: `clearSignal` mid-dispatch does not
stop the in-flight walk and cannot be cancelled afterward (a correctness gap
awaiting a ruling, not a bug in ordinary use), the package has no diagnostics
surface (`enable*Guards`/`explain*`) despite silent-sentinel failure modes, and
the throttle/debounce home question remains open (charter Open direction #1).

## Present capabilities

All verified against `packages/signals/src/`. The package exports 18 functions
from its root barrel (`index.ts` re-exports `contract.ts`).

**Core slot/dispatch (`slot.ts`, `signal.ts`, `emitter.ts`, `internal.ts`):**

- `createSignal<T>()` -- lazy: `data: null`, `emit: nullSignalEmit`. No arrays
  allocated until first `connectSignal`; emitting an empty signal is a genuine
  no-op (the `nullSignalEmit` function body is empty), not a guarded branch.
- `connectSignal(signal, slot, options?)` -- priority-ordered insert via linear
  scan of `data.priorities`; `{ priority, once }` options. Splices three
  parallel arrays in lockstep (`slots`, `priorities`, `repeat`).
- `disconnectSignal(signal, slot)` -- removes all registrations of a slot by
  reference identity (reverse scan). During a dispatch (`data.depth > 0`), the
  slot cell is tombstoned (set to `null`) instead of spliced, preserving cursor
  integrity for all in-flight dispatches. Outside a dispatch, splices
  immediately. Returns the signal to empty state (`data = null`,
  `emit = nullSignalEmit`) when the last slot departs and no dispatch is active.
- `clearSignal(signal)` -- unconditionally nulls `signal.data` and restores
  `nullSignalEmit`. Does not interact with the `depth`/tombstone discipline.
- `emitSignal(signal, ...args)` -- delegates to `signal.emit(...)`, which is
  the dispatch function created by `makeDispatch` when slots are connected, or
  `nullSignalEmit` when none are.
- `cancelSignal(signal)` -- sets `data.cancelled = true`; the dispatch loop
  breaks after the current slot completes. Resets to `false` at the start of
  each emit. Guards on `signal.data !== null`.
- `hasSignalSlots(signal)` -- outside dispatch, checks `data.slots.length > 0`.
  Inside dispatch, scans for non-null entries to exclude tombstones, so a slot
  that emptied the signal mid-dispatch gets the correct answer.
- `isSlotConnected(signal, slot)` -- `indexOf` on `data.slots`. Correctly
  returns `false` for a tombstoned slot (the cell is `null`, not the function).

**Dispatch loop (`makeDispatch` in `slot.ts`):**

The dispatch function closes over both `signal` and `data`. Each emit:
1. Resets `data.cancelled` to `false`.
2. Increments `data.depth`.
3. Walks `data.slots` with a `while (i < data.slots.length)` loop, skipping
   `null` (tombstone) entries. Once slots are tombstoned after firing (not
   spliced), so a nested emit cannot repeat them and the cursor is not skewed.
4. Decrements `data.depth` on exit. At `depth === 0`, runs `compactSignalData`
   which purges all tombstones from the three parallel arrays in a single
   write-pointer pass and detaches the signal if empty.

Nested re-entrant emit is safe: each emit has its own stack-local `i`, and
since removal during dispatch is a tombstone (O(1) null write) rather than a
splice, no cursor in any nesting level is invalidated. Tested explicitly:
`slot.test.ts` includes "delivers to every slot when a slot re-emits the same
signal", "removes a once slot exactly once across a re-entrant emit", "gives a
nested emit its own cursor, unskewed by a disconnect inside it", and "fires a
once slot exactly once when a nested emit walks past it".

**Snapshot emission (`safe.ts`):**

- `emitSignalSafe(signal, ...args)` -- copies `slots`, `priorities`, and
  `repeat` before iterating. Connections added during dispatch wait for a later
  emission. Once slots are consumed before invocation via `tombstoneOnceSlot`
  (a linear scan that nulls the slot in the live `data.slots`, preventing a
  nested safe emission from repeating it). Uses `try/finally` around the
  dispatch body so `depth` is decremented and compaction runs even if a slot
  throws. Has its own `compactSignalData` (duplicated from `slot.ts`).

**Tracked connections (`connection.ts`):**

- `connectSignalTracked(signal, slot, options?)` -- wraps the slot in a
  tracking closure that checks `connection.paused` before calling through,
  implementing pause as option (b) from `dispatch-scope.md` (wrapper slot, no
  `SignalData` change). Once connections disconnect themselves inside the wrapper
  before invoking the real slot, so a paused once connection is not consumed.
  Returns a `SignalConnection<T>` plain-data handle. If `options.scope` is
  provided, pushes the connection into the scope's array.
- `disconnectSignalConnection(connection)` -- idempotent: sets
  `connection.connected = false` and delegates to `disconnectSignal`. No-op if
  already disconnected.
- `pauseSignalConnection(connection)` / `resumeSignalConnection(connection)` --
  sets `connection.paused`. Guards on `connection.connected`, so pausing or
  resuming a dead connection is a no-op.

**Scopes (`scope.ts`):**

- `createSignalScope()` -- returns `{ connections: [] }`.
- `disconnectSignalScope(scope)` -- copies the connections array, empties the
  scope, then iterates the copy calling `disconnectSignalConnection` on each.
  Emptying before the loop means a re-entrant call (scope torn down from inside
  a dispatch that re-triggers teardown) sees nothing to do. Idempotent per
  member via the idempotent disconnect underneath.

**Temporal operators (`throttle.ts`):**

- `connectSignalAtFrameRate(source, fps, slot)` -- specialized for
  `(deltaTime: number) => void` frame-tick signals. Accumulates delta time and
  fires when the period elapses; the slot receives the accumulated delta, not
  individual source deltas. Returns a cleanup function.
- `connectSignalThrottled(source, intervalMs, slot, options?)` --
  payload-preserving throttle with `leading`/`trailing` edge control. Uses
  `Date.now()` and `setTimeout`.
- `connectSignalDebounced(source, delayMs, slot, options?)` -- fires after the
  signal goes quiet for `delayMs`. `leading: true` fires immediately on the
  first invocation and suppresses until the delay window expires. Uses
  `Date.now()` and `setTimeout`.

All three return a cleanup function that disconnects the internal handler and
cancels any pending timer.

**Types (`@flighthq/types`):**

All signal types live in `@flighthq/types` and are exported from both `.` and
`./contract`:
- `Signal<T>` -- `{ data: SignalData<T> | null; emit: T }`.
- `SignalData<T>` -- `{ slots: (T | null)[]; priorities: number[]; repeat: boolean[]; cancelled: boolean; depth: number }`.
- `SignalConnectOptions` -- `{ once?: boolean; priority?: number }`.
- `SignalConnection<T>` -- `{ signal; slot; connected; paused }` with JSDoc.
- `SignalScope` -- `{ connections: SignalConnection[] }` with JSDoc.
- `SignalThrottleOptions` -- `{ leading?: boolean; trailing?: boolean }`.
- `SignalTrackedConnectOptions` -- extends `SignalConnectOptions` with
  `scope?: SignalScope`.

**Tests:** 84 across 8 files. Notable coverage areas:
- `slot.test.ts` (27 tests): dispatch-mutation block with 10 tests covering
  disconnect-during-dispatch (earlier, later, self), tombstone compaction,
  nested re-entrant emit with independent cursors, once-slot tombstoning across
  nested emits, and introspection correctness mid-dispatch.
- `connection.test.ts` (11 tests): tracked handle lifecycle, priority
  interleaving with ordinary slots, once teardown under both `emitSignal` and
  `emitSignalSafe`, mid-dispatch disconnect.
- `scope.test.ts` (14 tests): bulk teardown, idempotency, paused member
  disconnect, already-fired once members, re-entrant scope teardown and
  reconnect, duplicate listing, interaction with unscoped connections.
- `safe.test.ts` (7 tests): snapshot isolation (added slots wait, removed
  slots still fire), nested safe emission with separate snapshots, once-slot
  consumed before invocation, cancellation reset.
- `throttle.test.ts` (14 tests): frame-rate accumulation, debounce leading/
  trailing edges, throttle leading/trailing edges, payload preservation,
  cleanup, edge cases (both disabled).

**Package manifest:** `sideEffects: false`. Two export lanes (`.` and
`./contract`). Single dependency: `@flighthq/types`. No top-level side effects.

## Gaps

Measured against the charter scope, codebase conventions, and AAA completeness.

- **`clearSignal` mid-dispatch does not stop the in-flight walk, and
  `cancelSignal` cannot reach it afterward.** `clearSignal` nulls `signal.data`
  and restores `nullSignalEmit` (`slot.ts:7-10`), but `makeDispatch` closed
  over the `data` object (`slot.ts:87`), so the running loop keeps draining the
  detached array. `cancelSignal` guards on `signal.data !== null`
  (`emitter.ts:6`), so after a mid-dispatch `clearSignal` it is a no-op.
  Compaction handles the aliasing correctly -- it checks `signal.data === data`
  before detaching (`slot.ts:128`). This is a stop-the-dispatch gap, not
  corruption. Needs a ruling on whether `clearSignal` mid-dispatch should imply
  cancel (status.md records this as open).
- **No diagnostics surface.** The codebase convention requires `enable*Guards`
  modules for caller-facing warnings and `explain*` queries for silent
  sentinels. The package has several silent sentinels -- `disconnectSignal` on a
  non-connected slot, `emitSignal` on an empty signal, `cancelSignal` after
  `clearSignal` -- and none have guard or explain counterparts. The failure mode
  of a signal system (silently skipped or never-fired slot) is inherently
  invisible, making this gap more consequential than in most packages.
- **No slot-count introspection.** `hasSignalSlots` (boolean) is the only
  listener-count query. There is no `getSignalSlotCount` returning a number and
  no `getSignalConnections` returning live handles. The charter lists
  "introspection (`hasSignalSlots`/`isSlotConnected`)" as in scope and both are
  present, so this is a completeness observation rather than a charter violation.
  A count function would be useful for diagnostics.
- **Duplicated `compactSignalData`.** `safe.ts` contains its own copy of the
  compaction function (lines 47-66) rather than sharing the one in `slot.ts`.
  The two are identical in logic. This is a minor maintenance risk --
  a compaction fix in one must be mirrored in the other.
- **Throttle/debounce use host-time.** `connectSignalThrottled` and
  `connectSignalDebounced` use `Date.now()` and `setTimeout`, coupling them to
  the host clock. The charter parks this as Open direction #1 (throttle/debounce
  home) and it remains unsettled.

## Charter contradictions

None. The charter is mature (5 Decisions, 4 Open directions) and the source
aligns with every stated boundary.

- The void slot contract holds: no return-carrying signals (Decision #2).
- Dispatch is synchronous-only: no `emitSignalDeferred` (Decision #1).
- Weak connections are absent (Decision #3).
- No `this`/context binding.
- Tombstone dispatch discipline matches the Decision #5 specification exactly:
  `depth` counter, null-cell tombstoning during dispatch, outermost-exit
  compaction.
- Tracked connections use wrapper-slot pause (option (b) from
  `dispatch-scope.md`), matching Decision #6.

One charter description is stale: Open direction #3 states `SignalThrottleOptions`
is "declared inline in `throttle.ts` rather than in `@flighthq/types`." This is
no longer true -- the type is in `packages/types/src/SignalThrottleOptions.ts`
and `throttle.ts` imports it from `@flighthq/types/contract`. The direction can
be closed.

## Contract & docs fit

**Upheld:**

- **Types-first.** All 7 signal types are in `@flighthq/types` and exported
  from both `.` and `./contract`. The implementation package exports functions
  only -- no inline type definitions.
- **Full unabbreviated names.** Every export carries `Signal`, `Slot`, or
  `Scope` in its name. No abbreviations.
- **Two export lanes.** `index.ts` re-exports from `contract.ts`; both exist
  and are declared in `package.json` exports.
- **`sideEffects: false`.** No top-level side effects. `nullSignalEmit` is a
  const, not a registration.
- **Sentinels not throws.** `disconnectSignalConnection` is idempotent (no-op
  on dead handle). `cancelSignal` guards on null data. `emitSignal` on an empty
  signal calls `nullSignalEmit`. No throw for expected failure cases.
- **Free functions over classes.** Every export is a free function operating on
  plain-data entities.
- **Readonly parameters.** `options` parameters use `Readonly<>` wrappers.
  `hasSignalSlots` and `isSlotConnected` take `Readonly<Signal<T>>`.
- **Lazy allocation.** `createSignal` allocates only the two-field `Signal`
  record. `SignalData` arrays are created on first `connectSignal`. A signal
  that nobody connects costs nothing.
- **One test file per source file.** All 8 implementation files have a
  colocated `.test.ts`.

**Stale or incomplete documentation:**

- The previous `review.md` (2026-07-31) and `assessment.md` (2026-07-31) cite
  functions that do not exist in source: `connectSignalOnce`,
  `getSignalSlotCount`, `getSignalConnections`, `disconnectAllSlots`,
  `isSignalConnectionActive`. The correction note at the top of the old review
  partially addresses this but does not cover all phantom names. This review
  supersedes both.
- `assessment.md` backlog item "Connection handles, pause/resume, scopes" states
  "they are not in the source tree." They are now built and blessed by charter
  Decisions #5 and #6. Superseded.
- Charter Open direction #3 (`SignalThrottleOptions` placement) describes the
  type as inline. It is now in `@flighthq/types`. The direction can be resolved.

## Candidate open directions

1. **`clearSignal` mid-dispatch ruling.** Should `clearSignal` during a dispatch
   imply `cancelSignal` on the detached data, so the walk stops? Currently the
   walk runs to completion on the orphaned array. The compaction is correct (it
   checks `signal.data === data`), so this is not corruption, but it is
   surprising behavior: a caller who clears a signal expects silence, not a tail
   of dispatches that finish out. A one-line fix
   (`data.cancelled = true` in `clearSignal` when `data.depth > 0`) would stop
   the walk, but it changes observable behavior for any caller relying on
   clear-then-continue semantics.
2. **Diagnostics surface.** A `enableSignalGuards` module warning on common
   misuses (disconnect of a non-connected slot, emit-after-clear, cancel after
   clear) and `explainSignalState(signal)` returning plain data
   (slot count, depth, cancelled) would close the diagnostics gap.
3. **`compactSignalData` deduplication.** The identical compaction in `slot.ts`
   and `safe.ts` could be extracted to a shared internal module.
4. **Throttle/debounce home.** Charter Open direction #1. Unsettled; depends on
   whether a unified time/counter abstraction materializes.
5. **Storage strategy.** Charter Open direction #2, partially resolved. The
   three-lane parallel-array insert still splices in lockstep for priority
   ordering. Not a correctness concern at current slot counts but a structural
   choice to record as a Decision if it starts to cost.
