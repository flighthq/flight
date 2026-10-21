use std::fmt;

use flight_entity::{EntityRuntimeSlot, Ref};
use flight_signals::{FrameTick, Signal};

/// The shared time primitive (TS `Clock extends Entity`): a node in a clock tree that turns a real
/// per-frame delta into scaled, pausable time. Driven by whoever owns the frame loop via
/// `advance_clock` on the root; time-driven consumers read `delta_time`/`elapsed` instead of a raw
/// delta. Scale and pause compose down the tree: a child's effective rate is the product of its own
/// and every ancestor's scale, and any paused ancestor freezes the whole subtree. Times are in
/// milliseconds.
///
/// Shared identity (A2): clocks are held as `Ref<Clock>`, and parent links are strong, as in TS.
/// `dispose_clock` breaks the parent/child cycle.
// flight-lint: allow(f64) clock times are f64 milliseconds: `on_tick` carries flight-signals' `FrameTick` (f64 ms, so it plugs into connect_signal_at_frame_rate as in TS), and `elapsed` accumulates across a session, where f32 stops resolving 1 ms steps after 2^24 ms (about 4.7 hours); `scale` multiplies that f64 delta
#[derive(Clone, Default)]
pub struct Clock {
    runtime: EntityRuntimeSlot,
    /// Local time scale applied to the incoming delta (1 = realtime, 0.5 = half speed, 2 = double).
    pub scale: f64,
    /// When true, this clock and its whole subtree receive a zero delta while advancing.
    pub paused: bool,
    /// Scaled milliseconds from the most recent `advance_clock` pass.
    pub delta_time: f64,
    /// Accumulated scaled milliseconds since creation or the last `reset_clock`.
    pub elapsed: f64,
    /// Parent whose scaled delta feeds this clock, or None for a root. Set via `add_clock_child` /
    /// `create_child_clock` / `remove_clock_child`; do not reassign directly.
    pub parent: Option<Ref<Clock>>,
    /// Child clocks advanced from this clock's scaled delta, in attach order. Managed via
    /// `add_clock_child` / `remove_clock_child`; do not mutate directly.
    pub children: Vec<Ref<Clock>>,
    /// Opt-in per-advance signal carrying the scaled delta; None until `enable_clock_signals`.
    pub on_tick: Option<Signal<FrameTick>>,
}

/// Initial configuration for `create_clock` / `create_child_clock` (TS `ClockOptions`). Both fields
/// are optional; a clock defaults to realtime and running (scale 1, not paused).
// flight-lint: allow(f64) `scale` multiplies the clock's f64 millisecond delta (see `Clock`)
#[derive(Clone, Debug, Default, PartialEq)]
pub struct ClockOptions {
    pub scale: Option<f64>,
    pub paused: Option<bool>,
}

// flight-lint: allow(sugar-delegates) trait boilerplate: the parent/child graph is cyclic, so Debug reports the parent's presence and the child count instead of recursing into the tree
impl fmt::Debug for Clock {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("Clock")
            .field("scale", &self.scale)
            .field("paused", &self.paused)
            .field("delta_time", &self.delta_time)
            .field("elapsed", &self.elapsed)
            .field("has_parent", &self.parent.is_some())
            .field("children", &self.children.len())
            .field("on_tick", &self.on_tick.is_some())
            .finish();
    }
}

flight_entity::impl_entity!(Clock);
