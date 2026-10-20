use flight_easing::*;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

mod ease_in_damped_sine {
    use super::*;

    #[test]
    fn returns_0_at_t_0_and_1_at_t_1() {
        let ease = ease_in_damped_sine(1.0, 0.4);
        assert_eq!(ease(0.0), 0.0);
        assert_eq!(ease(1.0), 1.0);
    }

    #[test]
    fn winds_up_below_0_before_departing() {
        assert!(ease_in_damped_sine(1.0, 0.4)(0.8) < 0.0);
    }

    #[test]
    fn matches_the_fixed_ease_in_elastic_at_the_constants_that_one_hardcodes() {
        let ease = ease_in_damped_sine(1.0, 0.4);
        for t in [0.1, 0.25, 0.4, 0.6, 0.75, 0.9] {
            assert_approx(ease(t), ease_in_elastic(t));
        }
    }
}

mod ease_in_out_damped_sine {
    use super::*;

    #[test]
    fn returns_0_at_t_0_and_1_at_t_1() {
        let ease = ease_in_out_damped_sine(1.0, 0.45);
        assert_eq!(ease(0.0), 0.0);
        assert_eq!(ease(1.0), 1.0);
    }

    #[test]
    fn matches_the_fixed_ease_in_out_elastic_at_the_constants_that_one_hardcodes() {
        let ease = ease_in_out_damped_sine(1.0, 0.45);
        for t in [0.1, 0.3, 0.5, 0.7, 0.9] {
            assert_approx(ease(t), ease_in_out_elastic(t));
        }
    }
}

mod ease_out_damped_sine {
    use super::*;

    #[test]
    fn returns_0_at_t_0_and_1_at_t_1() {
        let ease = ease_out_damped_sine(1.0, 0.4);
        assert_eq!(ease(0.0), 0.0);
        assert_eq!(ease(1.0), 1.0);
    }

    #[test]
    fn overshoots_past_1_near_the_start() {
        assert!(ease_out_damped_sine(1.0, 0.4)(0.6) > 1.0);
    }

    #[test]
    fn matches_the_fixed_ease_out_elastic_at_the_constants_that_one_hardcodes() {
        let ease = ease_out_damped_sine(1.0, 0.4);
        for t in [0.1, 0.25, 0.4, 0.6, 0.75, 0.9] {
            assert_approx(ease(t), ease_out_elastic(t));
        }
    }

    #[test]
    fn separates_the_curves_that_the_fixed_form_collapses_together() {
        let wide = ease_out_damped_sine(1.0, 0.9);
        let narrow = ease_out_damped_sine(1.0, 0.2);
        let mut widest = 0.0_f32;
        for i in 1..100 {
            let t = i as f32 / 100.0;
            let diff = (wide(t) - narrow(t)).abs();
            if diff > widest {
                widest = diff;
            }
        }
        assert!(widest > 0.5);
    }

    #[test]
    fn overshoots_further_as_amplitude_grows() {
        let peak = |amplitude: f32| -> f32 {
            let ease = ease_out_damped_sine(amplitude, 0.4);
            let mut max_val = 0.0_f32;
            for i in 1..100 {
                let v = ease(i as f32 / 100.0);
                if v > max_val {
                    max_val = v;
                }
            }
            return max_val;
        };
        assert!(peak(3.0) > peak(1.0));
    }

    #[test]
    fn raises_an_amplitude_below_1_to_the_smallest_defined_curve() {
        let clamped = ease_out_damped_sine(0.5, 0.4);
        let unit = ease_out_damped_sine(1.0, 0.4);
        for t in [0.2, 0.5, 0.8] {
            assert_approx(clamped(t), unit(t));
        }
        assert!(clamped(0.3).is_finite());
    }

    #[test]
    fn falls_back_to_the_fixed_period_when_the_period_is_not_positive() {
        for period in [0.0, -1.0] {
            let ease = ease_out_damped_sine(1.0, period);
            assert!(ease(0.5).is_finite());
            assert_approx(ease(0.5), ease_out_damped_sine(1.0, 0.4)(0.5));
        }
    }
}
