use flight_easing::*;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

mod ease_smootherstep {
    use super::*;

    #[test]
    fn returns_0_at_t_0_and_1_at_t_1() {
        assert_eq!(ease_smootherstep(0.0), 0.0);
        assert_eq!(ease_smootherstep(1.0), 1.0);
    }

    #[test]
    fn is_symmetric_about_the_midpoint() {
        assert_approx(ease_smootherstep(0.5), 0.5);
    }

    #[test]
    fn is_monotonically_increasing() {
        let mut prev = ease_smootherstep(0.0);
        for i in 1..=20 {
            let value = ease_smootherstep(i as f32 / 20.0);
            assert!(value >= prev);
            prev = value;
        }
    }
}

mod ease_smoothstep {
    use super::*;

    #[test]
    fn returns_0_at_t_0_and_1_at_t_1() {
        assert_eq!(ease_smoothstep(0.0), 0.0);
        assert_eq!(ease_smoothstep(1.0), 1.0);
    }

    #[test]
    fn is_symmetric_about_the_midpoint() {
        assert_approx(ease_smoothstep(0.5), 0.5);
    }

    #[test]
    fn matches_the_known_cubic_value_at_t_0_25() {
        assert_approx(ease_smoothstep(0.25), 0.15625);
    }

    #[test]
    fn is_monotonically_increasing() {
        let mut prev = ease_smoothstep(0.0);
        for i in 1..=20 {
            let value = ease_smoothstep(i as f32 / 20.0);
            assert!(value >= prev);
            prev = value;
        }
    }
}

mod ease_smoothstep_range {
    use super::*;

    #[test]
    fn returns_0_at_edge0_and_1_at_edge1() {
        let f = ease_smoothstep_range(10.0, 20.0);
        assert_eq!(f(10.0), 0.0);
        assert_eq!(f(20.0), 1.0);
    }

    #[test]
    fn clamps_below_edge0_to_0_and_above_edge1_to_1() {
        let f = ease_smoothstep_range(10.0, 20.0);
        assert_eq!(f(5.0), 0.0);
        assert_eq!(f(25.0), 1.0);
    }

    #[test]
    fn applies_smoothstep_at_the_midpoint() {
        let f = ease_smoothstep_range(0.0, 100.0);
        assert_approx(f(50.0), 0.5);
    }

    #[test]
    fn inverts_the_remap_direction_when_edge0_greater_than_edge1() {
        let f = ease_smoothstep_range(20.0, 10.0);
        assert_eq!(f(20.0), 0.0);
        assert_eq!(f(10.0), 1.0);
        assert_approx(f(15.0), 0.5);
    }

    #[test]
    fn matches_ease_smoothstep_when_range_is_0_to_1() {
        let f = ease_smoothstep_range(0.0, 1.0);
        for t in [0.0, 0.25, 0.5, 0.75, 1.0] {
            assert_approx(f(t), ease_smoothstep(t));
        }
    }

    #[test]
    fn returns_expected_values_for_degenerate_zero_width_range() {
        let f = ease_smoothstep_range(5.0, 5.0);
        assert!(f(5.0).is_nan());
        assert_eq!(f(6.0), 1.0);
        assert_eq!(f(4.0), 0.0);
    }
}
