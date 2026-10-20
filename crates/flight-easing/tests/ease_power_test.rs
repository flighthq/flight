use flight_easing::*;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

mod ease_in_out_power {
    use super::*;

    #[test]
    fn returns_0_at_t_0_and_1_at_t_1() {
        let f = ease_in_out_power(3.0);
        assert_approx(f(0.0), 0.0);
        assert_approx(f(1.0), 1.0);
    }

    #[test]
    fn passes_through_0_5_at_t_0_5() {
        let f = ease_in_out_power(3.0);
        assert_approx(f(0.5), 0.5);
    }

    #[test]
    fn matches_ease_in_out_cubic_at_exponent_3() {
        let f = ease_in_out_power(3.0);
        assert_approx(f(0.3), ease_in_out_cubic(0.3));
        assert_approx(f(0.7), ease_in_out_cubic(0.7));
    }

    #[test]
    fn is_symmetric() {
        let f = ease_in_out_power(4.0);
        assert_approx(f(0.3) + f(0.7), 1.0);
        assert_approx(f(0.1) + f(0.9), 1.0);
    }
}

mod ease_in_power {
    use super::*;

    #[test]
    fn returns_0_at_t_0_and_1_at_t_1_for_any_exponent() {
        for exp in [0.5, 1.0, 2.0, 3.0, 5.0] {
            let f = ease_in_power(exp);
            assert_approx(f(0.0), 0.0);
            assert_approx(f(1.0), 1.0);
        }
    }

    #[test]
    fn matches_ease_in_quadratic_at_exponent_2() {
        let f = ease_in_power(2.0);
        assert_approx(f(0.5), ease_in_quadratic(0.5));
        assert_approx(f(0.3), ease_in_quadratic(0.3));
    }

    #[test]
    fn matches_ease_in_quintic_at_exponent_5() {
        let f = ease_in_power(5.0);
        assert_approx(f(0.5), ease_in_quintic(0.5));
        assert_approx(f(0.7), ease_in_quintic(0.7));
    }

    #[test]
    fn sub_linear_at_exponent_less_than_1() {
        let f = ease_in_power(0.5);
        assert_approx(f(0.25), 0.5);
    }

    #[test]
    fn is_monotonically_increasing() {
        let f = ease_in_power(2.5);
        let mut prev = f(0.0);
        for i in 1..=20 {
            let v = f(i as f32 / 20.0);
            assert!(v > prev);
            prev = v;
        }
    }
}

mod ease_out_power {
    use super::*;

    #[test]
    fn returns_0_at_t_0_and_1_at_t_1() {
        let f = ease_out_power(2.0);
        assert_approx(f(0.0), 0.0);
        assert_approx(f(1.0), 1.0);
    }

    #[test]
    fn matches_ease_out_quadratic_at_exponent_2() {
        let f = ease_out_power(2.0);
        assert_approx(f(0.5), ease_out_quadratic(0.5));
        assert_approx(f(0.8), ease_out_quadratic(0.8));
    }

    #[test]
    fn is_monotonically_increasing() {
        let f = ease_out_power(3.0);
        let mut prev = f(0.0);
        for i in 1..=20 {
            let v = f(i as f32 / 20.0);
            assert!(v > prev);
            prev = v;
        }
    }
}
