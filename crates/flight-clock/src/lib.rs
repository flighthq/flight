mod clock;
mod clock_signals;
mod types;

pub mod contract;

// Public lane: the 14 functions the pinned TS `index.ts` names, plus the types their signatures
// require and the D18 handle trait. `initialize_clock` stays in `contract`.
pub use contract::Clock;
pub use contract::ClockMethods;
pub use contract::ClockOptions;
pub use contract::add_clock_child;
pub use contract::advance_clock;
pub use contract::create_child_clock;
pub use contract::create_clock;
pub use contract::dispose_clock;
pub use contract::enable_clock_signals;
pub use contract::get_clock_effective_scale;
pub use contract::get_clock_parent;
pub use contract::is_clock_effectively_paused;
pub use contract::pause_clock;
pub use contract::remove_clock_child;
pub use contract::reset_clock;
pub use contract::resume_clock;
pub use contract::set_clock_scale;
