use flight_math::*;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

mod inverse_lerp {
    use super::*;

    #[test]
    fn returns_0_when_value_equals_a() {
        assert_eq!(inverse_lerp(0.0, 10.0, 0.0), 0.0);
    }

    #[test]
    fn returns_1_when_value_equals_b() {
        assert_eq!(inverse_lerp(0.0, 10.0, 10.0), 1.0);
    }

    #[test]
    fn returns_0_5_for_the_midpoint() {
        assert_eq!(inverse_lerp(0.0, 10.0, 5.0), 0.5);
    }

    #[test]
    fn returns_0_when_a_equals_b_to_avoid_division_by_zero() {
        assert_eq!(inverse_lerp(5.0, 5.0, 5.0), 0.0);
    }

    #[test]
    fn works_with_negative_ranges() {
        assert_eq!(inverse_lerp(-10.0, 10.0, 0.0), 0.5);
    }
}

mod lerp {
    use super::*;

    #[test]
    fn returns_a_when_t_is_0() {
        assert_eq!(lerp(0.0, 10.0, 0.0), 0.0);
    }

    #[test]
    fn returns_b_when_t_is_1() {
        assert_eq!(lerp(0.0, 10.0, 1.0), 10.0);
    }

    #[test]
    fn returns_the_midpoint_for_t_half() {
        assert_eq!(lerp(0.0, 10.0, 0.5), 5.0);
    }

    #[test]
    fn extrapolates_when_t_is_outside_0_1() {
        assert_eq!(lerp(0.0, 10.0, 2.0), 20.0);
        assert_eq!(lerp(0.0, 10.0, -1.0), -10.0);
    }

    #[test]
    fn works_with_negative_values() {
        assert_eq!(lerp(-10.0, 10.0, 0.5), 0.0);
    }
}

mod remap {
    use super::*;

    #[test]
    fn maps_a_value_from_one_range_to_another() {
        assert_eq!(remap(5.0, 0.0, 10.0, 0.0, 100.0), 50.0);
    }

    #[test]
    fn maps_the_minimum_input_to_the_minimum_output() {
        assert_eq!(remap(0.0, 0.0, 10.0, 50.0, 150.0), 50.0);
    }

    #[test]
    fn maps_the_maximum_input_to_the_maximum_output() {
        assert_eq!(remap(10.0, 0.0, 10.0, 50.0, 150.0), 150.0);
    }

    #[test]
    fn returns_out_min_when_in_min_equals_in_max() {
        assert_eq!(remap(5.0, 5.0, 5.0, 0.0, 100.0), 0.0);
    }

    #[test]
    fn works_with_inverted_output_ranges() {
        assert_eq!(remap(5.0, 0.0, 10.0, 100.0, 0.0), 50.0);
    }
}

mod smooth_step {
    use super::*;

    #[test]
    fn returns_0_at_the_lower_edge() {
        assert_eq!(smooth_step(0.0, 1.0, 0.0), 0.0);
    }

    #[test]
    fn returns_1_at_the_upper_edge() {
        assert_eq!(smooth_step(0.0, 1.0, 1.0), 1.0);
    }

    #[test]
    fn returns_0_5_at_the_midpoint() {
        assert_eq!(smooth_step(0.0, 1.0, 0.5), 0.5);
    }

    #[test]
    fn returns_0_for_x_below_the_lower_edge() {
        assert_eq!(smooth_step(0.0, 1.0, -1.0), 0.0);
    }

    #[test]
    fn returns_1_for_x_above_the_upper_edge() {
        assert_eq!(smooth_step(0.0, 1.0, 2.0), 1.0);
    }

    #[test]
    fn has_zero_derivative_at_the_edges() {
        // Use a smaller step for tighter numerical derivative accuracy.
        let h = 1e-5_f32;
        let d_low = (smooth_step(0.0, 1.0, h) - smooth_step(0.0, 1.0, 0.0)) / h;
        let d_high = (smooth_step(0.0, 1.0, 1.0) - smooth_step(0.0, 1.0, 1.0 - h)) / h;
        assert_approx(d_low, 0.0);
        assert_approx(d_high, 0.0);
    }
}

mod step {
    use super::*;

    #[test]
    fn returns_0_when_x_is_less_than_edge() {
        assert_eq!(step(0.5, 0.3), 0.0);
    }

    #[test]
    fn returns_1_when_x_equals_edge() {
        assert_eq!(step(0.5, 0.5), 1.0);
    }

    #[test]
    fn returns_1_when_x_is_greater_than_edge() {
        assert_eq!(step(0.5, 0.7), 1.0);
    }
}
