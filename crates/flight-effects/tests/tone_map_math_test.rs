use super::*;

fn empty_agx_options() -> AgxToneMapOptions {
    AgxToneMapOptions {
        min_ev: None,
        max_ev: None,
    }
}
fn empty_filmic_options() -> FilmicToneMapOptions {
    FilmicToneMapOptions {
        max_brightness: None,
        contrast: None,
        linear_start: None,
        linear_length: None,
        black_tighten: None,
        pedestal: None,
    }
}

mod compute_aces_tone_map {
    use super::*;

    #[test]
    fn maps_zero_to_approximately_zero() {
        // D1 f32 bound (TS: 2 decimal digits).
        assert_close(compute_aces_tone_map(0.0), 0.0, 5e-3);
    }

    #[test]
    fn output_is_clamped_to_zero_to_one() {
        assert!(compute_aces_tone_map(100.0) <= 1.0);
        assert!(compute_aces_tone_map(-1.0) >= 0.0);
    }

    #[test]
    fn one_returns_the_known_reference_range() {
        let value = compute_aces_tone_map(1.0);
        assert!(value > 0.7 && value < 0.9);
    }
}

mod compute_agx_tone_map {
    use super::*;

    #[test]
    fn custom_ev_range_shifts_the_output() {
        let default_value = compute_agx_tone_map(0.5, None);
        let narrow = AgxToneMapOptions {
            min_ev: Some(-6.0),
            max_ev: Some(2.0),
        };
        let custom = compute_agx_tone_map(0.5, Some(&narrow));
        // D1 f32 separation bound (TS: not close at 2 decimal digits).
        assert!((custom - default_value).abs() > 5e-3);
    }

    #[test]
    fn increases_monotonically_in_the_normal_range() {
        assert!(compute_agx_tone_map(1.0, None) > compute_agx_tone_map(0.5, None));
    }

    #[test]
    fn matches_default_when_options_are_omitted_or_empty() {
        let expected = compute_agx_tone_map(0.5, None);
        // D1 f32 bound (TS: 10 decimal digits).
        assert_close(expected, compute_agx_tone_map(0.5, None), 5e-11);
        // D1 f32 bound (TS: 10 decimal digits).
        assert_close(
            expected,
            compute_agx_tone_map(0.5, Some(&empty_agx_options())),
            5e-11,
        );
    }

    #[test]
    fn output_is_in_the_expected_range() {
        let middle = compute_agx_tone_map(0.5, None);
        assert!((0.0..=1.0).contains(&middle));
        assert!(compute_agx_tone_map(100.0, None) <= 1.1);
    }
}

mod compute_exposure_scale {
    use super::*;

    #[test]
    fn ev_minus_one_halves_brightness() {
        // D1 f32 bound (TS: 5 decimal digits).
        assert_close(compute_exposure_scale(-1.0), 0.5, 5e-6);
    }

    #[test]
    fn ev_one_doubles_brightness() {
        // D1 f32 bound (TS: 5 decimal digits).
        assert_close(compute_exposure_scale(1.0), 2.0, 5e-6);
    }

    #[test]
    fn ev_zero_returns_one() {
        // D1 f32 bound (TS: 5 decimal digits).
        assert_close(compute_exposure_scale(0.0), 1.0, 5e-6);
    }
}

mod compute_filmic_tone_map {
    use super::*;

    #[test]
    fn higher_contrast_steepens_the_curve() {
        let default_value = compute_filmic_tone_map(0.5, None);
        let options = FilmicToneMapOptions {
            contrast: Some(2.0),
            ..empty_filmic_options()
        };
        let high_contrast = compute_filmic_tone_map(0.5, Some(&options));
        // D1 f32 separation bound (TS: not close at 2 decimal digits).
        assert!((high_contrast - default_value).abs() > 5e-3);
    }

    #[test]
    fn matches_default_when_options_are_omitted_or_empty() {
        let expected = compute_filmic_tone_map(0.5, None);
        // D1 f32 bound (TS: 10 decimal digits).
        assert_close(expected, compute_filmic_tone_map(0.5, None), 5e-11);
        // D1 f32 bound (TS: 10 decimal digits).
        assert_close(
            expected,
            compute_filmic_tone_map(0.5, Some(&empty_filmic_options())),
            5e-11,
        );
    }

    #[test]
    fn output_increases_with_input_in_the_linear_range() {
        assert!(compute_filmic_tone_map(0.5, None) > compute_filmic_tone_map(0.1, None));
    }

    #[test]
    fn output_is_non_negative_for_non_negative_input() {
        assert!(compute_filmic_tone_map(0.0, None) >= 0.0);
        assert!(compute_filmic_tone_map(1.0, None) >= 0.0);
    }

    #[test]
    fn pedestal_lifts_the_black_level() {
        let options = FilmicToneMapOptions {
            pedestal: Some(0.05),
            ..empty_filmic_options()
        };
        assert!(
            compute_filmic_tone_map(0.01, Some(&options)) > compute_filmic_tone_map(0.01, None)
        );
    }
}

mod compute_reinhard_extended_tone_map {
    use super::*;

    #[test]
    fn at_white_point_output_is_one() {
        // D1 f32 bound (TS: 4 decimal digits).
        assert_close(compute_reinhard_extended_tone_map(10.0, 10.0), 1.0, 5e-5);
    }

    #[test]
    fn maps_zero_to_zero() {
        // D1 f32 bound (TS: 5 decimal digits).
        assert_close(compute_reinhard_extended_tone_map(0.0, 10.0), 0.0, 5e-6);
    }
}

mod compute_reinhard_tone_map {
    use super::*;

    #[test]
    fn maps_zero_to_zero() {
        // D1 f32 bound (TS: 5 decimal digits).
        assert_close(compute_reinhard_tone_map(0.0), 0.0, 5e-6);
    }

    #[test]
    fn one_maps_to_one_half() {
        // D1 f32 bound (TS: 5 decimal digits).
        assert_close(compute_reinhard_tone_map(1.0), 0.5, 5e-6);
    }

    #[test]
    fn output_is_always_below_one_for_positive_input() {
        assert!(compute_reinhard_tone_map(1.0) < 1.0);
        assert!(compute_reinhard_tone_map(100.0) < 1.0);
    }
}

mod compute_uncharted_2_tone_map {
    use super::*;

    #[test]
    fn output_at_zero_is_near_zero() {
        assert!(compute_uncharted_2_tone_map(0.0).abs() < 0.1);
    }

    #[test]
    fn output_increases_with_input() {
        assert!(compute_uncharted_2_tone_map(2.0) > compute_uncharted_2_tone_map(1.0));
    }
}

mod get_aces_input_matrix {
    use super::*;

    #[test]
    fn diagonal_values_are_largest_in_the_first_column() {
        let mut out = [0.0; 9];
        get_aces_input_matrix(&mut out);
        assert!(out[0] > out[1] && out[0] > out[2]);
    }

    #[test]
    fn writes_nine_values_with_positive_sum() {
        let mut out = [0.0; 9];
        get_aces_input_matrix(&mut out);
        assert!(out.iter().sum::<f32>() > 0.0);
    }
}

mod get_aces_output_matrix {
    use super::*;

    #[test]
    fn writes_nine_values_including_non_zero_entries() {
        let mut out = [0.0; 9];
        get_aces_output_matrix(&mut out);
        assert!(out.iter().any(|value| *value != 0.0));
    }
}
