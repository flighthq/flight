# TS↔Rust Alignment: @flighthq/signals

**Verdict:** Near-perfect alignment — all 8 public TS exports map 1:1 (camelCase→snake_case, full type words preserved) with matching filenames; the only drift is one extra Rust convenience function (`connect_signal_once`) that should be either removed or recorded in the divergence map.

## Name map findings

| TS symbol / file | Rust symbol / file | Issue |
| --- | --- | --- |
| `cancelSignal` (emitter.ts) | `cancel_signal` (emitter.rs) | OK |
| `connectSignal` (slot.ts) | `connect_signal` (slot.rs) | OK — Rust signature keeps `SignalConnectOptions { once, priority }`, matching the TS options object. |
| `connectSignalAtRate` (throttle.ts) | `connect_signal_at_rate` (throttle.rs) | OK |
| `createSignal` (signal.ts) | `create_signal` (signal.rs) | OK |
| `disconnectAllSignals` (slot.ts) | `disconnect_all_signals` (slot.rs / emitter.rs) | OK |
| `disconnectSignal` (slot.ts) | `disconnect_signal` (slot.rs) | OK |
| `emitSignal` (emitter.ts) | `emit_signal` (emitter.rs) | OK |
| `isSlotConnected` (slot.ts) | `is_slot_connected` (emitter.rs) | OK |
| _(none)_ | `connect_signal_once` (slot.rs, re-exported from lib.rs) | **Extra Rust public function, no TS counterpart.** TS expresses once-firing through `connectSignal(sig, slot, { once: true })`; Rust already does too (`connect_signal` takes `SignalConnectOptions` with `once`), so this is a redundant convenience wrapper. Either remove it or add a divergence-map entry with a rationale. |
| `nullSignalEmit` (internal.ts) | _(none — no `internal.rs`)_ | Not a flag. `nullSignalEmit` is **not** publicly exported (absent from `index.ts`); it is a TS-only hot-path stub assigned to the callable `signal.emit` field when no listeners are connected. Rust's `Signal<T>` uses a different internal representation (an `emitter` holding a callback list, no hot `emit` field), so the stub has no Rust equivalent by design. Internal-representation difference, invisible to the conformance script. |

Supporting Rust-only public items (`SignalEmitter`, `SlotId`, `SlotGuard`, `SignalCallback`, `SignalConnectOptions`) are Rust-idiom plumbing (RAII guard, callback alias, id newtype) rather than ported TS functions; they are expected and not drift. `SignalConnectOptions` fields match TS 1:1 (`once`, `priority`).

## In sync

- Package→crate name is identity: `@flighthq/signals` → `flighthq-signals`. No undocumented rename.
- All 8 TS public functions ported; conformance script reports `signals 8 | 8 | 22 | 0` (8 exports, 8 ported, 22 Rust functions counted, 0 missing).
- Naming conventions hold throughout: camelCase→snake_case, no abbreviation of type words (`connectSignalAtRate` → `connect_signal_at_rate`, `disconnectAllSignals` → `disconnect_all_signals`).
- File-name tracking is clean: `emitter.ts`↔`emitter.rs`, `signal.ts`↔`signal.rs`, `slot.ts`↔`slot.rs`, `throttle.ts`↔`throttle.rs`.
- Teardown/lifecycle vocabulary preserved: `disconnect*`/`cancel*` carry across; Rust adds the idiomatic `SlotGuard` (drop = auto-disconnect) without changing the TS verb set.
- `SignalConnectOptions` lives in `@flighthq/types` (header layer) on the TS side and is mirrored as a Rust struct with identical fields.
- The divergence map has no `signals` per-function entries and none are needed except the one recommended below — no stale entries observed.

## Divergence-map recommendation

Add one entry for `connect_signal_once`: either delete the wrapper (preferred — keeps the surface 1:1, callers use `connect_signal(.., SignalConnectOptions { once: true, .. })`) or, if kept as an ergonomic Rust affordance, record it in the conformance divergence map with the rationale "Rust convenience wrapper over `connect_signal` + `once`; no TS counterpart by intent." Currently it is silent drift.
