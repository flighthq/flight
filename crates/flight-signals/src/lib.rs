mod connection;
mod emitter;
mod internal;
mod safe;
mod scope;
mod signal;
mod slot;
mod throttle;
mod types;

pub mod contract;

// Public lane: the names exported by the pinned TS `index.ts`, plus the Rust types and their
// constructors that the public signatures require. Contract-only seams (initialize_*, the
// internal null emit, string/debug helpers) stay in `contract`.
pub use contract::advance_signal_timers;
pub use contract::cancel_signal;
pub use contract::clear_signal;
pub use contract::clear_signal_timeout;
pub use contract::connect_signal;
pub use contract::connect_signal_at_frame_rate;
pub use contract::connect_signal_debounced;
pub use contract::connect_signal_throttled;
pub use contract::connect_signal_tracked;
pub use contract::create_signal;
pub use contract::create_signal_scope;
pub use contract::create_signal_timer_state;
pub use contract::disconnect_signal;
pub use contract::disconnect_signal_connection;
pub use contract::disconnect_signal_scope;
pub use contract::emit_signal;
pub use contract::emit_signal_safe;
pub use contract::has_signal_slots;
pub use contract::is_signal_connection_connected;
pub use contract::is_signal_connection_paused;
pub use contract::is_slot_connected;
pub use contract::pause_signal_connection;
pub use contract::resume_signal_connection;
pub use contract::set_signal_timeout;

pub use contract::FrameTick;
pub use contract::Signal;
pub use contract::SignalConnectOptions;
pub use contract::SignalConnection;
pub use contract::SignalData;
pub use contract::SignalScope;
pub use contract::SignalSlot;
pub use contract::SignalThrottleOptions;
pub use contract::SignalTimerState;
pub use contract::SignalTrackedConnectOptions;
pub use contract::SlotId;
pub use contract::TimerId;
