---
id: signals
title: '@flighthq/signals'
type: depth
target: signals
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/signals.md
  - tools/agents/docs/reviews/depth/signals.md
depends_on: []
updated: 2026-06-23
---

## Summary

solid — 72/100. A clean, complete, tree-shakable core signal/slot primitive that covers connect/disconnect/emit/priority/once/cancel without bloat, but lacks the connection-handle, introspection, and named-`once` features that mature signal libraries treat as table stakes.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum viable, genuinely-useful version. These are the depth review's high-leverage items — they close the gaps that block real usage (anonymous-closure disconnect, hot-path skip) and fix the one outright naming error. Shippable, basic, no new subsystems.

- **`SignalConnection` handle type in `@flighthq/types`** — a plain-data binding record (`{ signal, slot, connected: boolean }` or an opaque id token, kept as plain data, not a class). This is the header-layer prerequisite for every other handle-based feature. Define it before touching the signals package.
- **`connectSignal` returns a `SignalConnection`** — the defining gap from the depth review. The returned handle lets a caller disconnect an anonymous inline closure, connect the _same_ function twice as distinct listeners, and (later) pause/resume. `connectSignalAtRate` already proves the returned-cleanup pattern is wanted.
- **`disconnectSignalConnection(connection)`** — disconnect by handle identity, not slot identity. Removes exactly the one connection, not "all matching instances." Returns `boolean` (was-it-connected) as a sentinel; idempotent on an already-disconnected handle.
- **`isSignalConnectionActive(connection)`** — `has*`/`is*` introspection on a single handle.
- **`getSignalSlotCount(signal)` / `hasSignalSlots(signal)`** — listener-count introspection so hot paths skip building an event payload when nobody is listening, without reaching into internal `signal.data`. Both `Readonly<Signal<T>>` params.
- **`connectSignalOnce(signal, slot, options?)`** — first-class named verb mirroring AS3-Signals `addOnce` / Node `once`, returning a `SignalConnection`. Keep the `once` option on `connectSignal` for symmetry; this is the grepable, self-identifying surface the codebase's naming rule wants.
- **Rename `disconnectAllSignals` → `disconnectAllSlots`** — the one outright naming error: it operates on one signal and clears _that signal's slots_, so the plural "Signals" misreads as "disconnect many signals." Pre-release, no consumers — exactly the time to fix it.
- **Document the deliberate omissions in source** — note that synchronous-only dispatch and no `this`-binding are by-design (render-loop intent, free-function/C-portable philosophy), and state the equal-priority = insertion-order guarantee explicitly so consumers can rely on it.
- **Rust parity** — mirror all of the above in `flighthq-signals`: a `SignalConnection` value type (carry a generation/index into the slot arena, not an `Rc`), `connect_signal` returning it, `disconnect_signal_connection`, `is_signal_connection_active`, `get_signal_slot_count`, `has_signal_slots`, `connect_signal_once`, and the `disconnect_all_slots` rename.

---

### Silver

Competitive and solid — matches what a well-regarded signal library (AS3-Signals, libsigc++, Qt signals, mitt/nanoevents) offers for common professional use, the important edge cases, and cross-backend (TS↔Rust) consistency.

- **Pause / resume on a connection** — `pauseSignalConnection(connection)` / `resumeSignalConnection(connection)` (AS3-Signals `enabled`, libsigc++ `block()`). Requires an `enabled: boolean` per-slot lane in `SignalData` (a fourth parallel array) and a skip-if-disabled check in the dispatch loop. Lets a listener stay registered (preserving priority position) while temporarily silenced.
- **Re-entrancy safety, documented and guaranteed** — make emit-during-emit on the _same_ signal well-defined. The current index-walk + in-place splice is fragile under re-entry; add a dispatch-depth guard or snapshot strategy and a test that emits the same signal from within a slot. State the guarantee (re-entrant emit is safe; newly-added slots do not fire in the in-flight pass — the canonical contract).
- **Deferred dispatch** — `emitSignalDeferred(signal, ...args)` that queues the emit to the next microtask/tick (Qt queued-connection / RxJS-scheduler analogue). Needs a small dispatch queue and a documented flush point; keep it opt-in so synchronous remains the default and tree-shakes out when unused.
- **General payload-preserving throttle** — generalize `connectSignalAtRate` so it forwards the _source_ args, not only accumulated `elapsed`. The depth review flags that today's throttle is really a frame-tick operator (`(deltaTime) => void`-shaped). Split into:
  - `connectSignalThrottled(signal, slot, intervalMs, options?)` — leading/trailing-edge control, payload-preserving.
  - Keep/rename the tick-specialized variant to reflect its frame-loop intent (e.g. `connectSignalAtFrameRate`) so the name no longer over-promises generality.
- **Debounce sibling** — `connectSignalDebounced(signal, slot, delayMs, options?)` with leading/trailing edge control. The natural partner to throttle for non-tick signals (input, resize, search).
- **`emitSignalToConnection` / single-fire helpers** removed from scope — out of canon; do not add.
- **Connection groups / scoped disconnect** — `createSignalScope()` → a `SignalScope` collecting connections, with `disconnectSignalScope(scope)` to tear them all down at once (the RxJS `Subscription.add` / libsigc++ `scoped_connection` pattern). Major ergonomic win for component teardown without tracking every handle by hand.
- **Introspection completeness** — `getSignalConnections(signal, out?)` returning the live connections into an `out` array (explicit allocation), and `isSlotConnected` retained for slot-identity checks alongside the new handle-based checks.
- **Rust parity for all of the above** — the throttle/debounce operators, the scope type (a `Vec<SignalConnection>` newtype with `disconnect_signal_scope`), deferred dispatch via a host-driven flush hook (no implicit executor — native-clean per the async/`Send` seam rule), and the pause/resume lanes. Conformance tests in the parity matrix for ordering, once-removal, pause, and re-entrancy.

---

### Gold

Authoritative / AAA — the canonical reference for a deliberately-minimal, tree-shakable signal/slot primitive. Exhaustive within the chosen scope, fully performance-tuned, fully tested and documented, 1:1 Rust parity.

- **Pooled / dense-storage dispatch path** — replace the four parallel `Array.prototype.splice` lanes with a swap-remove + tombstone (or a slotmap-style free list) so disconnect during dispatch is O(1) and emit does not realloc. Mirror the Rust crate's arena approach back into TS where it helps the hot path. Benchmark connect/emit/disconnect at 1, 10, 100, 1000 slots and commit the baseline.
- **`emitSignalCollect(signal, reducer, seed, ...args)`** — accumulator dispatch (libsigc++ `accumulator` / signal-with-return). Lets a signal gather results from slots (e.g. veto chains, hit-test votes). Requires a return-typed `CollectableSignal<T, R>` variant in `@flighthq/types`; keep strictly separate from the void-return `Signal<T>` so the common case stays zero-cost.
- **Veto / cancellation contract surfaced as data** — beyond the existing mid-dispatch `cancelSignal`, a documented `SignalCancellation` model so close-with-veto consumers (`@flighthq/application` `onCloseRequest`) compose on a shared primitive instead of ad-hoc booleans.
- **Weak / auto-disposing connections** — `connectSignalWeak(signal, slot, owner)` that auto-disconnects when `owner` is GC'd (via `WeakRef`/`FinalizationRegistry` in TS; `Weak<>` in Rust). The libsigc++ `trackable` analogue. Strictly opt-in and isolated so the registry cost never lands on the default bundle.
- **Ordering & stability formal guarantees, tested** — equal-priority insertion-order, re-entrant-emit visibility rules, deferred-flush ordering, and pause/resume position-preservation all asserted by tests, not just documented.
- **Full edge-case + misuse matrix** — disconnect-self-during-emit, disconnect-next-slot-during-emit, connect-during-emit, double-disconnect (sentinel, no throw), emit-on-disposed, pause-then-disconnect, throttle/debounce with zero/negative interval (misuse → throw), and the aliased-args cases. Every public verb has colocated `*.test.ts` (enforced by `npm run exports:check`) and a Rust `#[test]` counterpart.
- **Performance & allocation docs** — a short doc note on lazy allocation, when `data` is freed, the cost of handles vs. raw slots, and which operators allocate. Bundle-size baseline committed via `npm run size`.
- **Exhaustive Rust↔TS conformance** — every operator (throttle, debounce, scope, collect, weak, deferred) present in `flighthq-signals` with matching semantics, recorded in the conformance divergence map for any intentional gap (e.g. `WeakRef` vs `Weak<>` finalization timing is non-deterministic and must be documented as a permitted divergence, not a conformance failure).
- **Operator naming review pass** — run `npm run api signals` and confirm every exported name is globally self-identifying and carries the full type word, and that the throttle/debounce/scope family reads symmetrically.

---

## Sequencing & effort

**Recommended order**

1. **`SignalConnection` in `@flighthq/types` first** (header-layer rule). Everything handle-based depends on it. Small, but unblocks the rest. _Effort: S._
2. **Bronze handle surface** — `connectSignal` returns it, `disconnectSignalConnection`, `isSignalConnectionActive`, `connectSignalOnce`. Touches `slot.ts` + new tests; the `SignalData` layout is unchanged (handles index into existing arrays). _Effort: M._
3. **Bronze introspection + rename** — `getSignalSlotCount`/`hasSignalSlots`, `disconnectAllSignals → disconnectAllSlots`, source doc notes. Run `npm run order:fix`, `npm run exports:check`, `npm run api`. _Effort: S._
4. **Bronze Rust parity** — mirror in `flighthq-signals` before moving to Silver, so the crates stay in lockstep (the workspace already mirrors the file split). _Effort: M._
5. **Silver pause/resume + re-entrancy guarantee** — these add the `enabled` lane and harden the dispatch loop; do them together since both touch `makeDispatch`. _Effort: M._
6. **Silver operators** — generalize throttle (payload-preserving), add `connectSignalDebounced`, rename the tick variant. _Effort: M._
7. **Silver scope + deferred** — `SignalScope`, `emitSignalDeferred`. Deferred needs a flush-point decision (see below). _Effort: M._
8. **Gold** — dense storage + benchmarks, `emitSignalCollect` (new `CollectableSignal` type), weak connections, full edge-case/conformance matrix. _Effort: L, and partly optional — pursue per demand._

**Dependencies on other packages / types**

- All shared types (`SignalConnection`, `SignalScope`, `CollectableSignal`, `SignalCancellation`) must be defined in `@flighthq/types` before implementation — non-negotiable per the header-layer rule.
- `@flighthq/signals` must keep its dependency footprint minimal ("fundamental infrastructure, few dependencies"). Do **not** pull in `@flighthq/geometry`, timing utilities, or anything else; throttle/debounce should take raw `deltaTime`/`Date.now()` and not depend on a clock package.
- Consumers (`@flighthq/displayobject` via `enableDisplayObjectSignals`, `@flighthq/interaction`, `@flighthq/application` window/close-veto, `@flighthq/timeline` MovieClip signals) opt in via their own `enable*` groups — none of those should need changes for Bronze (handle return is additive). The veto contract (Gold) is the one item that should be co-designed with `@flighthq/application`'s `onCloseRequest`.

**Cross-package / design-decision items to surface to the user**

- **Deferred dispatch flush point.** `emitSignalDeferred` needs a defined flush moment. In TS the natural choice is a microtask; in Rust the seam must stay native-clean (no implicit executor — a host-driven `flushDeferredSignals()` per the async/`Send` rule). Decide whether deferred dispatch belongs in `signals` at all or is better expressed by the caller's own loop. **Surface before building Silver step 7.**
- **`this`-binding stays omitted by design.** Confirm this is intentional (free-function, C-portable philosophy) rather than a gap to close — document it, do not implement receiver binding.
- **`CollectableSignal` (Gold) is a real API-shape decision** — a return-carrying signal diverges from the strict void-return `Signal<T>` contract. Confirm the domain need (veto chains, hit-test voting) justifies the second type before adding it; otherwise leave cancellation as the only collection mechanism.
- **Weak connections (Gold)** introduce non-deterministic finalization that cannot be made bit-conformant between TS `FinalizationRegistry` and Rust `Weak<>`. This must be entered in the conformance divergence map as a permitted divergence, not chased as a parity bug.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/signals` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
