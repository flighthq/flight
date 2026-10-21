mod power;
mod sugar;
mod types;

pub mod contract;

// Public lane: the names exported by the pinned TS `index.ts`, plus the types their signatures
// require and the D9e string tables. `initializePower` stays in `contract`.

// types
pub use contract::HostPowerBatteryHealthCapability;
pub use contract::HostPowerCapabilities;
pub use contract::HostPowerChangeCapability;
pub use contract::HostPowerIdleCapability;
pub use contract::HostPowerKeepAwakeCapability;
pub use contract::HostPowerSessionLockCapability;
pub use contract::HostPowerStatusCapability;
pub use contract::HostPowerSuspensionCapability;
pub use contract::HostPowerThermalCapability;
pub use contract::Power;
pub use contract::PowerBatteryHealth;
pub use contract::PowerBatteryHealthState;
pub use contract::PowerChangeListener;
pub use contract::PowerIdleState;
pub use contract::PowerKeepAwakeAcquireFuture;
pub use contract::PowerKeepAwakeAcquireReason;
pub use contract::PowerKeepAwakeAcquireResult;
pub use contract::PowerKeepAwakeMode;
pub use contract::PowerKeepAwakeReleaseFuture;
pub use contract::PowerKeepAwakeReleaseReason;
pub use contract::PowerKeepAwakeReleaseResult;
pub use contract::PowerStatus;
pub use contract::PowerThermalListener;
pub use contract::PowerThermalState;
pub use contract::PowerUnsubscribe;

// power — from TS index.ts exports
pub use contract::acquire_power_keep_awake;
pub use contract::attach_power;
pub use contract::create_power;
pub use contract::destroy_power_keep_awake;
pub use contract::detach_power;
pub use contract::dispose_power;
pub use contract::enable_power_signals;
pub use contract::get_power_battery_health;
pub use contract::get_power_idle_polling_interval_ms;
pub use contract::get_power_status;
pub use contract::get_power_system_idle_state;
pub use contract::get_power_system_idle_time;
pub use contract::get_power_thermal_state;
pub use contract::is_power_keep_awake_active;
pub use contract::make_power_battery_health;
pub use contract::make_power_status;
pub use contract::release_power_keep_awake;
pub use contract::set_power_idle_polling_interval_ms;

// D9e string tables
pub use contract::get_power_battery_health_state_string;
pub use contract::get_power_idle_state_string;
pub use contract::get_power_keep_awake_acquire_reason_string;
pub use contract::get_power_keep_awake_mode_string;
pub use contract::get_power_keep_awake_release_reason_string;
pub use contract::get_power_thermal_state_string;
pub use contract::parse_power_battery_health_state;
pub use contract::parse_power_idle_state;
pub use contract::parse_power_keep_awake_acquire_reason;
pub use contract::parse_power_keep_awake_mode;
pub use contract::parse_power_keep_awake_release_reason;
pub use contract::parse_power_thermal_state;
