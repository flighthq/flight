//! Strictly-typed signals and slots for event dispatching.
//!
//! Signals support multiple listeners, priority ordering, and cancellation.
//! A [`Signal<T>`] carries a single payload `T` to each listener as `&T` — a
//! named event struct (preferred for built-in dispatches), a tuple, a
//! primitive, or `()` for a pure notification. Connections are kept alive by
//! [`SlotGuard`] values returned from [`connect_signal`]; dropping a guard
//! automatically disconnects the slot.
//!
//! # Quick start
//!
//! ```rust
//! use std::sync::Arc;
//! use flighthq_signals::{Signal, connect_signal, emit_signal, SignalConnectOptions};
//!
//! let sig: Signal<i32> = Signal::new();
//! let _guard = connect_signal(
//!     &sig,
//!     Arc::new(|v: &i32| println!("got {v}")),
//!     Default::default(),
//! );
//! emit_signal(&sig, &42); // prints "got 42"
//! // _guard dropped here → slot disconnects
//! ```

pub mod emitter;
pub mod signal;
pub mod slot;
pub mod throttle;

pub use emitter::{
    SignalCallback, SignalConnectOptions, SlotId, cancel_signal, disconnect_all_signals,
    emit_signal, is_slot_connected,
};
pub use signal::{Signal, create_signal};
pub use slot::{SlotGuard, connect_signal, connect_signal_once, disconnect_signal};
pub use throttle::connect_signal_at_rate;
