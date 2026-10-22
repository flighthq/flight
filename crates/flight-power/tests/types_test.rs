use flight_power::*;

mod make_power_battery_health {
    use super::*;

    #[test]
    fn carries_the_complete_unknown_encoding() {
        let health = make_power_battery_health();
        assert_eq!(health.capacity_wear_level, -1.0);
        assert_eq!(health.cycle_count, -1);
        assert_eq!(health.health_state, PowerBatteryHealthState::Unknown);
        assert_eq!(health.temperature_celsius, -1.0);
        assert_eq!(health.voltage, -1.0);
    }

    #[test]
    fn allocates_a_distinct_value_per_call() {
        let a = make_power_battery_health();
        let b = make_power_battery_health();
        let a_ptr = &a as *const _ as usize;
        let b_ptr = &b as *const _ as usize;
        assert_ne!(a_ptr, b_ptr);
    }
}

mod make_power_status {
    use super::*;

    #[test]
    fn carries_the_complete_unknown_encoding() {
        let status = make_power_status();
        assert_eq!(status.battery_level, -1.0);
        assert_eq!(status.charging_time, -1.0);
        assert_eq!(status.discharging_time, -1.0);
        assert_eq!(status.thermal_state, PowerThermalState::Unknown);
        assert!(!status.is_charging);
        assert!(!status.is_battery_low);
        assert!(!status.is_low_power);
        assert!(!status.is_on_battery);
    }

    #[test]
    fn allocates_a_distinct_value_per_call() {
        let a = make_power_status();
        let b = make_power_status();
        let a_ptr = &a as *const _ as usize;
        let b_ptr = &b as *const _ as usize;
        assert_ne!(a_ptr, b_ptr);
    }
}

mod power_battery_health_state_string_table {
    use super::*;

    #[test]
    fn round_trips_all_variants() {
        let variants = [
            (PowerBatteryHealthState::Good, "Good"),
            (PowerBatteryHealthState::Fair, "Fair"),
            (PowerBatteryHealthState::Poor, "Poor"),
            (PowerBatteryHealthState::Unknown, "Unknown"),
        ];
        for (variant, expected) in &variants {
            assert_eq!(get_power_battery_health_state_string(*variant), *expected);
            assert_eq!(parse_power_battery_health_state(expected), Some(*variant));
        }
    }

    #[test]
    fn rejects_unknown_string() {
        assert_eq!(parse_power_battery_health_state("bogus"), None);
    }
}

mod power_idle_state_string_table {
    use super::*;

    #[test]
    fn round_trips_all_variants() {
        let variants = [
            (PowerIdleState::Active, "Active"),
            (PowerIdleState::Idle, "Idle"),
            (PowerIdleState::Unknown, "Unknown"),
        ];
        for (variant, expected) in &variants {
            assert_eq!(get_power_idle_state_string(*variant), *expected);
            assert_eq!(parse_power_idle_state(expected), Some(*variant));
        }
    }

    #[test]
    fn rejects_unknown_string() {
        assert_eq!(parse_power_idle_state("bogus"), None);
    }
}

mod power_keep_awake_acquire_reason_string_table {
    use super::*;

    #[test]
    fn round_trips_all_variants() {
        let variants = [
            (PowerKeepAwakeAcquireReason::Ok, "ok"),
            (PowerKeepAwakeAcquireReason::Unavailable, "unavailable"),
            (PowerKeepAwakeAcquireReason::Denied, "denied"),
            (PowerKeepAwakeAcquireReason::Failed, "failed"),
        ];
        for (variant, expected) in &variants {
            assert_eq!(get_power_keep_awake_acquire_reason_string(*variant), *expected);
            assert_eq!(parse_power_keep_awake_acquire_reason(expected), Some(*variant));
        }
    }

    #[test]
    fn rejects_unknown_string() {
        assert_eq!(parse_power_keep_awake_acquire_reason("bogus"), None);
    }
}

mod power_keep_awake_mode_string_table {
    use super::*;

    #[test]
    fn round_trips_all_variants() {
        let variants = [
            (PowerKeepAwakeMode::PreventDisplaySleep, "PreventDisplaySleep"),
            (PowerKeepAwakeMode::PreventAppSuspension, "PreventAppSuspension"),
        ];
        for (variant, expected) in &variants {
            assert_eq!(get_power_keep_awake_mode_string(*variant), *expected);
            assert_eq!(parse_power_keep_awake_mode(expected), Some(*variant));
        }
    }

    #[test]
    fn rejects_unknown_string() {
        assert_eq!(parse_power_keep_awake_mode("bogus"), None);
    }
}

mod power_keep_awake_release_reason_string_table {
    use super::*;

    #[test]
    fn round_trips_all_variants() {
        let variants = [
            (PowerKeepAwakeReleaseReason::Ok, "ok"),
            (PowerKeepAwakeReleaseReason::Inactive, "inactive"),
            (PowerKeepAwakeReleaseReason::Failed, "failed"),
        ];
        for (variant, expected) in &variants {
            assert_eq!(get_power_keep_awake_release_reason_string(*variant), *expected);
            assert_eq!(parse_power_keep_awake_release_reason(expected), Some(*variant));
        }
    }

    #[test]
    fn rejects_unknown_string() {
        assert_eq!(parse_power_keep_awake_release_reason("bogus"), None);
    }
}

mod power_thermal_state_string_table {
    use super::*;

    #[test]
    fn round_trips_all_variants() {
        let variants = [
            (PowerThermalState::Nominal, "Nominal"),
            (PowerThermalState::Fair, "Fair"),
            (PowerThermalState::Serious, "Serious"),
            (PowerThermalState::Critical, "Critical"),
            (PowerThermalState::Unknown, "Unknown"),
        ];
        for (variant, expected) in &variants {
            assert_eq!(get_power_thermal_state_string(*variant), *expected);
            assert_eq!(parse_power_thermal_state(expected), Some(*variant));
        }
    }

    #[test]
    fn rejects_unknown_string() {
        assert_eq!(parse_power_thermal_state("bogus"), None);
    }
}
