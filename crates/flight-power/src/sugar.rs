use crate::contract::*;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use std::sync::Arc;

    #[test]
    fn power_context_new_delegates() {
        let method = PowerContext::new();
        let free = create_power_context();
        assert!(method.destroyed.is_empty());
        assert!(free.destroyed.is_empty());
        assert_eq!(method.idle_polling_interval_ms, free.idle_polling_interval_ms);
    }

    #[test]
    fn power_new_delegates() {
        let method = Power::new();
        let free = create_power();
        assert!(method.on_change.is_none());
        assert!(free.on_change.is_none());
    }

    #[test]
    fn power_attach_delegates() {
        let mut power = create_power();
        enable_power_signals(&mut power);
        power.attach(None, None, None, None, None, None, None);
        assert!(power.subscriptions.is_some());
    }

    #[test]
    fn power_detach_delegates() {
        let mut power = create_power();
        enable_power_signals(&mut power);
        power.attach(None, None, None, None, None, None, None);
        power.detach();
        assert!(power.subscriptions.is_none());
    }

    #[test]
    fn power_dispose_delegates() {
        let mut power = create_power();
        enable_power_signals(&mut power);
        power.dispose();
        assert!(power.subscriptions.is_none());
    }

    #[test]
    fn power_enable_signals_delegates() {
        let mut method = create_power();
        let mut free = create_power();
        method.enable_signals();
        enable_power_signals(&mut free);
        assert!(method.on_change.is_some());
        assert!(free.on_change.is_some());
    }

    #[test]
    fn power_status_new_delegates() {
        let method = PowerStatus::new();
        let free = make_power_status();
        assert_eq!(method.battery_level, free.battery_level);
        assert_eq!(method.is_charging, free.is_charging);
        assert_eq!(method.thermal_state, free.thermal_state);
    }

    #[test]
    fn power_battery_health_new_delegates() {
        let method = PowerBatteryHealth::new();
        let free = make_power_battery_health();
        assert_eq!(method.capacity_wear_level, free.capacity_wear_level);
        assert_eq!(method.cycle_count, free.cycle_count);
        assert_eq!(method.health_state, free.health_state);
    }

    #[test]
    fn battery_health_state_parse_delegates() {
        let method = PowerBatteryHealthState::parse("Good");
        let free = parse_power_battery_health_state("Good");
        assert_eq!(method, free);
    }

    #[test]
    fn battery_health_state_to_string_delegates() {
        let method = PowerBatteryHealthState::Good.to_str();
        let free = get_power_battery_health_state_string(PowerBatteryHealthState::Good);
        assert_eq!(method, free);
    }

    #[test]
    fn idle_state_parse_delegates() {
        let method = PowerIdleState::parse("Active");
        let free = parse_power_idle_state("Active");
        assert_eq!(method, free);
    }

    #[test]
    fn idle_state_to_string_delegates() {
        let method = PowerIdleState::Active.to_str();
        let free = get_power_idle_state_string(PowerIdleState::Active);
        assert_eq!(method, free);
    }

    #[test]
    fn acquire_reason_parse_delegates() {
        let method = PowerKeepAwakeAcquireReason::parse("ok");
        let free = parse_power_keep_awake_acquire_reason("ok");
        assert_eq!(method, free);
    }

    #[test]
    fn acquire_reason_to_string_delegates() {
        let method = PowerKeepAwakeAcquireReason::Ok.to_str();
        let free = get_power_keep_awake_acquire_reason_string(PowerKeepAwakeAcquireReason::Ok);
        assert_eq!(method, free);
    }

    #[test]
    fn keep_awake_mode_parse_delegates() {
        let method = PowerKeepAwakeMode::parse("PreventDisplaySleep");
        let free = parse_power_keep_awake_mode("PreventDisplaySleep");
        assert_eq!(method, free);
    }

    #[test]
    fn keep_awake_mode_to_string_delegates() {
        let method = PowerKeepAwakeMode::PreventDisplaySleep.to_str();
        let free = get_power_keep_awake_mode_string(PowerKeepAwakeMode::PreventDisplaySleep);
        assert_eq!(method, free);
    }

    #[test]
    fn release_reason_parse_delegates() {
        let method = PowerKeepAwakeReleaseReason::parse("ok");
        let free = parse_power_keep_awake_release_reason("ok");
        assert_eq!(method, free);
    }

    #[test]
    fn release_reason_to_string_delegates() {
        let method = PowerKeepAwakeReleaseReason::Ok.to_str();
        let free = get_power_keep_awake_release_reason_string(PowerKeepAwakeReleaseReason::Ok);
        assert_eq!(method, free);
    }

    #[test]
    fn thermal_state_parse_delegates() {
        let method = PowerThermalState::parse("Nominal");
        let free = parse_power_thermal_state("Nominal");
        assert_eq!(method, free);
    }

    #[test]
    fn thermal_state_to_string_delegates() {
        let method = PowerThermalState::Nominal.to_str();
        let free = get_power_thermal_state_string(PowerThermalState::Nominal);
        assert_eq!(method, free);
    }

    #[test]
    fn host_battery_health_get_delegates() {
        let cap = HostPowerBatteryHealthCapability {
            get_battery_health: Arc::new(|out: &mut PowerBatteryHealth| {
                out.cycle_count = 42;
                return out.clone();
            }),
        };
        let mut out = make_power_battery_health();
        let result = cap.get_battery_health(&mut out);
        assert_eq!(result.cycle_count, 42);
    }

    #[test]
    fn host_idle_get_state_delegates() {
        let cap = HostPowerIdleCapability {
            get_idle_state: Arc::new(|_| PowerIdleState::Active),
            get_idle_time_seconds: Arc::new(|| 5.0),
        };
        assert_eq!(cap.get_idle_state(60.0), PowerIdleState::Active);
    }

    #[test]
    fn host_idle_get_time_delegates() {
        let cap = HostPowerIdleCapability {
            get_idle_state: Arc::new(|_| PowerIdleState::Active),
            get_idle_time_seconds: Arc::new(|| 12.5),
        };
        assert_eq!(cap.get_idle_time(), 12.5);
    }

    #[test]
    fn host_keep_awake_is_active_delegates() {
        let cap = HostPowerKeepAwakeCapability {
            acquire: Arc::new(|_| Box::pin(async { PowerKeepAwakeAcquireResult { reason: PowerKeepAwakeAcquireReason::Ok } })),
            destroy: None,
            is_active: Arc::new(|| true),
            provider: Arc::new(()) as ProviderRef,
            release: Arc::new(|| Box::pin(async { PowerKeepAwakeReleaseResult { reason: PowerKeepAwakeReleaseReason::Ok } })),
        };
        assert!(cap.is_active());
    }

    #[test]
    fn host_status_get_delegates() {
        let cap = HostPowerStatusCapability {
            get_status: Arc::new(|out: &mut PowerStatus| {
                out.battery_level = 0.75;
                return out.clone();
            }),
        };
        let mut out = make_power_status();
        let result = cap.get_status(&mut out);
        assert_eq!(result.battery_level, 0.75);
    }

    #[test]
    fn host_thermal_get_state_delegates() {
        let cap = HostPowerThermalCapability {
            get_thermal_state: Arc::new(|| PowerThermalState::Nominal),
            subscribe_thermal_state_change: Arc::new(|_| Arc::new(|| {})),
        };
        assert_eq!(cap.get_thermal_state(), PowerThermalState::Nominal);
    }
}

// PowerContext

impl PowerContext {
    pub fn new() -> Self {
        return create_power_context();
    }
}

// HostPowerBatteryHealthCapability

impl HostPowerBatteryHealthCapability {
    pub fn get_battery_health(&self, out: &mut PowerBatteryHealth) -> PowerBatteryHealth {
        return get_power_battery_health(self, out);
    }
}

// HostPowerIdleCapability

impl HostPowerIdleCapability {
    pub fn get_idle_state(&self, threshold_seconds: f32) -> PowerIdleState {
        return get_power_system_idle_state(self, threshold_seconds);
    }

    pub fn get_idle_time(&self) -> f32 {
        return get_power_system_idle_time(self);
    }
}

// HostPowerKeepAwakeCapability

impl HostPowerKeepAwakeCapability {
    pub fn acquire(&self, mode: Option<PowerKeepAwakeMode>) -> PowerKeepAwakeAcquireFuture {
        return acquire_power_keep_awake(self, mode);
    }

    pub fn is_active(&self) -> bool {
        return is_power_keep_awake_active(self);
    }

    pub fn release(&self) -> PowerKeepAwakeReleaseFuture {
        return release_power_keep_awake(self);
    }
}

// HostPowerStatusCapability

impl HostPowerStatusCapability {
    pub fn get_status(&self, out: &mut PowerStatus) -> PowerStatus {
        return get_power_status(self, out);
    }
}

// HostPowerThermalCapability

impl HostPowerThermalCapability {
    pub fn get_thermal_state(&self) -> PowerThermalState {
        return get_power_thermal_state(self);
    }
}

// Power

impl Power {
    pub fn new() -> Self {
        return create_power();
    }

    pub fn attach(
        &mut self,
        host_power_status: Option<&HostPowerStatusCapability>,
        host_power_change: Option<&HostPowerChangeCapability>,
        host_power_session_lock: Option<&HostPowerSessionLockCapability>,
        host_power_suspension: Option<&HostPowerSuspensionCapability>,
        host_power_thermal: Option<&HostPowerThermalCapability>,
        host_power_idle: Option<&HostPowerIdleCapability>,
        idle_threshold_seconds: Option<f32>,
    ) {
        return attach_power(
            host_power_status,
            host_power_change,
            host_power_session_lock,
            host_power_suspension,
            host_power_thermal,
            host_power_idle,
            self,
            idle_threshold_seconds,
        );
    }

    pub fn detach(&mut self) {
        return detach_power(self);
    }

    pub fn dispose(&mut self) {
        return dispose_power(self);
    }

    pub fn enable_signals(&mut self) {
        return enable_power_signals(self);
    }
}

// PowerBatteryHealth

impl PowerBatteryHealth {
    pub fn new() -> Self {
        return make_power_battery_health();
    }
}

// PowerBatteryHealthState

impl PowerBatteryHealthState {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_power_battery_health_state(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_power_battery_health_state_string(self);
    }
}

// PowerIdleState

impl PowerIdleState {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_power_idle_state(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_power_idle_state_string(self);
    }
}

// PowerKeepAwakeAcquireReason

impl PowerKeepAwakeAcquireReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_power_keep_awake_acquire_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_power_keep_awake_acquire_reason_string(self);
    }
}

// PowerKeepAwakeMode

impl PowerKeepAwakeMode {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_power_keep_awake_mode(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_power_keep_awake_mode_string(self);
    }
}

// PowerKeepAwakeReleaseReason

impl PowerKeepAwakeReleaseReason {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_power_keep_awake_release_reason(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_power_keep_awake_release_reason_string(self);
    }
}

// PowerStatus

impl PowerStatus {
    pub fn new() -> Self {
        return make_power_status();
    }
}

// PowerThermalState

impl PowerThermalState {
    pub fn parse(value: &str) -> Option<Self> {
        return parse_power_thermal_state(value);
    }

    pub fn to_str(self) -> &'static str {
        return get_power_thermal_state_string(self);
    }
}
