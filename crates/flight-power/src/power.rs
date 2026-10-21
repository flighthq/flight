use std::sync::{Arc, Mutex, Weak};

use flight_entity::allocate_entity;
use flight_signals::{clear_signal, create_signal, emit_signal, has_signal_slots};

use crate::types::*;

pub fn create_power() -> Power {
    let mut out: Power = allocate_entity();
    initialize_power(&mut out);
    return out;
}

// flight-lint: allow(conform-extra) D5 approved caller-owned context constructor replacing source ambient power state
pub fn create_power_context() -> PowerContext {
    return PowerContext {
        destroyed: Vec::new(),
        idle_polling_interval_ms: 5000.0,
    };
}

pub fn initialize_power(out: &mut Power) {
    out.on_change = None;
    out.on_charging = None;
    out.on_discharging = None;
    out.on_idle_state_change = None;
    out.on_lock_screen = None;
    out.on_resume = None;
    out.on_suspend = None;
    out.on_thermal_state_change = None;
    out.on_unlock_screen = None;
    out.subscriptions = None;
}

pub fn acquire_power_keep_awake(
    host_power_keep_awake: &HostPowerKeepAwakeCapability,
    mode: Option<PowerKeepAwakeMode>,
) -> PowerKeepAwakeAcquireFuture {
    return (host_power_keep_awake.acquire)(mode.unwrap_or(PowerKeepAwakeMode::PreventDisplaySleep));
}

pub fn attach_power(
    host_power_status: Option<&HostPowerStatusCapability>,
    host_power_change: Option<&HostPowerChangeCapability>,
    host_power_session_lock: Option<&HostPowerSessionLockCapability>,
    host_power_suspension: Option<&HostPowerSuspensionCapability>,
    host_power_thermal: Option<&HostPowerThermalCapability>,
    host_power_idle: Option<&HostPowerIdleCapability>,
    power: &mut Power,
    idle_threshold_seconds: Option<f32>,
) {
    detach_power(power);
    let mut teardowns: Vec<PowerUnsubscribe> = Vec::new();
    let idle_threshold = idle_threshold_seconds.unwrap_or(60.0);

    if let Some(change) = host_power_change {
        let status_backend = host_power_status.cloned();
        let was_charging = Arc::new(Mutex::new(
            status_backend
                .as_ref()
                .map(|s| (s.get_status)(&mut make_power_status()).is_charging)
                .unwrap_or(false),
        ));
        let on_change = power.on_change.clone();
        let on_charging = power.on_charging.clone();
        let on_discharging = power.on_discharging.clone();
        let listener: PowerChangeListener = Arc::new(move || {
            let current = match &status_backend {
                Some(s) => Some((s.get_status)(&mut make_power_status())),
                None => None,
            };
            if let Some(ref status) = current {
                if let Some(ref signal) = on_change {
                    emit_signal(signal, status);
                }
                let mut was = was_charging.lock().unwrap();
                if status.is_charging != *was {
                    *was = status.is_charging;
                    let transition = if status.is_charging {
                        &on_charging
                    } else {
                        &on_discharging
                    };
                    if let Some(signal) = transition {
                        emit_signal(signal, &());
                    }
                }
            }
        });
        teardowns.push((change.subscribe)(listener));
    }

    if let Some(session_lock) = host_power_session_lock {
        let on_lock = power.on_lock_screen.clone();
        let lock_listener: PowerChangeListener = Arc::new(move || {
            if let Some(ref signal) = on_lock {
                emit_signal(signal, &());
            }
        });
        teardowns.push((session_lock.subscribe_lock)(lock_listener));

        let on_unlock = power.on_unlock_screen.clone();
        let unlock_listener: PowerChangeListener = Arc::new(move || {
            if let Some(ref signal) = on_unlock {
                emit_signal(signal, &());
            }
        });
        teardowns.push((session_lock.subscribe_unlock)(unlock_listener));
    }

    if let Some(suspension) = host_power_suspension {
        let on_suspend = power.on_suspend.clone();
        let suspend_listener: PowerChangeListener = Arc::new(move || {
            if let Some(ref signal) = on_suspend {
                emit_signal(signal, &());
            }
        });
        teardowns.push((suspension.subscribe_suspend)(suspend_listener));

        let on_resume = power.on_resume.clone();
        let resume_listener: PowerChangeListener = Arc::new(move || {
            if let Some(ref signal) = on_resume {
                emit_signal(signal, &());
            }
        });
        teardowns.push((suspension.subscribe_resume)(resume_listener));
    }

    if let Some(thermal) = host_power_thermal {
        let on_thermal = power.on_thermal_state_change.clone();
        let thermal_listener: PowerThermalListener = Arc::new(move |state: PowerThermalState| {
            if let Some(ref signal) = on_thermal {
                emit_signal(signal, &state);
            }
        });
        teardowns.push((thermal.subscribe_thermal_state_change)(thermal_listener));
    }

    if let Some(idle) = host_power_idle {
        let last_idle_state = Arc::new(Mutex::new((idle.get_idle_state)(idle_threshold)));
        let on_idle = power.on_idle_state_change.clone();
        let get_idle = idle.get_idle_state.clone();
        let idle_listener: PowerChangeListener = Arc::new(move || {
            let signal_ref = match &on_idle {
                Some(s) => s,
                None => return,
            };
            if !has_signal_slots(signal_ref) {
                return;
            }
            let current = get_idle(idle_threshold);
            let mut last = last_idle_state.lock().unwrap();
            if current != *last {
                *last = current;
                emit_signal(signal_ref, &());
            }
        });
        // flight-lint: allow(conform-extra) D5: Rust models idle polling as a subscribe-style teardown rather than setInterval; the host callback approach replaces timer-based polling
        teardowns.push(idle_listener);
    }

    power.subscriptions = Some(teardowns);
}

// flight-lint: allow(conform-params) D5 approved explicit PowerContext replaces source module-level provider history or polling configuration
pub fn destroy_power_keep_awake(
    host_power_keep_awake: &[&HostPowerKeepAwakeCapability],
    context: &mut PowerContext,
) {
    context.destroyed.retain(|w| w.strong_count() > 0);
    let mut per_call_seen: Vec<Weak<dyn std::any::Any + Send + Sync>> = Vec::new();
    let mut pending: Vec<&HostPowerKeepAwakeCapability> = Vec::new();
    for cap in host_power_keep_awake {
        let already_this_call = per_call_seen.iter().any(|w| {
            w.upgrade()
                .map(|arc| Arc::ptr_eq(&arc, &cap.provider))
                .unwrap_or(false)
        });
        if already_this_call {
            continue;
        }
        per_call_seen.push(Arc::downgrade(&cap.provider));
        let already_destroyed = context.destroyed.iter().any(|w| {
            w.upgrade()
                .map(|arc| Arc::ptr_eq(&arc, &cap.provider))
                .unwrap_or(false)
        });
        if already_destroyed {
            continue;
        }
        pending.push(cap);
    }
    let mut failure: Option<String> = None;
    for cap in &pending {
        if let Some(ref destroy_fn) = cap.destroy {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                destroy_fn();
            }));
            if result.is_err() {
                if failure.is_none() {
                    failure = Some("destroy failed".to_string());
                }
            } else {
                context.destroyed.push(Arc::downgrade(&cap.provider));
            }
        } else {
            context.destroyed.push(Arc::downgrade(&cap.provider));
        }
    }
    if let Some(msg) = failure {
        panic!("{}", msg);
    }
}

pub fn detach_power(power: &mut Power) {
    let teardowns = match power.subscriptions.take() {
        Some(t) => t,
        None => return,
    };
    let mut failure: Option<String> = None;
    for teardown in &teardowns {
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            teardown();
        }));
        if let Err(_) = result {
            if failure.is_none() {
                failure = Some("teardown failed".to_string());
            }
        }
    }
    if let Some(msg) = failure {
        panic!("{}", msg);
    }
}

pub fn dispose_power(power: &mut Power) {
    detach_power(power);
    if let Some(ref signal) = power.on_change {
        clear_signal(signal);
    }
    if let Some(ref signal) = power.on_charging {
        clear_signal(signal);
    }
    if let Some(ref signal) = power.on_discharging {
        clear_signal(signal);
    }
    if let Some(ref signal) = power.on_idle_state_change {
        clear_signal(signal);
    }
    if let Some(ref signal) = power.on_lock_screen {
        clear_signal(signal);
    }
    if let Some(ref signal) = power.on_resume {
        clear_signal(signal);
    }
    if let Some(ref signal) = power.on_suspend {
        clear_signal(signal);
    }
    if let Some(ref signal) = power.on_thermal_state_change {
        clear_signal(signal);
    }
    if let Some(ref signal) = power.on_unlock_screen {
        clear_signal(signal);
    }
}

pub fn enable_power_signals(power: &mut Power) {
    if power.on_change.is_none() {
        power.on_change = Some(create_signal());
    }
    if power.on_charging.is_none() {
        power.on_charging = Some(create_signal());
    }
    if power.on_discharging.is_none() {
        power.on_discharging = Some(create_signal());
    }
    if power.on_idle_state_change.is_none() {
        power.on_idle_state_change = Some(create_signal());
    }
    if power.on_lock_screen.is_none() {
        power.on_lock_screen = Some(create_signal());
    }
    if power.on_resume.is_none() {
        power.on_resume = Some(create_signal());
    }
    if power.on_suspend.is_none() {
        power.on_suspend = Some(create_signal());
    }
    if power.on_thermal_state_change.is_none() {
        power.on_thermal_state_change = Some(create_signal());
    }
    if power.on_unlock_screen.is_none() {
        power.on_unlock_screen = Some(create_signal());
    }
}

pub fn get_power_battery_health(
    host_power_battery_health: &HostPowerBatteryHealthCapability,
    out: &mut PowerBatteryHealth,
) -> PowerBatteryHealth {
    return (host_power_battery_health.get_battery_health)(out);
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for PowerBatteryHealthState
pub fn get_power_battery_health_state_string(value: PowerBatteryHealthState) -> &'static str {
    return match value {
        PowerBatteryHealthState::Good => "Good",
        PowerBatteryHealthState::Fair => "Fair",
        PowerBatteryHealthState::Poor => "Poor",
        PowerBatteryHealthState::Unknown => "Unknown",
    };
}

// flight-lint: allow(conform-params) D5 approved explicit PowerContext replaces source module-level provider history or polling configuration
pub fn get_power_idle_polling_interval_ms(context: &PowerContext) -> f32 {
    return context.idle_polling_interval_ms;
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for PowerIdleState
pub fn get_power_idle_state_string(value: PowerIdleState) -> &'static str {
    return match value {
        PowerIdleState::Active => "Active",
        PowerIdleState::Idle => "Idle",
        PowerIdleState::Unknown => "Unknown",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for PowerKeepAwakeAcquireReason
pub fn get_power_keep_awake_acquire_reason_string(value: PowerKeepAwakeAcquireReason) -> &'static str {
    return match value {
        PowerKeepAwakeAcquireReason::Ok => "ok",
        PowerKeepAwakeAcquireReason::Unavailable => "unavailable",
        PowerKeepAwakeAcquireReason::Denied => "denied",
        PowerKeepAwakeAcquireReason::Failed => "failed",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for PowerKeepAwakeMode
pub fn get_power_keep_awake_mode_string(value: PowerKeepAwakeMode) -> &'static str {
    return match value {
        PowerKeepAwakeMode::PreventDisplaySleep => "PreventDisplaySleep",
        PowerKeepAwakeMode::PreventAppSuspension => "PreventAppSuspension",
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for PowerKeepAwakeReleaseReason
pub fn get_power_keep_awake_release_reason_string(value: PowerKeepAwakeReleaseReason) -> &'static str {
    return match value {
        PowerKeepAwakeReleaseReason::Ok => "ok",
        PowerKeepAwakeReleaseReason::Inactive => "inactive",
        PowerKeepAwakeReleaseReason::Failed => "failed",
    };
}

pub fn get_power_status(
    host_power_status: &HostPowerStatusCapability,
    out: &mut PowerStatus,
) -> PowerStatus {
    return (host_power_status.get_status)(out);
}

pub fn get_power_system_idle_state(
    host_power_idle: &HostPowerIdleCapability,
    threshold_seconds: f32,
) -> PowerIdleState {
    return (host_power_idle.get_idle_state)(threshold_seconds);
}

pub fn get_power_system_idle_time(host_power_idle: &HostPowerIdleCapability) -> f32 {
    return (host_power_idle.get_idle_time_seconds)();
}

pub fn get_power_thermal_state(host_power_thermal: &HostPowerThermalCapability) -> PowerThermalState {
    return (host_power_thermal.get_thermal_state)();
}

// flight-lint: allow(conform-extra) D9e: Rust string-table helper for PowerThermalState
pub fn get_power_thermal_state_string(value: PowerThermalState) -> &'static str {
    return match value {
        PowerThermalState::Nominal => "Nominal",
        PowerThermalState::Fair => "Fair",
        PowerThermalState::Serious => "Serious",
        PowerThermalState::Critical => "Critical",
        PowerThermalState::Unknown => "Unknown",
    };
}

pub fn is_power_keep_awake_active(host_power_keep_awake: &HostPowerKeepAwakeCapability) -> bool {
    return (host_power_keep_awake.is_active)();
}

pub fn make_power_battery_health() -> PowerBatteryHealth {
    return PowerBatteryHealth {
        capacity_wear_level: -1.0,
        cycle_count: -1,
        health_state: PowerBatteryHealthState::Unknown,
        temperature_celsius: -1.0,
        voltage: -1.0,
    };
}

pub fn make_power_status() -> PowerStatus {
    return PowerStatus {
        battery_level: -1.0,
        charging_time: -1.0,
        discharging_time: -1.0,
        is_battery_low: false,
        is_charging: false,
        is_low_power: false,
        is_on_battery: false,
        thermal_state: PowerThermalState::Unknown,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table parser for PowerBatteryHealthState
pub fn parse_power_battery_health_state(value: &str) -> Option<PowerBatteryHealthState> {
    return match value {
        "Good" => Some(PowerBatteryHealthState::Good),
        "Fair" => Some(PowerBatteryHealthState::Fair),
        "Poor" => Some(PowerBatteryHealthState::Poor),
        "Unknown" => Some(PowerBatteryHealthState::Unknown),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table parser for PowerIdleState
pub fn parse_power_idle_state(value: &str) -> Option<PowerIdleState> {
    return match value {
        "Active" => Some(PowerIdleState::Active),
        "Idle" => Some(PowerIdleState::Idle),
        "Unknown" => Some(PowerIdleState::Unknown),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table parser for PowerKeepAwakeAcquireReason
pub fn parse_power_keep_awake_acquire_reason(value: &str) -> Option<PowerKeepAwakeAcquireReason> {
    return match value {
        "ok" => Some(PowerKeepAwakeAcquireReason::Ok),
        "unavailable" => Some(PowerKeepAwakeAcquireReason::Unavailable),
        "denied" => Some(PowerKeepAwakeAcquireReason::Denied),
        "failed" => Some(PowerKeepAwakeAcquireReason::Failed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table parser for PowerKeepAwakeMode
pub fn parse_power_keep_awake_mode(value: &str) -> Option<PowerKeepAwakeMode> {
    return match value {
        "PreventDisplaySleep" => Some(PowerKeepAwakeMode::PreventDisplaySleep),
        "PreventAppSuspension" => Some(PowerKeepAwakeMode::PreventAppSuspension),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table parser for PowerKeepAwakeReleaseReason
pub fn parse_power_keep_awake_release_reason(value: &str) -> Option<PowerKeepAwakeReleaseReason> {
    return match value {
        "ok" => Some(PowerKeepAwakeReleaseReason::Ok),
        "inactive" => Some(PowerKeepAwakeReleaseReason::Inactive),
        "failed" => Some(PowerKeepAwakeReleaseReason::Failed),
        _ => None,
    };
}

// flight-lint: allow(conform-extra) D9e: Rust string-table parser for PowerThermalState
pub fn parse_power_thermal_state(value: &str) -> Option<PowerThermalState> {
    return match value {
        "Nominal" => Some(PowerThermalState::Nominal),
        "Fair" => Some(PowerThermalState::Fair),
        "Serious" => Some(PowerThermalState::Serious),
        "Critical" => Some(PowerThermalState::Critical),
        "Unknown" => Some(PowerThermalState::Unknown),
        _ => None,
    };
}

pub fn release_power_keep_awake(
    host_power_keep_awake: &HostPowerKeepAwakeCapability,
) -> PowerKeepAwakeReleaseFuture {
    return (host_power_keep_awake.release)();
}

// flight-lint: allow(conform-params) D5 approved explicit PowerContext replaces source module-level provider history or polling configuration
pub fn set_power_idle_polling_interval_ms(context: &mut PowerContext, interval_ms: f32) {
    context.idle_polling_interval_ms = if interval_ms > 0.0 { interval_ms } else { 1.0 };
}
