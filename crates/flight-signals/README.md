# flight-signals

Signal-slot event system (D4): typed payloads, priority-ordered slots, id-based connections, scopes, and explicit-timer throttles.

`Signal.emit` is a required callback in a mutable `Ref` cell. Creation installs the native D4 dispatcher; ordinary emission clones the callback and releases the cell lock before calling it. Safe emission walks its own slot snapshot, as in the source, and bypasses custom emitters.

A signal clone copies the current callback value into a fresh cell, shares slot data and slot IDs, and receives a fresh Entity runtime. This models source spread copies: replacing a wrapper's emitter leaves the original emitter independent while both retain the same signal data. Clearing and reconnecting can replace the emitter through a shared signal reference. Native callbacks retain owned signal data, so signal construction and initialization require `T: 'static`; payload references can still be borrowed for each emission.

## Precision

- `FrameTick.delta_time`, `SignalTimer.fire_at_ms`, `SignalTimerState.now_ms`, and the debounce/throttle/frame-rate delays are `f64`: they are millisecond durations accumulated across frames, where `f32` loses precision (D1).
