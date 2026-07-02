---
package: '@flighthq/signals'
crate: flighthq-signals
draft: false
lastDirection: 2026-07-02
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# signals — Charter

## What it is

`@flighthq/signals` is the SDK's typed observer/event-dispatch primitive: strictly-typed signals and slots for loose, multi-listener notification across the public API. A `Signal<T>` is a lazily-allocated dispatch point; `connectSignal` registers a slot. The package provides priority ordering, one-shot connections (`connectSignalOnce`), cancellation (`cancelSignal`), introspection (`hasSignalSlots`/`isSlotConnected`), and temporal operators (frame-rate gating, throttle, debounce).

It is **fundamental infrastructure** — effectively always present in the SDK — but it is _opt-in cost_: specific signal groups are enabled by `enable*` functions defined in the package that **owns** the entity (e.g. `enableNodeSignals` in `@flighthq/node`, `enableStageSignals` in `@flighthq/displayobject`), not here. Signals is the dispatch mechanism; the entity packages own the policy of when to pay for it.

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

**Non-goals (blessed):**

- **Deferred/async/queued dispatch** (`emitSignalDeferred`) — a different abstraction, potentially a different package (Decision #1).
- **Return-carrying / collect dispatch** (`emitSignalCollect`, veto chains) — the slot contract is `void`; callers that need a veto implement it themselves (Decision #2).
- **Weak / auto-disposing connections** (`connectSignalWeak`) — GC-nondeterministic, Rust `Weak<>` conformance divergence, and scopes already serve the cleanup bracket (Decision #3).
- **`this`/context binding** — deliberately excluded for C-portability.

## Decisions

- **[2026-07-02] Synchronous-only dispatch is a hard boundary.** No `emitSignalDeferred`. Emit is synchronous and completes before returning. Deferred/queued dispatch (Qt queued connections, RxJS schedulers) is a different abstraction and, if needed, belongs in a different package — not layered into the signal core. **Resolves Open direction #1.**

  **Why:** The signal system is render-loop infrastructure — synchronous, deterministic, zero-surprise. Deferred dispatch introduces flush-point semantics (TS microtask vs. Rust host-driven `flushDeferredSignals`) that would complicate the core for a use case that is better served by an explicit event queue.

- **[2026-07-02] The void slot contract holds — no return-carrying signals.** All slots return `void`. No `emitSignalCollect` / `CollectableSignal`. The `@flighthq/application` `onCloseRequest` veto pattern should be implemented by the caller (e.g. a shared boolean ref set by the slot, or a cancellation token), not by complicating the signal dispatch with return aggregation. **Resolves Open direction #2.**

  **Why:** A return-carrying signal diverges from the strict dispatch contract and adds complexity to the hot emit path for a rare use case. The veto pattern has a simple caller-side solution that doesn't tax every signal in the system.

- **[2026-07-02] Weak / auto-disposing connections are out.** No `connectSignalWeak`. GC-nondeterministic, a Rust `Weak<>` conformance divergence, and scopes already provide the cleanup bracket pattern. **Resolves Open direction #3.**

  **Why:** Scopes (`createSignalScope`/`disconnectSignalScope`) give deterministic bulk teardown without GC coupling. Weak connections would add `FinalizationRegistry` dependency for marginal convenience.

- **[2026-07-02] Hard rename, no deprecated aliases.** Pre-release, greenfield — no backwards-compatibility obligations. When a name changes, the old name is deleted outright. No `@deprecated` shims. The two existing zero-caller aliases (`disconnectAllSignals`, `connectSignalAtRate`) should be deleted. **Resolves Open direction #5.**

  **Why:** There are no published consumers. Aliases accumulate workarounds for past choices — exactly what the pre-release policy forbids. A hard rename is one grep-and-replace; an alias is permanent API surface with no audience.

## Open directions

1. **Throttle/debounce home.** `connectSignalThrottled`/`connectSignalDebounced`/`connectSignalAtFrameRate` use `Date.now()`/`setTimeout` — host-time-coupled, unlike the rest of the package. These are important to have _somewhere_, but they may belong in a unified time/counter abstraction — a `time` package with pause, rewind, fast forward, speed up, slow down — rather than on the signal primitive itself. The frame-rate gater in particular could be an adapter over a shared counter rather than a signal-specific function. Needs design thought; do not move or restructure without a decision. _(Was Open direction #6.)_

2. **Dispatch-during-dispatch safety and the once-splice hazard.** The current `makeDispatch` forward loop splices `once` slots immediately. `disconnectSignal` also splices directly. If a slot callback emits the _same_ signal (re-entrant) or disconnects a slot before the dispatch cursor, index shift can skip a slot. The classic fix is a `depth` counter on `SignalData` with tombstone-on-remove during dispatch (no allocation, O(1) vs. splice's O(n), tombstone purge amortized on outermost exit). Nested same-signal re-entrancy is unusual, but disconnect-during-dispatch is not. Needs review against the original implementation; performance and no-alloc are priorities. _(Was Open direction #4, #9.)_

3. **Storage strategy.** Parallel arrays (`slots`/`priorities`/`repeat`) vs. a dense slotmap/free-list. Currently three parallel arrays with splice. The tombstone discipline (if adopted for #2) would be the natural precursor to a denser storage model. Record the intended end-state as a Decision once #2 is settled. _(Was Open direction #4.)_

4. **`SignalThrottleOptions` placement.** Declared inline in `throttle.ts` rather than in `@flighthq/types`. Doesn't currently cross a package boundary, but `SignalConnectOptions` (its sibling) is in types. Minor contract drift — settle when the throttle/debounce home question (#1) is resolved.

5. **Rust conformance.** `flighthq-signals` already diverges structurally (`Signal<T>` parameterized by payload, `Arc<dyn Fn>`). The new surface (connection handles, scopes, throttle) widens what the port must mirror. Downstream conformance debt, not a signals-package task.
