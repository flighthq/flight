use flight_spring::contract::*;

mod create_spring_config {
    use super::*;

    #[test]
    fn stores_frequency_and_damping_ratio_verbatim() {
        let config = create_spring_config(2.5, 0.4);
        assert_eq!(config.frequency, 2.5);
        assert_eq!(config.damping_ratio, 0.4);
    }

    #[test]
    fn stores_explicit_zero_values() {
        let config = create_spring_config(3.0, 0.0);
        assert_eq!(config.frequency, 3.0);
        assert_eq!(config.damping_ratio, 0.0);
        let zero = create_spring_config(0.0, 0.0);
        assert_eq!(zero.frequency, 0.0);
        assert_eq!(zero.damping_ratio, 0.0);
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
    fn presets_can_be_customized_by_copy_without_changing_the_shared_profile() {
        let mut customized = SPRING_PRESET_GENTLE;
        customized.frequency = 3.0;
        assert_eq!(customized.damping_ratio, SPRING_PRESET_GENTLE.damping_ratio);
        assert_eq!(customized.frequency, 3.0);
        assert_ne!(SPRING_PRESET_GENTLE.frequency, 3.0);
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
        assert_eq!(config.frequency, 10.0 / std::f32::consts::TAU);
        assert_eq!(config.damping_ratio, 1.0);
    }

    #[test]
    fn accounts_for_mass_in_both_frequency_and_damping_ratio() {
        let config = create_spring_config_from_physical(100.0, 20.0, 4.0);
        assert_eq!(config.frequency, 5.0 / std::f32::consts::TAU);
        assert_eq!(config.damping_ratio, 0.5);
    }
}

mod initialize_spring_config {
    use super::*;

    #[test]
    fn matches_create_and_overwrites_existing_values() {
        let mut out = SpringConfig {
            damping_ratio: 99.0,
            frequency: 99.0,
        };
        initialize_spring_config(&mut out, 6.0, 0.75);
        let expected = create_spring_config(6.0, 0.75);
        assert_eq!(out.frequency, expected.frequency);
        assert_eq!(out.damping_ratio, expected.damping_ratio);
    }
}
