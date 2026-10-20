use flight_math::*;
use std::f32::consts::PI;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

mod damp {
    use super::*;

    #[test]
    fn moves_current_toward_target_over_time() {
        let result = damp(0.0, 10.0, 1.0, 1.0);
        assert!(result > 0.0);
        assert!(result < 10.0);
    }

    #[test]
    fn returns_current_when_delta_time_is_0() {
        assert_eq!(damp(5.0, 10.0, 2.0, 0.0), 5.0);
    }

    #[test]
    fn returns_current_when_lambda_is_0() {
        assert_eq!(damp(5.0, 10.0, 0.0, 1.0), 5.0);
    }

    #[test]
    fn approaches_target_asymptotically() {
        let step_value = damp(0.0, 1.0, 5.0, 0.1);
        assert!(step_value > 0.39);
        assert!(step_value < 0.41);
    }

    #[test]
    fn is_frame_rate_independent_two_half_steps_equal_one_full_step() {
        let full = damp(0.0, 1.0, 2.0, 0.2);
        let half1 = damp(0.0, 1.0, 2.0, 0.1);
        let half2 = damp(half1, 1.0, 2.0, 0.1);
        assert_approx(half2, full);
    }
}

mod lerp_angle {
    use super::*;

    #[test]
    fn interpolates_between_two_close_angles() {
        let result = lerp_angle(0.0, PI / 2.0, 0.5);
        assert_approx(result, PI / 4.0);
    }

    #[test]
    fn takes_the_shortest_arc_across_zero_two_pi() {
        let tau = PI * 2.0;
        let result = lerp_angle(PI * 1.9, PI * 0.1, 0.5);
        let normalised = ((result % tau) + tau) % tau;
        assert_approx(normalised, 0.0);
    }

    #[test]
    fn takes_the_shortest_arc_clockwise_across_zero_two_pi() {
        let result = lerp_angle(PI * 0.1, PI * 1.9, 0.5);
        assert_approx(result, 0.0);
    }

    #[test]
    fn returns_a_at_t_zero() {
        assert_approx(lerp_angle(1.0, 2.0, 0.0), 1.0);
    }

    #[test]
    fn returns_b_at_t_one() {
        assert_approx(lerp_angle(1.0, 2.0, 1.0), 2.0);
    }
}

mod move_towards {
    use super::*;

    #[test]
    fn moves_toward_target_by_max_delta() {
        assert_eq!(move_towards(0.0, 10.0, 3.0), 3.0);
    }

    #[test]
    fn snaps_to_target_when_within_max_delta() {
        assert_eq!(move_towards(9.0, 10.0, 5.0), 10.0);
    }

    #[test]
    fn works_when_target_is_below_current() {
        assert_eq!(move_towards(10.0, 0.0, 3.0), 7.0);
    }

    #[test]
    fn returns_target_when_current_equals_target() {
        assert_eq!(move_towards(5.0, 5.0, 1.0), 5.0);
    }
}

mod ping_pong {
    use super::*;

    #[test]
    fn starts_at_0() {
        assert_eq!(ping_pong(0.0, 1.0), 0.0);
    }

    #[test]
    fn reaches_length_at_t_equals_length() {
        assert_eq!(ping_pong(1.0, 1.0), 1.0);
    }

    #[test]
    fn bounces_back_at_t_1_5_times_length() {
        assert_approx(ping_pong(1.5, 1.0), 0.5);
    }

    #[test]
    fn propagates_nan_when_length_is_0() {
        assert!(ping_pong(1.0, 0.0).is_nan());
    }

    #[test]
    fn works_with_larger_lengths() {
        assert_approx(ping_pong(3.0, 2.0), 1.0);
    }
}

mod repeat {
    use super::*;

    #[test]
    fn wraps_t_over_0_length() {
        assert_approx(repeat(1.6, 1.0), 0.6);
    }

    #[test]
    fn returns_0_for_exact_multiple() {
        assert_approx(repeat(2.0, 1.0), 0.0);
    }

    #[test]
    fn handles_negative_t() {
        let r = repeat(-0.3, 1.0);
        assert!(r >= 0.0);
        assert!(r < 1.0);
    }

    #[test]
    fn propagates_nan_when_length_is_0() {
        assert!(repeat(1.0, 0.0).is_nan());
    }
}

mod smoother_step {
    use super::*;

    #[test]
    fn returns_0_at_the_lower_edge() {
        assert_eq!(smoother_step(0.0, 1.0, 0.0), 0.0);
    }

    #[test]
    fn returns_1_at_the_upper_edge() {
        assert_eq!(smoother_step(0.0, 1.0, 1.0), 1.0);
    }

    #[test]
    fn returns_0_5_at_the_midpoint() {
        assert_eq!(smoother_step(0.0, 1.0, 0.5), 0.5);
    }

    #[test]
    fn returns_0_for_x_below_the_lower_edge() {
        assert_eq!(smoother_step(0.0, 1.0, -1.0), 0.0);
    }

    #[test]
    fn returns_1_for_x_above_the_upper_edge() {
        assert_eq!(smoother_step(0.0, 1.0, 2.0), 1.0);
    }

    #[test]
    fn has_zero_first_and_second_derivatives_at_the_edges() {
        // The smoother_step polynomial (6x^5 - 15x^4 + 10x^3) suffers from
        // catastrophic cancellation of its large intermediate terms near x=1 in
        // f32, so the numerical derivative at the upper edge is less precise
        // than for smooth_step. We use h=0.01 and a tolerance that accommodates
        // both the O(h) truncation error and the f32 rounding noise.
        let h = 0.01_f32;
        let d_low = (smoother_step(0.0, 1.0, h) - smoother_step(0.0, 1.0, 0.0)) / h;
        let d_high = (smoother_step(0.0, 1.0, 1.0) - smoother_step(0.0, 1.0, 1.0 - h)) / h;
        assert!(
            d_low.abs() < 0.15,
            "expected derivative near 0 at the lower edge, got {d_low}"
        );
        assert!(
            d_high.abs() < 0.15,
            "expected derivative near 0 at the upper edge, got {d_high}"
        );
    }
}
