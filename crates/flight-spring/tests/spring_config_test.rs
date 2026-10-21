use flight_spring::*;
use flight_spring::contract::*;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-3,
        "expected {expected}, got {actual} (diff: {diff})"
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
        assert_approx(config.frequency, 10.0 / std::f32::consts::TAU);
        assert_approx(config.damping_ratio, 1.0);
    }

    #[test]
    fn accounts_for_mass_in_both_frequency_and_damping_ratio() {
        let config = create_spring_config_from_physical(100.0, 20.0, 4.0);
        assert_approx(config.frequency, 5.0 / std::f32::consts::TAU);
        assert_approx(config.damping_ratio, 0.5);
    }
}

mod initialize_spring_config {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_spring_config() {
        let mut config = create_spring_config(0.0, 0.0);
        initialize_spring_config(&mut config, 3.0, 0.7);
        assert_eq!(config.frequency, 3.0);
        assert_eq!(config.damping_ratio, 0.7);
    }
}
