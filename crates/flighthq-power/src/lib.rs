//! `flighthq-power` — battery level, charging state, low-power/thermal/idle
//! signals, and screen keep-awake over a swappable backend.
//!
//! The [`Power`] entity holds ten signals: `on_change`, `on_charging`,
//! `on_discharging`, `on_idle_state_change`, `on_lock_screen`,
//! `on_low_power_mode_change`, `on_resume`, `on_suspend`,
//! `on_thermal_state_change`, and `on_unlock_screen`. Call [`attach_power`] to
//! start delivery; call [`detach_power`] or [`dispose_power`] to stop it. The
//! active backend defaults to a no-op stub that reports `battery_level = -1`
//! and `is_charging = false`; a native host installs its own via
//! [`set_power_backend`].

pub mod power;

pub use power::{
    attach_power, create_power, create_power_battery_health, create_power_status, detach_power,
    dispose_power, get_power_backend, get_power_battery_health, get_power_idle_polling_interval_ms,
    get_power_status, get_power_system_idle_state, get_power_system_idle_time,
    get_power_thermal_state, has_power_keep_awake, set_power_backend,
    set_power_idle_polling_interval_ms, set_power_keep_awake,
};
