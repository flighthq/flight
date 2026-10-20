use flight_math::*;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

mod ceil_power_of_two {
    use super::*;

    #[test]
    fn rounds_up_to_the_next_power_of_two() {
        assert_eq!(ceil_power_of_two(5), 8);
        assert_eq!(ceil_power_of_two(9), 16);
    }

    #[test]
    fn leaves_an_exact_power_of_two_unchanged() {
        assert_eq!(ceil_power_of_two(8), 8);
        assert_eq!(ceil_power_of_two(256), 256);
    }
}

mod floor_power_of_two {
    use super::*;

    #[test]
    fn rounds_down_to_the_previous_power_of_two() {
        assert_eq!(floor_power_of_two(6), 4);
        assert_eq!(floor_power_of_two(100), 64);
    }

    #[test]
    fn leaves_an_exact_power_of_two_unchanged() {
        assert_eq!(floor_power_of_two(8), 8);
    }
}

mod quantize {
    use super::*;

    #[test]
    fn quantizes_to_the_nearest_step() {
        assert_approx(quantize(0.7, 4.0, 0.0, 1.0), 0.75);
    }

    #[test]
    fn returns_min_at_the_lower_bound() {
        assert_approx(quantize(0.0, 4.0, 0.0, 1.0), 0.0);
    }

    #[test]
    fn returns_max_at_the_upper_bound() {
        assert_approx(quantize(1.0, 4.0, 0.0, 1.0), 1.0);
    }

    #[test]
    fn returns_min_when_steps_is_0() {
        assert_eq!(quantize(0.5, 0.0, 0.0, 1.0), 0.0);
    }

    #[test]
    fn returns_min_when_min_equals_max() {
        assert_eq!(quantize(5.0, 4.0, 5.0, 5.0), 5.0);
    }

    #[test]
    fn clamps_values_outside_the_range() {
        assert_approx(quantize(-1.0, 4.0, 0.0, 1.0), 0.0);
        assert_approx(quantize(2.0, 4.0, 0.0, 1.0), 1.0);
    }
}

mod sign {
    use super::*;

    #[test]
    fn returns_1_for_positive_values() {
        assert_eq!(sign(5.0), 1.0);
        assert_eq!(sign(0.001), 1.0);
    }

    #[test]
    fn returns_negative_1_for_negative_values() {
        assert_eq!(sign(-5.0), -1.0);
        assert_eq!(sign(-0.001), -1.0);
    }

    #[test]
    fn returns_0_for_zero() {
        assert_eq!(sign(0.0), 0.0);
    }
}
