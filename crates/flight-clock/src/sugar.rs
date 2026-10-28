//! D18 Rust conveniences for the Clock public lane. Every method delegates directly to one public
//! free-function contract; this module contains no independent Clock behavior.

use flight_entity::Ref;
use flight_signals::{FrameTick, Signal};

use crate::clock::{
    add_clock_child, advance_clock, create_child_clock, create_clock, dispose_clock,
    get_clock_effective_scale, get_clock_parent, is_clock_effectively_paused, pause_clock,
    remove_clock_child, reset_clock, resume_clock, set_clock_scale,
};
use crate::clock_signals::enable_clock_signals;
use crate::types::{Clock, ClockOptions};

#[cfg(test)]
#[path = "sugar/tests.rs"]
mod tests;

/// Sugar for the shared clock handle. Structural operations take the shared `Ref<Clock>`, so their
/// methods live on the handle, as with `FlowStackMethods`.
pub trait ClockMethods {
    fn add_child(&self, child: &Ref<Clock>);
    // flight-lint: allow(f64) the clock's f64 millisecond time and scale (see `Clock`)
    fn advance(&self, delta_time: f64);
    fn create_child(&self, options: Option<&ClockOptions>) -> Ref<Clock>;
    fn dispose(&self);
    fn remove_child(&self, child: &Ref<Clock>);
}

impl ClockMethods for Ref<Clock> {
    fn create_child(&self, options: Option<&ClockOptions>) -> Ref<Clock> {
        return create_child_clock(self, options);
    }

    fn add_child(&self, child: &Ref<Clock>) {
        add_clock_child(self, child);
    }

    // flight-lint: allow(f64) the clock's f64 millisecond time and scale (see `Clock`)
    fn advance(&self, delta_time: f64) {
        advance_clock(self, delta_time);
    }

    fn dispose(&self) {
        dispose_clock(self);
    }

    fn remove_child(&self, child: &Ref<Clock>) {
        remove_clock_child(self, child);
    }
}

impl Clock {
    /// A root clock (`create_clock`), returned as the shared handle.
    pub fn new() -> Ref<Clock> {
        return create_clock();
    }

    // flight-lint: allow(f64) the clock's f64 millisecond time and scale (see `Clock`)
    pub fn effective_scale(&self) -> f64 {
        return get_clock_effective_scale(self);
    }

    pub fn enable_signals(&mut self) -> Signal<FrameTick> {
        return enable_clock_signals(self);
    }

    pub fn is_effectively_paused(&self) -> bool {
        return is_clock_effectively_paused(self);
    }

    pub fn parent(&self) -> Option<Ref<Clock>> {
        return get_clock_parent(self);
    }

    pub fn pause(&mut self) {
        pause_clock(self);
    }

    pub fn reset(&mut self) {
        reset_clock(self);
    }

    pub fn resume(&mut self) {
        resume_clock(self);
    }

    // flight-lint: allow(f64) the clock's f64 millisecond time and scale (see `Clock`)
    pub fn set_scale(&mut self, scale: f64) {
        set_clock_scale(self, scale);
    }
}
