//! `flighthq-haptics` — haptic feedback over a swappable backend.
//!
//! Ports the TypeScript `@flighthq/haptics` package. Each trigger returns
//! `false` when the host lacks haptics or denies the request rather than
//! panicking. There is always a backend: a lazily-created in-box default
//! no-ops and returns `false` until a native host installs a real one via
//! [`set_haptics_backend`].

pub mod haptics;

pub use haptics::{
    cancel_device_vibration, create_default_haptics_backend, get_haptics_backend,
    get_haptics_capabilities, is_haptics_supported, prepare_haptics, set_haptics_backend,
    trigger_haptic_impact, trigger_haptic_notification, trigger_haptic_selection, vibrate_device,
    vibrate_device_pattern, vibrate_device_waveform,
};
