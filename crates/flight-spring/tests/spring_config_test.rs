use flight_spring::contract::*;

fn assert_close(actual: f32, expected: f32, digits: i32) {
    let diff = (actual - expected).abs();
    let ts_bound = 0.5 * 10.0_f32.powi(-digits);
    let limit = ts_bound.max(4.0 * f32::EPSILON * expected.abs().max(1.0));
    assert!(
        diff <= limit,
        "expected {expected}, got {actual} (diff: {diff}, limit: {limit})"
    );
}

mod create_spring_config {
    use super::*;

    #[test]
    fn stores_frequency_and_damping_ratio_verbatim() {
        let config = create_spring_config(2.5, 0.4);
        assert_eq!(config.frequency, 2.5);
        assert_eq!(config.damping_ratio, 0.4);
    }

    #[test]
    fn bouncy_preset_has_expected_values() {
        assert_eq!(SPRING_PRESET_BOUNCY.damping_ratio, 0.35);
        assert_eq!(SPRING_PRESET_BOUNCY.frequency, 2.0);
    }

    #[test]
    fn gentle_preset_has_expected_values() {
        assert_eq!(SPRING_PRESET_GENTLE.damping_ratio, 0.8);
        assert_eq!(SPRING_PRESET_GENTLE.frequency, 1.5);
    }

    #[test]
    fn stiff_preset_has_expected_values() {
        assert_eq!(SPRING_PRESET_STIFF.damping_ratio, 1.0);
        assert_eq!(SPRING_PRESET_STIFF.frequency, 4.0);
    }

    #[test]
    fn provides_distinct_bouncy_gentle_and_stiff_response_profiles() {
        assert!(SPRING_PRESET_BOUNCY.damping_ratio < SPRING_PRESET_GENTLE.damping_ratio);
        assert!(SPRING_PRESET_GENTLE.frequency < SPRING_PRESET_STIFF.frequency);
        assert!(SPRING_PRESET_STIFF.damping_ratio >= 1.0);
    }
}

mod create_spring_config_from_physical {
    use super::*;

    #[test]
    fn maps_k100_c20_m1_to_critical_damping() {
        let config = create_spring_config_from_physical(100.0, 20.0, 1.0);
        // D1 f32 bound (TS: 5e-10)
        assert_close(config.frequency, 10.0 / std::f32::consts::TAU, 9);
        // D1 f32 bound (TS: 5e-13)
        assert_close(config.damping_ratio, 1.0, 12);
    }

    #[test]
    fn accounts_for_mass_in_both_frequency_and_damping_ratio() {
        let config = create_spring_config_from_physical(100.0, 20.0, 4.0);
        // D1 f32 bound (TS: 5e-10)
        assert_close(config.frequency, 5.0 / std::f32::consts::TAU, 9);
        // D1 f32 bound (TS: 5e-13)
        assert_close(config.damping_ratio, 0.5, 12);
    }
}
