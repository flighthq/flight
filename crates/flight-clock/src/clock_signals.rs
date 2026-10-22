use flight_signals::{FrameTick, Signal, create_signal};

use crate::types::Clock;

#[cfg(test)]
mod sugar_tests {
    use std::sync::Arc;

    use super::*;
    use crate::clock::create_clock;

    #[test]
    fn clock_enable_signals_matches_enable_clock_signals() {
        let a = create_clock();
        let b = create_clock();
        let sa = a.write().unwrap().enable_signals();
        let sb = enable_clock_signals(&mut b.write().unwrap());
        assert!(Arc::ptr_eq(
            &sa.data,
            &a.read().unwrap().on_tick.as_ref().unwrap().data
        ));
        assert!(Arc::ptr_eq(
            &sb.data,
            &b.read().unwrap().on_tick.as_ref().unwrap().data
        ));
        assert!(Arc::ptr_eq(
            &a.write().unwrap().enable_signals().data,
            &sa.data
        ));
    }
}

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

impl Clock {
    pub fn enable_signals(&mut self) -> Signal<FrameTick> {
        return enable_clock_signals(self);
    }
}
