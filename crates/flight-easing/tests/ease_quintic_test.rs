use flight_easing::*;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

mod ease_in_out_quintic {
    use super::*;

    #[test]
    fn returns_0_at_t_0_and_1_at_t_1() {
        assert_eq!(ease_in_out_quintic(0.0), 0.0);
        assert_eq!(ease_in_out_quintic(1.0), 1.0);
    }

    #[test]
    fn is_symmetric_at_midpoint() {
        assert_approx(ease_in_out_quintic(0.5), 0.5);
    }
}

mod ease_in_quintic {
    use super::*;

    #[test]
    fn returns_0_at_t_0_and_1_at_t_1() {
        assert_eq!(ease_in_quintic(0.0), 0.0);
        assert_eq!(ease_in_quintic(1.0), 1.0);
    }

    #[test]
    fn is_slow_at_start() {
        assert!(ease_in_quintic(0.5) < 0.5);
    }
}

mod ease_out_quintic {
    use super::*;

    #[test]
    fn returns_0_at_t_0_and_1_at_t_1() {
        assert_eq!(ease_out_quintic(0.0), 0.0);
        assert_eq!(ease_out_quintic(1.0), 1.0);
    }

    #[test]
    fn is_fast_at_start() {
        assert!(ease_out_quintic(0.5) > 0.5);
    }
}
