use flight_easing::*;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

fn constant_neg_half(_t: f32) -> f32 {
    return -0.5;
}

fn constant_one_point_five(_t: f32) -> f32 {
    return 1.5;
}

mod ease_clamp {
    use super::*;

    #[test]
    fn passes_through_values_already_in_0_1() {
        let clamped = ease_clamp(ease_in_cubic);
        assert_approx(clamped(0.0), ease_in_cubic(0.0));
        assert_approx(clamped(0.5), ease_in_cubic(0.5));
        assert_approx(clamped(1.0), ease_in_cubic(1.0));
    }

    #[test]
    fn clamps_negative_t_to_0() {
        let clamped = ease_clamp(ease_in_cubic);
        assert_approx(clamped(-0.5), ease_in_cubic(0.0));
    }

    #[test]
    fn clamps_t_above_1_to_1() {
        let clamped = ease_clamp(ease_in_cubic);
        assert_approx(clamped(1.5), ease_in_cubic(1.0));
    }
}

mod ease_clamp_output {
    use super::*;

    #[test]
    fn does_not_clamp_when_output_is_within_range() {
        let f = ease_clamp_output(ease_in_cubic, 0.0, 1.0);
        assert_approx(f(0.5), ease_in_cubic(0.5));
    }

    #[test]
    fn clamps_output_below_min() {
        let below = ease_clamp_output(constant_neg_half, 0.0, 1.0);
        assert_eq!(below(0.5), 0.0);
    }

    #[test]
    fn clamps_output_above_max() {
        let above = ease_clamp_output(constant_one_point_five, 0.0, 1.0);
        assert_eq!(above(0.5), 1.0);
    }

    #[test]
    fn respects_custom_range() {
        let f = ease_clamp_output(ease_in_cubic, 0.2, 0.8);
        assert_eq!(f(0.0), 0.2);
        assert_eq!(f(1.0), 0.8);
    }
}

mod ease_invert {
    use super::*;

    #[test]
    fn maps_0_to_1_and_1_to_0() {
        let inv = ease_invert(ease_in_cubic);
        assert_approx(inv(0.0), 1.0);
        assert_approx(inv(1.0), 0.0);
    }

    #[test]
    fn is_the_vertical_mirror() {
        let inv = ease_invert(ease_in_cubic);
        assert_approx(inv(0.5), 1.0 - ease_in_cubic(0.5));
        assert_approx(inv(0.3), 1.0 - ease_in_cubic(0.3));
    }
}

mod ease_mirror {
    use super::*;

    #[test]
    fn returns_0_at_t_0_and_1_at_t_1() {
        let f = ease_mirror(ease_in_cubic);
        assert_approx(f(0.0), 0.0);
        assert_approx(f(1.0), 1.0);
    }

    #[test]
    fn passes_through_0_5_at_t_0_5() {
        let f = ease_mirror(ease_in_cubic);
        assert_approx(f(0.5), 0.5);
    }

    #[test]
    fn is_symmetric() {
        let f = ease_mirror(ease_in_cubic);
        assert_approx(f(0.3) + f(0.7), 1.0);
        assert_approx(f(0.1) + f(0.9), 1.0);
    }
}

mod ease_reverse {
    use super::*;

    #[test]
    fn converts_an_in_curve_to_an_out_curve() {
        let reversed = ease_reverse(ease_in_cubic);
        assert_approx(reversed(0.3), 1.0 - ease_in_cubic(0.7));
        assert_approx(reversed(0.7), 1.0 - ease_in_cubic(0.3));
    }

    #[test]
    fn returns_0_at_t_0_and_1_at_t_1() {
        let reversed = ease_reverse(ease_in_cubic);
        assert_approx(reversed(0.0), 0.0);
        assert_approx(reversed(1.0), 1.0);
    }

    #[test]
    fn ease_reverse_of_ease_in_cubic_approximates_ease_out_cubic() {
        let reversed = ease_reverse(ease_in_cubic);
        assert_approx(reversed(0.5), ease_out_cubic(0.5));
        assert_approx(reversed(0.3), ease_out_cubic(0.3));
    }
}

mod ease_scale_output {
    use super::*;

    #[test]
    fn maps_0_1_output_to_from_value_to_value() {
        let f = ease_scale_output(ease_in_cubic, 100.0, 300.0);
        assert_approx(f(0.0), 100.0);
        assert_approx(f(1.0), 300.0);
        assert_approx(f(0.5), 100.0 + ease_in_cubic(0.5) * 200.0);
    }

    #[test]
    fn handles_inverted_ranges() {
        let f = ease_scale_output(ease_in_cubic, 300.0, 100.0);
        assert_approx(f(0.0), 300.0);
        assert_approx(f(1.0), 100.0);
    }

    #[test]
    fn is_identity_when_range_is_0_to_1() {
        let f = ease_scale_output(ease_in_cubic, 0.0, 1.0);
        assert_approx(f(0.5), ease_in_cubic(0.5));
    }
}
