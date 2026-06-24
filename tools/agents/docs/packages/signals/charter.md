---
package: '@flighthq/signals'
crate: flighthq-signals
draft: true
lastDirection: null
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# signals — Charter

> **DRAFT — unblessed.** First-pass generated charter; edit in personal review. Nothing here is blessed until you confirm.

## What it is

`@flighthq/signals` is the SDK's typed observer / event-dispatch primitive: strictly-typed signals and slots for loose, multi-listener notification across the public API. A `Signal<T>` is a lazily-allocated dispatch point; `connectSignal` registers a slot and returns a `SignalConnection<T>` handle. The package provides priority ordering, one-shot connections (`connectSignalOnce`), per-connection pause/resume, cancellation (`cancelSignal`), introspection (`getSignalSlotCount` / `hasSignalSlots` / `getSignalConnections`), scope-based bulk teardown (`createSignalScope` …), and frame-rate / throttle / debounce temporal operators.

It is **fundamental infrastructure** — effectively always present in the SDK, with few dependencies — but it is _opt-in cost_: specific signal groups are enabled by `enable*` functions defined in the package that **owns** the entity (e.g. `enableDisplayObjectSignals`), not here. Signals is the dispatch mechanism; the entity packages own the policy of when to pay for it.

Where it ends vs a neighbor: signals is the _loose-dispatch_ primitive (multiple listeners, priority, cancellation). Strict internal wiring with a single guaranteed callsite stays a direct callback and never reaches for a signal. Wall-clock and timer concerns (`throttle.ts` uses `Date.now()`/`setTimeout`) sit at the edge of the package's identity and may belong with a timer/tween package — see Open directions.

## North star (proposed)

- **Loose dispatch, plain data, free functions.** Signals exist for notification with multiple listeners, priority ordering, and cancellation — the cases a direct callback cannot serve. Everything is free functions over plain-data entities (`Signal`, `SignalData`, `SignalConnection`, `SignalScope`), defined types-first in `@flighthq/types`, with full unabbreviated `Signal`/`Slot`/`Connection` names. No wrapper objects, no hidden runtime state, no `this`/context binding (deliberately C-portable).
- **Pay nothing until you connect.** Lazy allocation is a core value: a freshly created signal holds no arrays and emitting it is a genuine no-op, not a guarded branch. The package stays a thin, tree-shakable, `sideEffects: false` barrel with no eager registration.
- **Correct under mutation-during-dispatch.** A signal library's hard core is connect/disconnect _during_ emit. The index-walk + tombstone discipline must keep dispatch deterministic and safe across connect-during-emit, disconnect-self, disconnect-next, and (the proposed bar) nested re-entrant emit of the same signal.
- **Cost is opt-in and owned elsewhere.** Signal groups are enabled by the owning entity package's `enable*` functions; signals provides the mechanism, not the registration policy.
- **Pre-release means hard renames, not aliases.** No accumulated `@deprecated` shims — a rename replaces the old name outright (the codebase-map no-workarounds rule). _(Proposed; see Open directions #5.)_

## Boundaries (proposed)

In scope:

- The slot/dispatch core: connect, disconnect, one-shot, priority, pause/resume, cancellation, introspection, and scope-based teardown.
- Plain-data types in `@flighthq/types` and a single tree-shakable root export.

Candidate non-goals (each is also an Open direction until blessed):

- **Deferred / async / queued dispatch** (`emitSignalDeferred`) — absent today; needs a flush-point design before it is in or out.
- **Return-carrying / collect dispatch** (`emitSignalCollect` / `CollectableSignal`, veto chains) — diverges from the strict `void` slot contract; a live consumer exists (`@flighthq/application` `onCloseRequest`).
- **Weak / auto-disposing connections** (`connectSignalWeak`) — GC-nondeterminism and a Rust `Weak<>` conformance divergence.
- **`this`/context binding** — deliberately excluded for C-portability (closed-by-documentation).

Edge-of-identity (placement undecided):

- **Wall-clock temporal operators** (`throttle.ts`: throttle/debounce over `Date.now()`/`setTimeout`) — host-time-coupled, unlike the rest of the package; may be a convenience annex or belong with a timer/tween package.

## Decisions

None blessed yet.

## Open directions

Every candidate question this draft could not settle. These are for the user to settle into North star / Boundaries / Decisions.

1. **Synchronous-only as a Boundary, or is `emitSignalDeferred` in scope?** The package leans synchronous-by-design (render-loop intent) but never states it as a boundary. If deferred dispatch is wanted, the flush-point (TS microtask vs. Rust host-driven `flushDeferredSignals`) is a design fork needing blessing before building.
2. **Return-carrying signal (`emitSignalCollect` / `CollectableSignal`) in scope, or does the `void` slot contract hold?** A return-typed signal diverges from the strict `void` contract. The `@flighthq/application` `onCloseRequest` veto is a concrete consumer pushing on this — decide whether the veto chain lives here or in the caller.
3. **Weak / auto-disposing connections — in or out?** They carry GC-nondeterminism and a permitted Rust `Weak<>` conformance divergence. Worth a Boundary line either way.
4. **Storage strategy as a Decision.** Parallel five-lane arrays (`slots`/`priorities`/`repeat`/`enabled`/`connections`) vs. a dense slotmap is an implicit internal choice; given the once-splice mid-dispatch hazard it touches _correctness_, not just perf. Record the intended end-state — and whether the tombstone discipline should extend to once-removal — as a Decision.
5. **Deprecation policy.** Given pre-release "no backwards-compat obligations," should the package keep _any_ `@deprecated` alias (`disconnectAllSignals`, `connectSignalAtRate` — both now zero-caller), or always hard-rename? A one-line Decision would settle this and future renames.
6. **Throttle/debounce clock & home.** `connectSignalThrottled`/`Debounced` use `Date.now()`/`setTimeout` — host-time-coupled, unlike the rest of the package. Is wall-clock temporal control a signals concern, or does it belong with a timer/tween package? A Boundary line would clarify whether `throttle.ts` is core or a convenience annex.
7. **`SignalThrottleOptions` placement (contract drift).** Declared inline in `throttle.ts` rather than in `@flighthq/types`. It does not currently cross a package boundary, but the types-first rule and the symmetry with `SignalConnectOptions` argue for moving it. Settle whether it stays inline.
8. **Rust conformance debt (fork D — runtime backend / port mirror).** The Rust `flighthq-signals` already diverges structurally (`Signal<T>` parameterized by _payload_, `Arc<dyn Fn>` vs. TS function-typed `Signal<T>`); the new handle / pause / scope / throttle surface widens what the port must mirror. Confirm which of the above directions the port is expected to track 1:1.
9. **Nested re-entrant emit guarantee (charter-level correctness bar).** The `connectSignal` JSDoc promises re-entrant emit of the same signal is safe, but the once-removal path splices regardless of `depth` (unlike the tombstone-protected disconnect path). Decide whether "nested re-entrant emit is safe" is a blessed North-star guarantee — which would require extending the tombstone discipline to once-removal and a nested-emit test.
