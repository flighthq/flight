use std::any::Any;
use std::fmt;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Weak};

use flight_entity::EntityRuntimeSlot;
use flight_signals::Signal;

pub use flight_hostcapability::ProviderRef;

pub struct PowerContext {
    pub(crate) destroyed: Vec<Weak<dyn Any + Send + Sync>>,
    pub(crate) idle_polling_interval_ms: f32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PowerBatteryHealthState {
    Good,
    Fair,
    Poor,
    Unknown,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PowerBatteryHealth {
    pub capacity_wear_level: f32,
    pub cycle_count: i32,
    pub health_state: PowerBatteryHealthState,
    pub temperature_celsius: f32,
    pub voltage: f32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PowerIdleState {
    Active,
    Idle,
    Unknown,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PowerKeepAwakeAcquireReason {
    Ok,
    Unavailable,
    Denied,
    Failed,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PowerKeepAwakeAcquireResult {
    pub reason: PowerKeepAwakeAcquireReason,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PowerKeepAwakeMode {
    PreventDisplaySleep,
    PreventAppSuspension,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PowerKeepAwakeReleaseReason {
    Ok,
    Inactive,
    Failed,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PowerKeepAwakeReleaseResult {
    pub reason: PowerKeepAwakeReleaseReason,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PowerStatus {
    pub battery_level: f32,
    pub charging_time: f32,
    pub discharging_time: f32,
    pub is_battery_low: bool,
    pub is_charging: bool,
    pub is_low_power: bool,
    pub is_on_battery: bool,
    pub thermal_state: PowerThermalState,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PowerThermalState {
    Nominal,
    Fair,
    Serious,
    Critical,
    Unknown,
}

pub type PowerChangeListener = Arc<dyn Fn() + Send + Sync>;
pub type PowerUnsubscribe = Arc<dyn Fn() + Send + Sync>;
pub type PowerThermalListener = Arc<dyn Fn(PowerThermalState) + Send + Sync>;

pub type PowerKeepAwakeAcquireFuture = Pin<Box<dyn Future<Output = PowerKeepAwakeAcquireResult> + Send>>;
pub type PowerKeepAwakeReleaseFuture = Pin<Box<dyn Future<Output = PowerKeepAwakeReleaseResult> + Send>>;

#[derive(Clone)]
pub struct HostPowerBatteryHealthCapability {
    pub get_battery_health: Arc<dyn Fn(&mut PowerBatteryHealth) -> PowerBatteryHealth + Send + Sync>,
}

#[derive(Clone)]
pub struct HostPowerChangeCapability {
    pub subscribe: Arc<dyn Fn(PowerChangeListener) -> PowerUnsubscribe + Send + Sync>,
}

#[derive(Clone)]
pub struct HostPowerIdleCapability {
    pub get_idle_state: Arc<dyn Fn(f32) -> PowerIdleState + Send + Sync>,
    pub get_idle_time_seconds: Arc<dyn Fn() -> f32 + Send + Sync>,
}

#[derive(Clone)]
pub struct HostPowerKeepAwakeCapability {
    pub acquire: Arc<dyn Fn(PowerKeepAwakeMode) -> PowerKeepAwakeAcquireFuture + Send + Sync>,
    pub destroy: Option<Arc<dyn Fn() + Send + Sync>>,
    pub is_active: Arc<dyn Fn() -> bool + Send + Sync>,
    pub provider: ProviderRef,
    pub release: Arc<dyn Fn() -> PowerKeepAwakeReleaseFuture + Send + Sync>,
}

#[derive(Clone)]
pub struct HostPowerSessionLockCapability {
    pub subscribe_lock: Arc<dyn Fn(PowerChangeListener) -> PowerUnsubscribe + Send + Sync>,
    pub subscribe_unlock: Arc<dyn Fn(PowerChangeListener) -> PowerUnsubscribe + Send + Sync>,
}

#[derive(Clone)]
pub struct HostPowerStatusCapability {
    pub get_status: Arc<dyn Fn(&mut PowerStatus) -> PowerStatus + Send + Sync>,
}

#[derive(Clone)]
pub struct HostPowerSuspensionCapability {
    pub subscribe_resume: Arc<dyn Fn(PowerChangeListener) -> PowerUnsubscribe + Send + Sync>,
    pub subscribe_suspend: Arc<dyn Fn(PowerChangeListener) -> PowerUnsubscribe + Send + Sync>,
}

#[derive(Clone)]
pub struct HostPowerThermalCapability {
    pub get_thermal_state: Arc<dyn Fn() -> PowerThermalState + Send + Sync>,
    pub subscribe_thermal_state_change: Arc<dyn Fn(PowerThermalListener) -> PowerUnsubscribe + Send + Sync>,
}

#[derive(Clone, Default)]
pub struct HostPowerCapabilities {
    pub battery_health: Option<HostPowerBatteryHealthCapability>,
    pub change: Option<HostPowerChangeCapability>,
    pub idle: Option<HostPowerIdleCapability>,
    pub keep_awake: Option<HostPowerKeepAwakeCapability>,
    pub session_lock: Option<HostPowerSessionLockCapability>,
    pub status: Option<HostPowerStatusCapability>,
    pub suspension: Option<HostPowerSuspensionCapability>,
    pub thermal: Option<HostPowerThermalCapability>,
}

pub struct Power {
    runtime: EntityRuntimeSlot,
    pub on_change: Option<Signal<PowerStatus>>,
    pub on_charging: Option<Signal<()>>,
    pub on_discharging: Option<Signal<()>>,
    pub on_idle_state_change: Option<Signal<()>>,
    pub on_lock_screen: Option<Signal<()>>,
    pub on_resume: Option<Signal<()>>,
    pub on_suspend: Option<Signal<()>>,
    pub on_thermal_state_change: Option<Signal<PowerThermalState>>,
    pub on_unlock_screen: Option<Signal<()>>,
    pub(crate) subscriptions: Option<Vec<PowerUnsubscribe>>,
}

impl Default for PowerBatteryHealthState {
    fn default() -> Self {
        return PowerBatteryHealthState::Unknown;
    }
}

impl Default for PowerIdleState {
    fn default() -> Self {
        return PowerIdleState::Unknown;
    }
}

impl Default for PowerKeepAwakeMode {
    fn default() -> Self {
        return PowerKeepAwakeMode::PreventDisplaySleep;
    }
}

impl Default for PowerThermalState {
    fn default() -> Self {
        return PowerThermalState::Unknown;
    }
}

impl Default for Power {
    fn default() -> Self {
        return Power {
            runtime: EntityRuntimeSlot::default(),
            on_change: None,
            on_charging: None,
            on_discharging: None,
            on_idle_state_change: None,
            on_lock_screen: None,
            on_resume: None,
            on_suspend: None,
            on_thermal_state_change: None,
            on_unlock_screen: None,
            subscriptions: None,
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: clone shares signals (identity, as TS) but not subscriptions
impl Clone for Power {
    fn clone(&self) -> Self {
        return Power {
            runtime: EntityRuntimeSlot::default(),
            on_change: self.on_change.clone(),
            on_charging: self.on_charging.clone(),
            on_discharging: self.on_discharging.clone(),
            on_idle_state_change: self.on_idle_state_change.clone(),
            on_lock_screen: self.on_lock_screen.clone(),
            on_resume: self.on_resume.clone(),
            on_suspend: self.on_suspend.clone(),
            on_thermal_state_change: self.on_thermal_state_change.clone(),
            on_unlock_screen: self.on_unlock_screen.clone(),
            subscriptions: None,
        };
    }
}

// flight-lint: allow(sugar-delegates) trait boilerplate: subscriptions are closures, Debug reports whether attached
impl fmt::Debug for Power {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        return f
            .debug_struct("Power")
            .field("on_change", &self.on_change)
            .field("on_charging", &self.on_charging)
            .field("on_discharging", &self.on_discharging)
            .field("on_idle_state_change", &self.on_idle_state_change)
            .field("on_lock_screen", &self.on_lock_screen)
            .field("on_resume", &self.on_resume)
            .field("on_suspend", &self.on_suspend)
            .field("on_thermal_state_change", &self.on_thermal_state_change)
            .field("on_unlock_screen", &self.on_unlock_screen)
            .field("attached", &self.subscriptions.is_some())
            .finish();
    }
}

flight_entity::impl_entity!(Power);
