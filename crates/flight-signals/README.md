# flight-signals

Signal-slot event system (D4): typed payloads, priority-ordered slots, id-based connections, scopes, and explicit-timer throttles.

## Precision

- `FrameTick.delta_time`, `SignalTimer.fire_at_ms`, `SignalTimerState.now_ms`, and the debounce/throttle/frame-rate delays are `f64`: they are millisecond durations accumulated across frames, where `f32` loses precision (D1).
