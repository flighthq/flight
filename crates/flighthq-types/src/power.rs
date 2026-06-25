//! Power value enums shared across the SDK.
//!
//! The `Power` entity, the `PowerStatus` snapshot, and the `PowerBackend` seam
//! live in [`crate::platform`]; the standalone enums they reference live here.

/// Coarse system thermal pressure as reported by a backend. `Unknown` when the
/// host does not expose a thermal reading.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum PowerThermalState {
    #[default]
    Unknown,
    Nominal,
    Fair,
    Serious,
    Critical,
}

/// Battery health detail. All numeric fields use `-1` as the "not reported"
/// sentinel, matching the rest of the power seam.
#[derive(Clone, Debug)]
pub struct PowerBatteryHealth {
    /// Fraction of original capacity still available in 0..1, or `-1`.
    pub capacity_wear_level: f32,
    /// Charge cycles consumed, or `-1`.
    pub cycle_count: i32,
    /// Coarse health classification.
    pub health_state: PowerBatteryHealthState,
    /// Battery temperature in Celsius, or `-1`.
    pub temperature_celsius: f32,
    /// Battery voltage in volts, or `-1`.
    pub voltage: f32,
}

/// Coarse battery-health classification. `Unknown` when the host does not
/// report it.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum PowerBatteryHealthState {
    #[default]
    Unknown,
    Good,
    Fair,
    Poor,
}

/// Whether the user is currently idle at a given threshold. `Unknown` when the
/// host does not expose idle detection.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum PowerIdleState {
    #[default]
    Unknown,
    Active,
    Idle,
    Locked,
}

/// Keep-awake intent. `PreventDisplaySleep` keeps the screen on; the stronger
/// `PreventAppSuspension` also keeps the app/CPU running and is native-only.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum PowerKeepAwakeMode {
    #[default]
    PreventDisplaySleep,
    PreventAppSuspension,
}
