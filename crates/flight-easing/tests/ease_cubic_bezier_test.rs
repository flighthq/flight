use flight_easing::*;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

mod ease_cubic_bezier {
    use super::*;

    #[test]
    fn returns_exact_endpoints_regardless_of_control_points() {
        let ease = ease_cubic_bezier(0.25, 0.1, 0.25, 1.0);
        assert_eq!(ease(0.0), 0.0);
        assert_eq!(ease(1.0), 1.0);
    }

    #[test]
    fn clamps_out_of_range_input_to_the_endpoints() {
        let ease = ease_cubic_bezier(0.42, 0.0, 0.58, 1.0);
        assert_eq!(ease(-0.5), 0.0);
        assert_eq!(ease(1.5), 1.0);
    }

    #[test]
    fn approximates_the_identity_for_diagonal_control_points() {
        let linear = ease_cubic_bezier(0.0, 0.0, 1.0, 1.0);
        for i in 0..=10 {
            let t = i as f32 / 10.0;
            assert_approx(linear(t), t);
        }
    }

    #[test]
    fn matches_the_css_ease_curve_at_a_sampled_point() {
        let ease = ease_cubic_bezier(0.25, 0.1, 0.25, 1.0);
        let val = ease(0.5);
        assert!((val - 0.8024).abs() < 0.01);
        assert!(val > 0.5);
    }

    #[test]
    fn is_monotonically_non_decreasing_across_the_interval() {
        let ease = ease_cubic_bezier(0.25, 0.1, 0.25, 1.0);
        let mut prev = ease(0.0);
        for i in 1..=50 {
            let value = ease(i as f32 / 50.0);
            assert!(value >= prev - 1e-6);
            prev = value;
        }
    }

    #[test]
    fn inverts_x_correctly_for_an_asymmetric_curve() {
        let ease = ease_cubic_bezier(0.42, 0.0, 0.58, 1.0);
        let val = ease(0.5);
        assert!((val - 0.5).abs() < 0.01);
    }
}
