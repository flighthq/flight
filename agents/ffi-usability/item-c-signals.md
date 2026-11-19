# Item C: Connect to signals from C

Design: `agents/ffi-usability.md` section 2d.

## Goal

A C consumer can listen to SDK events and tear the listener down without leaking or dangling. Proves scenario G4. OpenFL's event model depends on this entirely.

## The defect

`connect_signal<T: 'static>(signal: &Signal<T>, slot: SignalSlot<T>, options)` in `crates/flight-signals/src/slot.rs` is generic, so no connect wrapper is generated. `flight_disconnect_signal_connection` and `flight_disconnect_signal_scope` are generated but there is nothing to disconnect. The one retained callback that works today is `connect_signal_at_frame_rate`, which returns an `FfiDisposer` (`build.rs` near lines 466 and 3030).

## What to build

1. **Inventory.** List every payload type `T` that appears as `Signal<T>` on a public field or public function in the scanned crates, with counts. Commit it as a generated artifact so a new payload type is noticed.
2. **Declared instantiations.** Emit one connect wrapper per payload type, named for the payload (`flight_connect_unit_signal`, `flight_connect_pointer_event_signal`, and so on). The set comes from the inventory; a payload the callback contract cannot carry is a named policy skip with a reason, not a silent omission.
3. **Callback contract.** Each connect takes:
   - `fn`: `extern "C" fn(ctx, payload…)`, payload lowered by the existing Task M callback rules (scalars, `&Ref<T>` as a borrowed handle — a `FlightNode*` for node payloads once Item B lands — `&PlainStruct`, scalar slices);
   - `ctx`: `void*`;
   - `release`: `extern "C" fn(ctx)`, nullable.
     It returns an owned connection handle.
4. **Teardown, exactly once.** `release(ctx)` is called exactly once: when the connection is disconnected, when the connection handle is freed while still connected, or when the signal itself is dropped, whichever comes first. After release the callback is never invoked. Borrowed handles passed to the callback are valid only for the duration of the call; say so in the header.
5. **Unify with the existing disposer.** `connect_signal_at_frame_rate` and these wrappers should share one teardown mechanism. If the existing `FfiDisposer` contract (call disposer, release context, free disposer) is kept for that function, document why two contracts exist; preferably move it to the same release-callback contract.
6. **Options and priority.** Expose `SignalConnectOptions` (priority, once, and whatever else it carries) so listener ordering and one-shot listeners work as in the SDK.
7. **Reaching a signal.** Confirm with Item A's graph that the signal carriers themselves are producible: a consumer needs a way from a node handle to its signals (for example after `enable_node2d_signals`). List any signal that is declared public but has no producer path, and close the gap or report it.
8. **Threading.** State the contract in the header: callbacks run on the thread that emits. The only SDK-spawned thread is in `flight-signals/src/throttle.rs`; say whether any generated connect can be invoked from it.

## Tests

- Rust tests: connect, emit, callback observed with correct payload; disconnect then emit, not observed; release called once on each of the three teardown paths; `once` option; priority ordering of two listeners.
- Strict-C scenario **G4**: enable signals on a node, connect a listener with a heap context, dispatch synthetic pointer input through the SDK's input path so the node's pointer signal fires, observe the callback, disconnect, assert the release ran once. Under the address sanitizer.

## Not in scope

- Emitting signals from C beyond what is already generated.
- Bindgen (Item H).
- Any other retained-callback API. If the inventory work turns up others in the same state, list them in the review.

## Acceptance

- G4 passes under the sanitizer.
- Item A's baseline no longer lists signal-connection carriers as unproducible.
- The payload inventory is committed and a test fails when a new public payload type has neither a wrapper nor a policy.
- `cargo fmt`, lint, existing FFI tests pass; census pins updated with the delta explained.

## Dependencies

Item A. The G4 test needs Item B's node handle; the generator work does not, and can start in parallel.
