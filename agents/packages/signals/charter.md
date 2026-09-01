---
package: '@flighthq/signals'
role: package
crate: flighthq-signals
draft: false
lastDirection: 2026-09-01
review: ./review.md
assessment: ./assessment.md
status: ./status.md
dispatchScope: ./dispatch-scope.md
---

# signals — Charter

## What it is

`@flighthq/signals` is the SDK's typed observer/event-dispatch primitive: strictly-typed signals and slots for loose, multi-listener notification across the public API. A `Signal<T>` is a lazily-allocated dispatch point; `connectSignal` registers a slot. The package provides priority ordering, one-shot connections (`connectSignal(..., { once: true })`), cancellation (`cancelSignal`), introspection (`hasSignalSlots`/`isSlotConnected`), and temporal operators (frame-rate gating, throttle, debounce).

It is **fundamental infrastructure** — effectively always present in the SDK — but it is _opt-in cost_: specific signal groups are enabled by `enable*` functions defined in the package that **owns** the entity (e.g. `enableNodeSignals` in `@flighthq/node`, `enableStageSignals` in `@flighthq/scene2d`), not here. Signals is the dispatch mechanism; the entity packages own the policy of when to pay for it.

Where it ends: signals is the _loose-dispatch_ primitive (multiple listeners, priority, cancellation). Strict internal wiring with a single guaranteed callsite stays a direct callback and never reaches for a signal.

## North star

1. **Loose dispatch, plain data, free functions.** Signals exist for notification with multiple listeners, priority ordering, and cancellation — the cases a direct callback cannot serve. Everything is free functions over plain-data entities (`Signal`, `SignalData`), defined types-first in `@flighthq/types`, with full unabbreviated `Signal`/`Slot` names. No wrapper objects, no `this`/context binding (deliberately C-portable).
2. **Pay nothing until you connect.** Lazy allocation is a core value: a freshly created signal holds no arrays and emitting it is a genuine no-op, not a guarded branch. The package stays a thin, tree-shakable, `sideEffects: false` barrel with no eager registration.
3. **Synchronous, deterministic dispatch.** Emit is synchronous and completes before returning. No deferred/queued/async dispatch — that is a different abstraction (Decision #1).
4. **Cost is opt-in and owned elsewhere.** Signal groups are enabled by the owning entity package's `enable*` functions; signals provides the mechanism, not the registration policy.

## Boundaries

**In scope:**

- The slot/dispatch core: connect, disconnect, one-shot, priority, cancellation, introspection.
- Plain-data types in `@flighthq/types` and a single tree-shakable root export.
- Temporal operators as a convenience surface (frame-rate gating, throttle, debounce) — placement is an open question (see Open directions #1).
- Two dispatch semantics, chosen by the caller: `emitSignal` (fast, tombstone-safe) and `emitSignalSafe` (listener set frozen at emit time). See the 2026-09-01 Decision.
- Tracked connection handles and scopes: `connectSignalTracked` returning a `SignalConnection`, per-connection disconnect/pause/resume, and `SignalScope` bulk teardown — opt-in, costing only the consumers that ask for a handle. See the 2026-09-01 Decision.

**Non-goals (blessed):**

- **Deferred/async/queued dispatch** (`emitSignalDeferred`) — a different abstraction, potentially a different package (Decision #1).
- **Return-carrying / collect dispatch** (`emitSignalCollect`, veto chains) — the slot contract is `void`; callers that need a veto implement it themselves (Decision #2).
- **Weak / auto-disposing connections** (`connectSignalWeak`) — GC-nondeterministic and a Rust `Weak<>` conformance divergence; explicit disconnect remains the deterministic cleanup bracket (Decision #3).
- **`this`/context binding** — deliberately excluded for C-portability.

## Decisions

- **[2026-07-02] Synchronous-only dispatch is a hard boundary.** No `emitSignalDeferred`. Emit is synchronous and completes before returning. Deferred/queued dispatch (Qt queued connections, RxJS schedulers) is a different abstraction and, if needed, belongs in a different package — not layered into the signal core. **Resolves Open direction #1.**

  **Why:** The signal system is render-loop infrastructure — synchronous, deterministic, zero-surprise. Deferred dispatch introduces flush-point semantics (TS microtask vs. Rust host-driven `flushDeferredSignals`) that would complicate the core for a use case that is better served by an explicit event queue.

- **[2026-07-02] The void slot contract holds — no return-carrying signals.** All slots return `void`. No `emitSignalCollect` / `CollectableSignal`. The `@flighthq/application` `onCloseRequest` veto pattern should be implemented by the caller (e.g. a shared boolean ref set by the slot, or a cancellation token), not by complicating the signal dispatch with return aggregation. **Resolves Open direction #2.**

  **Why:** A return-carrying signal diverges from the strict dispatch contract and adds complexity to the hot emit path for a rare use case. The veto pattern has a simple caller-side solution that doesn't tax every signal in the system.

- **[2026-07-02] Weak / auto-disposing connections are out.** No `connectSignalWeak`. GC-nondeterministic, a Rust `Weak<>` conformance divergence, and explicit disconnect already provides deterministic cleanup. **Resolves Open direction #3.**

  **Why:** Weak connections would add `FinalizationRegistry` dependency for marginal convenience while making cleanup timing nondeterministic.

- **[2026-07-02] Hard rename, no deprecated aliases.** Pre-release, greenfield — no backwards-compatibility obligations. When a name changes, the old name is deleted outright. No `@deprecated` shims. Historical review prose claimed two zero-caller aliases (`disconnectAllSignals`, `connectSignalAtRate`), but neither alias exists in current source. **Resolves Open direction #5.**

  **Why:** There are no published consumers. Aliases accumulate workarounds for past choices — exactly what the pre-release policy forbids. A hard rename is one grep-and-replace; an alias is permanent API surface with no audience.

- **[2026-09-01] Dispatch-during-dispatch safety is a tombstone discipline on the base path, not an opt-in mode.** `SignalData` gains `depth: number` and its `slots` lane becomes `(T | null)[]`. While `depth > 0`, `disconnectSignal` and once-slot removal null the cell instead of splicing, the dispatch cursor skips nulls, and the outermost exit runs one compaction pass. Teardown of an emptied signal moves into that compaction, so a running loop is never left walking arrays the signal no longer refers to. `emitSignal` is fixed in place rather than given an opt-in sibling: the splice-during-dispatch skip was a bug, not a semantic, so nobody opts into correctness. Separately, `emitSignalSafe` adds the frozen-listener-set semantic by copying the slot array before iterating, so connections made during an emission do not fire in it. **Resolves the "dispatch-during-dispatch safety and the once-splice hazard" direction** (numbered #2 in the 2026-08 list, originally #4 and #9).

  **Why:** Disconnect-during-dispatch is ordinary, not exotic, and the splice-based loop silently skipped whichever slot shifted into the vacated index — a missed notification that raises no error and is invisible in a test that does not look for it. Tombstoning is an O(1) write during dispatch against splice's O(n), allocates nothing on the hot path, and costs one null check per slot. The two semantics are kept apart deliberately: the tombstone path still visits slots added after the cursor, so a caller who needs the listener set frozen needs `emitSignalSafe` and its array copy, and a caller who does not should not pay for one.

  **Authority:** `dispatch-scope.md`, the commissioned scope, which rules the base-path fix explicitly. Landed in `9b3d32962` (tombstones) and `aa7a2bc4d` (snapshot emission).

- **[2026-09-01] Tracked connections and scopes are in scope, and are built.** `connectSignalTracked` returns a `SignalConnection`; `disconnectSignalConnection`, `pauseSignalConnection`, and `resumeSignalConnection` act on the handle; `createSignalScope` and `disconnectSignalScope` are the bulk-teardown bracket. Pause is implemented as a wrapper slot that returns early while `connection.paused` — `dispatch-scope.md` option (b) — **not** as an `enabled` parallel array. So `SignalData` keeps its three lanes, an untracked connection allocates no wrapper, and a paused connection keeps its priority position because its slot never leaves the array. **Closes the `SignalConnection`/`SignalScope` backlog item** recorded in `status.md` and in `assessment.md` ("if desired, they are a separate feature addition" — they are now desired).

  **Why:** The header layer had advertised `SignalConnection` and `SignalScope` since before any implementation existed, so a consumer could read an API it could not call. The standing instruction was to build the surface or retire the types; the commission chose build. Option (b) keeps the cost with the consumers who ask for a handle, which is the package's "pay nothing until you connect" value applied one level up.

  **Authority:** `dispatch-scope.md`. Landed in `48cd6146c` (tracked handles) and `5bb7e2d43` (scopes).

## Open directions

> Numbers here are positional and shift whenever a direction resolves; each entry carries its prior
> number. Cross-reference a direction by its title, not its number — the numeric references in older
> Decisions above predate two renumberings and no longer point where they read.

1. **Throttle/debounce home.** `connectSignalThrottled`/`connectSignalDebounced`/`connectSignalAtFrameRate` use `Date.now()`/`setTimeout` — host-time-coupled, unlike the rest of the package. These are important to have _somewhere_, but they may belong in a unified time/counter abstraction — a `time` package with pause, rewind, fast forward, speed up, slow down — rather than on the signal primitive itself. The frame-rate gater in particular could be an adapter over a shared counter rather than a signal-specific function. Needs design thought; do not move or restructure without a decision. _(Was Open direction #6.)_

2. **Storage strategy.** _Partially resolved 2026-09-01._ The removal half is settled: removal during a dispatch is tombstone-then-compact rather than splice, and `SignalData` stayed at three parallel lanes (`slots`/`priorities`/`repeat`) because pause went to a wrapper slot instead of an `enabled` lane. What is still open is the container itself — parallel arrays versus a dense slotmap or free list. Two costs argue for revisiting: every insert splices three arrays in lockstep to hold priority order, and every outermost dispatch that tombstoned anything pays an O(n) compaction pass a free list would not need. Neither matters at the slot counts in use today. Record the intended end-state as a Decision if the lockstep or the compaction starts to cost. _(Was Open direction #3, and #4 before that.)_

3. **`SignalThrottleOptions` placement.** Declared inline in `throttle.ts` rather than in `@flighthq/types`. Doesn't currently cross a package boundary, but `SignalConnectOptions` (its sibling) is in types. Minor contract drift — settle when the throttle/debounce home question (#1) is resolved.

4. **Rust conformance.** `flighthq-signals` already diverges structurally (`Signal<T>` parameterized by payload, `Arc<dyn Fn>`). The current priority, cancellation, and temporal-operator surface defines what the port must mirror. Downstream conformance debt, not a signals-package task.
