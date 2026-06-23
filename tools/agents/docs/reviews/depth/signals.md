# Depth Review: @flighthq/signals

**Domain:** Strictly-typed signals and slots — a typed observer / event-dispatch primitive (multi-listener notification with priority ordering, cancellation, and one-shot connections).

**Verdict:** solid — 72/100

`@flighthq/signals` is a clean, complete, tree-shakable implementation of the _core_ signal/slot contract. For its declared role — "fundamental infrastructure with few dependencies" that other packages opt into via `enable*` functions — it covers the canonical mechanics (connect, disconnect, emit, priority, once, cancel, connected-check) without bloat. It is not a stub. What keeps it from "authoritative" is the absence of several features that mature signal libraries (Robert Penner's AS3-Signals, deecewan/signals, libsigc++, Qt signals, mitt/nanoevents) treat as table stakes: connection handle objects, listener context/`this` binding, deferred/async dispatch, one-time `connectOnce` ergonomics surfaced as a first-class verb, and a dispatch-count / listener-count introspection surface.

## Present capabilities

The exported surface (per `npm run api signals`):

- **`createSignal<T>()`** — allocates an empty `Signal<T>` (`data: null`, no-op `emit`). Lazy: no slot arrays allocated until the first connect.
- **`connectSignal(signal, slot, options?)`** — adds a slot. Options are `priority` (number, higher fires first) and `once` (boolean). Insertion is priority-ordered via linear scan.
- **`disconnectSignal(signal, slot)`** — removes all instances of a slot; frees `data` back to `null` when the last slot leaves.
- **`disconnectAllSignals(signal)`** — clears every slot and resets to the empty state.
- **`isSlotConnected(signal, slot)`** — boolean membership check.
- **`emitSignal(signal, ...args)`** — typed dispatch; thin wrapper over `signal.emit`.
- **`cancelSignal(signal)`** — sets the `cancelled` flag so the in-flight dispatch loop stops after the current slot (the AS3-Signals `halt`/Qt `disconnect`-during-emit analogue).
- **`connectSignalAtRate(source, fps, slot)`** — a throttle/rate-limiter that accumulates `deltaTime` and fires at a target FPS; returns a cleanup closure.

Design quality is high for the style this codebase mandates:

- **Lazy allocation** — `data` is `null` until first connect and is released again on last disconnect; emitting an empty signal is a real no-op (`nullSignalEmit`), not a guarded branch. Good for the "thousands of nodes, few wired" case.
- **Safe mutation during dispatch** — `makeDispatch` walks by index and splices `once`/cancelled slots in place; `cancelled` is reset at the top of each emit. This is the genuinely hard part of a signal library and it is handled correctly.
- **Strict typing** — `Signal<T extends (...args) => void>` carries the slot signature; `emitSignal` enforces `Parameters<T>`. The type lives in `@flighthq/types` (the header layer), as the project rules require.
- **Tree-shakable, free-function shape** — no class, `sideEffects: false`, single root barrel. Matches the C/C++-portable intent.
- Tests are colocated and cover priority ordering, once-removal, cancel semantics, rate accumulation/remainder, and the empty-signal path.

## Gaps vs an authoritative signals library

Measured against canonical signal/slot libraries (AS3-Signals, libsigc++, Qt, RxJS-lite observers, mitt/nanoevents, EventEmitter-with-priority):

- **No connection-handle / binding object.** Disconnection is by slot _identity_ only. Canonical libraries return a binding (AS3-Signals `SignalBinding`, RxJS `Subscription`, libsigc++ `connection`) that the caller holds to `disconnect()`, pause, or inspect. Without it: you cannot disconnect an anonymous inline closure (you must keep the reference yourself), cannot connect the _same_ function twice as distinct listeners, and `disconnectSignal` removing _all_ matching instances is a side effect of that limitation. `connectSignalAtRate` already returns a cleanup closure, hinting the binding pattern is wanted — but the core connect does not. This is the single biggest gap.
- **No first-class `once` verb.** `once` exists only as an option flag. AS3-Signals/Node/Qt all expose `addOnce`/`once`/`connectOnce` as a named function. Minor ergonomic/grepability gap given this codebase's "globally self-identifying function name" rule.
- **No listener/dispatch introspection.** No `getSlotCount` / `hasSlots` / `getSignalListenerCount`. Mature libraries expose `numListeners` (AS3-Signals) or `empty()` (libsigc++) so hot paths can skip building an event payload when nobody is listening. Here a caller must reach into `signal.data` (internal) to know.
- **No `this`/context binding for slots.** Method-as-slot must be pre-bound by the caller. libsigc++/Qt/AS3-Signals bind a receiver. Arguably _missing-by-design_ given the free-function, C-portable philosophy (no `this`), but it is a real divergence from the domain canon and worth stating as deliberate.
- **No deferred / async / queued dispatch.** Emit is strictly synchronous and re-entrant. There is no `emitSignalDeferred` (next-microtask) and no guard against re-entrant emit (a slot that emits the same signal). Qt's queued connections and RxJS schedulers are the canonical comparison; for a game/render loop synchronous-only is defensible, but re-entrancy safety is not documented.
- **No pause/resume or enable/disable on a connection** (AS3-Signals `enabled`, libsigc++ `block()`).
- **Throttle is the only temporal operator.** `connectSignalAtRate` is a rate-limiter but there is no debounce, no `connectSignalOnce`-with-timeout, no leading/trailing edge control. The throttle also drops the latest payload (it forwards accumulated `elapsed`, not the source args), so it is specialized to the `(deltaTime) => void` frame-tick signal and would not faithfully throttle a payload-carrying signal — narrower than a general throttle operator.
- **No priority stability guarantee documented.** Equal-priority slots fire in insertion order (the scan inserts only when `priority > existing`), which is correct and standard, but it is undocumented behavior a consumer should be able to rely on.

## Naming / API-shape notes

- Naming is consistent and self-identifying: `createSignal`, `connectSignal`, `disconnectSignal`, `emitSignal`, `cancelSignal`, `isSlotConnected` all carry the full type word. Good.
- **`disconnectAllSignals` is mis-numbered.** It operates on one signal (clears all of _that signal's slots_), so the canonical name is `disconnectAllSlots` or `clearSignal`. The plural "Signals" reads as "disconnect many signals," which it does not do. This is the one outright naming error.
- `connectSignalAtRate` lives in the signals package but is really a frame-loop operator coupled to a `(deltaTime) => void` shape. It fits the barrel, but its specialization (forwards accumulated time, not source args) makes it more of a tick-throttle than a general signal throttle; the name promises more generality than it delivers.
- `cancelSignal` is well chosen (matches the cancellation contract called out in the codebase rules) but its scope — only valid mid-dispatch — is implicit; a doc note would help.
- The `Signal`/`SignalData` shape being plain data in `@flighthq/types` (slots/priorities/repeat as parallel arrays) is idiomatic for the project and Rust-portable. The parallel-array layout is a fine internal choice and correctly kept out of the public verbs.

## Recommendation

Treat the current package as a strong core and close the depth gaps that the domain expects, prioritizing the ones the codebase's own rules already lean toward:

1. **Return a connection handle from `connectSignal`** (or add `connectSignalHandle`) so anonymous closures can be disconnected, the same function can connect twice, and pause/resume becomes possible. This is the defining feature that separates a "solid" signal from an authoritative one. `connectSignalAtRate` already demonstrates the returned-cleanup pattern.
2. **Add introspection:** `getSignalSlotCount(signal)` / `hasSignalSlots(signal)` so hot paths skip payload construction without touching internal `data`.
3. **Add a named `connectSignalOnce` verb** mirroring the canonical `addOnce`, keeping `once` option for symmetry.
4. **Rename `disconnectAllSignals` → `disconnectAllSlots`** (pre-release, no consumers — exactly the time to fix it).
5. **Document the deliberate omissions** as missing-by-design where they are: no `this`-binding (free-function philosophy), synchronous-only dispatch (render-loop intent). State re-entrancy and equal-priority ordering guarantees explicitly.
6. Consider generalizing throttle (payload-preserving) and adding a debounce sibling if non-tick signals ever need rate control; otherwise rename to reflect its frame-tick specialization.

Items 1–4 would move this to "authoritative" for a deliberately minimal, tree-shakable signal/slot library; the rest are polish and explicit-design documentation.
