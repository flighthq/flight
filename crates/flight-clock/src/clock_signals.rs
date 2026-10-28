//! flight-compiler: target-native

use flight_signals::{FrameTick, Signal, create_signal};

use crate::types::Clock;

/// Opts the clock into the `on_tick` signal, allocating it on first call and returning it
/// (idempotent: a second call returns the same signal, sharing identity). `on_tick` emits the
/// clock's scaled delta on every advance as a `FrameTick`, so it plugs straight into signals' rate
/// helpers, e.g. `connect_signal_at_frame_rate(&on_tick, 30.0, slot)`. Clocks that never call this
/// keep `on_tick` None and pay no signal allocation or dispatch cost.
pub fn enable_clock_signals(clock: &mut Clock) -> Signal<FrameTick> {
    if clock.on_tick.is_none() {
        clock.on_tick = Some(create_signal());
    }
    return clock.on_tick.clone().unwrap();
}
