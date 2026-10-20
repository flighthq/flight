use flight_easing::*;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

mod ease_in_circular {
    use super::*;

    #[test]
    fn returns_0_at_t_0_and_1_at_t_1() {
        assert_approx(ease_in_circular(0.0), 0.0);
        assert_approx(ease_in_circular(1.0), 1.0);
    }

    #[test]
    fn is_slow_at_start() {
        assert!(ease_in_circular(0.5) < 0.5);
        assert_approx(ease_in_circular(0.5), 1.0 - 0.75_f32.sqrt());
    }

    #[test]
    fn is_monotonically_increasing() {
        let mut prev = ease_in_circular(0.0);
        for i in 1..=20 {
            let value = ease_in_circular(i as f32 / 20.0);
            assert!(value >= prev);
            prev = value;
        }
    }
}

mod ease_in_out_circular {
    use super::*;

    #[test]
    fn returns_0_at_t_0_and_1_at_t_1() {
        assert_approx(ease_in_out_circular(0.0), 0.0);
        assert_approx(ease_in_out_circular(1.0), 1.0);
    }

    #[test]
    fn is_symmetric_at_midpoint() {
        assert_approx(ease_in_out_circular(0.5), 0.5);
    }
}

mod ease_out_circular {
    use super::*;

    #[test]
    fn returns_0_at_t_0_and_1_at_t_1() {
        assert_approx(ease_out_circular(0.0), 0.0);
        assert_approx(ease_out_circular(1.0), 1.0);
    }

    #[test]
    fn is_fast_at_start() {
        assert!(ease_out_circular(0.5) > 0.5);
    }
}
