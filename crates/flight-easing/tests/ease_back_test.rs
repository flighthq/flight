use flight_easing::*;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

mod ease_in_back {
    use super::*;

    #[test]
    fn returns_0_at_t_0_and_1_at_t_1() {
        assert_approx(ease_in_back(0.0), 0.0);
        assert_approx(ease_in_back(1.0), 1.0);
    }

    #[test]
    fn undershoots_below_0_before_settling() {
        assert!(ease_in_back(0.3) < 0.0);
    }
}

mod ease_in_out_back {
    use super::*;

    #[test]
    fn returns_0_at_t_0_and_1_at_t_1() {
        assert_approx(ease_in_out_back(0.0), 0.0);
        assert_approx(ease_in_out_back(1.0), 1.0);
    }
}

mod ease_out_back {
    use super::*;

    #[test]
    fn returns_0_at_t_0_and_1_at_t_1() {
        assert_approx(ease_out_back(0.0), 0.0);
        assert_approx(ease_out_back(1.0), 1.0);
    }

    #[test]
    fn overshoots_past_1_before_settling() {
        assert!(ease_out_back(0.7) > 1.0);
    }
}
