use flight_easing::*;
use flight_easing::contract::DEFAULT_EASING_DERIVATIVE_EPSILON;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 0.01,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

mod get_easing_derivative {
    use super::*;

    #[test]
    fn returns_approximately_1_everywhere_for_ease_linear() {
        for t in [0.0, 0.25, 0.5, 0.75, 1.0] {
            assert_approx(get_easing_derivative(&ease_linear, t, Some(DEFAULT_EASING_DERIVATIVE_EPSILON)), 1.0);
        }
    }

    #[test]
    fn returns_0_at_t_0_for_ease_in_cubic() {
        assert_approx(get_easing_derivative(&ease_in_cubic, 0.0, Some(DEFAULT_EASING_DERIVATIVE_EPSILON)), 0.0);
    }

    #[test]
    fn returns_3_at_t_1_for_ease_in_cubic() {
        assert_approx(get_easing_derivative(&ease_in_cubic, 1.0, Some(DEFAULT_EASING_DERIVATIVE_EPSILON)), 3.0);
    }

    #[test]
    fn returns_3_at_t_0_for_ease_out_cubic() {
        assert_approx(get_easing_derivative(&ease_out_cubic, 0.0, Some(DEFAULT_EASING_DERIVATIVE_EPSILON)), 3.0);
    }

    #[test]
    fn returns_0_at_t_1_for_ease_out_cubic() {
        assert_approx(get_easing_derivative(&ease_out_cubic, 1.0, Some(DEFAULT_EASING_DERIVATIVE_EPSILON)), 0.0);
    }

    #[test]
    fn uses_centered_difference_at_interior_points() {
        assert_approx(get_easing_derivative(&ease_in_cubic, 0.5, Some(DEFAULT_EASING_DERIVATIVE_EPSILON)), 0.75);
    }

    #[test]
    fn accepts_a_custom_epsilon() {
        assert_approx(get_easing_derivative(&ease_linear, 0.5, Some(1e-4)), 1.0);
    }

    #[test]
    fn uses_the_default_epsilon_when_none_is_given() {
        assert_approx(get_easing_derivative(&ease_linear, 0.5, None), 1.0);
        assert_approx(
            get_easing_derivative(&ease_in_cubic, 0.5, None),
            get_easing_derivative(&ease_in_cubic, 0.5, Some(DEFAULT_EASING_DERIVATIVE_EPSILON)),
        );
    }

    #[test]
    fn handles_the_left_boundary_without_panicking() {
        let _ = get_easing_derivative(&ease_in_cubic, 0.0, Some(DEFAULT_EASING_DERIVATIVE_EPSILON));
    }

    #[test]
    fn handles_the_right_boundary_without_panicking() {
        let _ = get_easing_derivative(&ease_in_cubic, 1.0, Some(DEFAULT_EASING_DERIVATIVE_EPSILON));
    }
}
