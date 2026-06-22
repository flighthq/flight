//! `flighthq-power` — battery level, charging state, low-power signals, and
//! screen keep-awake over a swappable backend.
//!
//! The [`Power`] entity holds five signals: `on_change`, `on_charging`,
//! `on_discharging`, `on_suspend`, and `on_resume`. Call [`attach_power`] to
//! start delivery; call [`detach_power`] or [`dispose_power`] to stop it. The
//! active backend defaults to a no-op stub that reports `battery_level = -1`
//! and `is_charging = false`; a native host installs its own via
//! [`set_power_backend`].

pub mod power;

pub use power::{
    attach_power, create_power, create_power_status, detach_power, dispose_power,
    get_power_backend, get_power_status, set_power_backend, set_power_keep_awake,
};
