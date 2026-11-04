use std::sync::Arc;

use flight_easing::*;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

fn constant_zero(_t: f32) -> f32 {
    return 0.0;
}

fn constant_one(_t: f32) -> f32 {
    return 1.0;
}

mod ease_piecewise {
    use super::*;

    #[test]
    #[should_panic]
    fn panics_on_an_empty_segments_array() {
        ease_piecewise(&[]);
    }

    #[test]
    #[should_panic]
    fn panics_when_total_weight_is_zero() {
        ease_piecewise(&[EasingSegment {
            ease: Arc::new(ease_linear),
            weight: Some(0.0),
        }]);
    }

    #[test]
    fn single_segment_is_equivalent_to_the_wrapped_function() {
        let f = ease_piecewise(&[EasingSegment {
            ease: Arc::new(ease_in_cubic),
            weight: Some(1.0),
        }]);
        assert_approx(f(0.0), ease_in_cubic(0.0));
        assert_approx(f(0.5), ease_in_cubic(0.5));
        assert_approx(f(1.0), ease_in_cubic(1.0));
    }

    #[test]
    fn two_equal_weight_segments_split_the_range_at_t_0_5() {
        let f = ease_piecewise(&[
            EasingSegment {
                ease: Arc::new(ease_linear),
                weight: Some(1.0),
            },
            EasingSegment {
                ease: Arc::new(constant_zero),
                weight: Some(1.0),
            },
        ]);
        assert_approx(f(0.25), 0.5);
        assert_approx(f(0.75), 0.0);
    }

    #[test]
    fn respects_weights() {
        let f = ease_piecewise(&[
            EasingSegment {
                ease: Arc::new(ease_linear),
                weight: Some(1.0),
            },
            EasingSegment {
                ease: Arc::new(constant_one),
                weight: Some(2.0),
            },
        ]);
        assert_approx(f(1.0 / 6.0), 0.5);
        assert_approx(f(2.0 / 3.0), 1.0);
    }

    #[test]
    fn returns_0_at_t_0_and_uses_the_last_segment_at_t_1() {
        let f = ease_piecewise(&[
            EasingSegment {
                ease: Arc::new(ease_linear),
                weight: Some(1.0),
            },
            EasingSegment {
                ease: Arc::new(ease_in_cubic),
                weight: Some(1.0),
            },
        ]);
        assert_approx(f(0.0), 0.0);
        assert_approx(f(1.0), 1.0);
    }

    #[test]
    fn is_boundary_safe_for_t_0_and_t_1() {
        let f = ease_piecewise(&[
            EasingSegment {
                ease: Arc::new(ease_in_cubic),
                weight: Some(1.0),
            },
            EasingSegment {
                ease: Arc::new(ease_linear),
                weight: Some(1.0),
            },
        ]);
        assert_approx(f(0.0), 0.0);
        assert_approx(f(1.0), 1.0);
    }

    #[test]
    fn default_weight_is_treated_as_1() {
        let explicit = ease_piecewise(&[
            EasingSegment {
                ease: Arc::new(ease_linear),
                weight: Some(1.0),
            },
            EasingSegment {
                ease: Arc::new(ease_in_cubic),
                weight: Some(1.0),
            },
        ]);
        let implicit = ease_piecewise(&[
            EasingSegment {
                ease: Arc::new(ease_linear),
                weight: None,
            },
            EasingSegment {
                ease: Arc::new(ease_in_cubic),
                weight: None,
            },
        ]);
        for i in 0..=10 {
            assert_approx(implicit(i as f32 / 10.0), explicit(i as f32 / 10.0));
        }
    }
}
