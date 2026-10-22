use super::*;

mod compute_color_temperature_rgb {
    use super::*;

    #[test]
    fn clamps_to_the_supported_kelvin_range() {
        let mut below = [0.0; 3];
        let mut minimum = [0.0; 3];
        compute_color_temperature_rgb(&mut below, 500.0);
        compute_color_temperature_rgb(&mut minimum, 1000.0);
        assert_eq!(below, minimum);
    }

    #[test]
    fn cool_color_has_low_red_and_high_blue() {
        let mut out = [0.0; 3];
        compute_color_temperature_rgb(&mut out, 10_000.0);
        assert!(out[2] > out[0]);
    }

    #[test]
    fn returns_values_in_zero_to_one_range() {
        let mut out = [0.0; 3];
        compute_color_temperature_rgb(&mut out, 6500.0);
        assert!(out.iter().all(|value| (0.0..=1.0).contains(value)));
    }

    #[test]
    fn warm_color_has_high_red_and_low_blue() {
        let mut out = [0.0; 3];
        compute_color_temperature_rgb(&mut out, 2700.0);
        assert!(out[0] > out[2]);
    }

    #[test]
    fn writes_without_reading_the_supplied_output() {
        let mut out = [99.0; 3];
        compute_color_temperature_rgb(&mut out, 6500.0);
        assert_ne!(out[0], 99.0);
    }
}

mod compute_white_balance_multipliers {
    use super::*;

    #[test]
    fn all_output_channels_are_non_negative() {
        let mut out = [0.0; 3];
        compute_white_balance_multipliers(&mut out, -1.0, -1.0);
        assert!(out.iter().all(|value| *value >= 0.0));
    }

    #[test]
    fn neutral_returns_non_zero_multipliers() {
        let mut out = [0.0; 3];
        compute_white_balance_multipliers(&mut out, 0.0, 0.0);
        assert!(out.iter().all(|value| *value > 0.0));
    }

    #[test]
    fn positive_tint_reduces_green_relative_to_negative_tint() {
        let mut magenta = [0.0; 3];
        let mut green = [0.0; 3];
        compute_white_balance_multipliers(&mut magenta, 0.0, 0.5);
        compute_white_balance_multipliers(&mut green, 0.0, -0.5);
        assert!(green[1] > magenta[1]);
    }

    #[test]
    fn warm_temperature_increases_red_relative_to_cool() {
        let mut warm = [0.0; 3];
        let mut cool = [0.0; 3];
        compute_white_balance_multipliers(&mut warm, 0.5, 0.0);
        compute_white_balance_multipliers(&mut cool, -0.5, 0.0);
        assert!(warm[0] > cool[0]);
    }
}
