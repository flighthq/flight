use flight_easing::*;

fn assert_approx(actual: f32, expected: f32) {
    let diff = (actual - expected).abs();
    assert!(
        diff < 1e-4,
        "expected {expected}, got {actual} (diff: {diff})"
    );
}

mod ease_steps {
    use super::*;

    #[test]
    fn jump_end_holds_at_0_first_and_reaches_1_only_at_t_1() {
        let ease = ease_steps(4, StepPosition::JumpEnd);
        assert_eq!(ease(0.0), 0.0);
        assert_eq!(ease(0.1), 0.0);
        assert_approx(ease(0.25), 0.25);
        assert_approx(ease(0.6), 0.5);
        assert_approx(ease(0.99), 0.75);
        assert_eq!(ease(1.0), 1.0);
    }

    #[test]
    fn jump_start_jumps_immediately_and_reaches_1_before_t_1() {
        let ease = ease_steps(4, StepPosition::JumpStart);
        assert_approx(ease(0.0), 0.25);
        assert_approx(ease(0.1), 0.25);
        assert_approx(ease(0.5), 0.75);
        assert_eq!(ease(0.99), 1.0);
        assert_eq!(ease(1.0), 1.0);
    }

    #[test]
    fn jump_none_spans_the_closed_range_0_to_1_with_count_minus_1_jumps() {
        let ease = ease_steps(4, StepPosition::JumpNone);
        assert_eq!(ease(0.0), 0.0);
        assert_approx(ease(0.25), 1.0 / 3.0);
        assert_approx(ease(0.5), 2.0 / 3.0);
        assert_eq!(ease(0.99), 1.0);
        assert_eq!(ease(1.0), 1.0);
    }

    #[test]
    fn jump_none_with_count_1_yields_nan() {
        let ease = ease_steps(1, StepPosition::JumpNone);
        assert!(ease(0.0).is_nan());
        assert!(ease(0.5).is_nan());
        assert!(ease(1.0).is_nan());
    }

    #[test]
    fn jump_both_never_outputs_0_at_the_start() {
        let ease = ease_steps(4, StepPosition::JumpBoth);
        assert_approx(ease(0.0), 0.2);
        assert_approx(ease(0.1), 0.2);
        assert_approx(ease(0.25), 0.4);
        assert_approx(ease(0.99), 0.8);
        assert_eq!(ease(1.0), 1.0);
    }

    #[test]
    fn is_monotonically_non_decreasing_for_jump_end() {
        let ease = ease_steps(5, StepPosition::JumpEnd);
        let mut prev = ease(0.0);
        for i in 1..=50 {
            let value = ease(i as f32 / 50.0);
            assert!(value >= prev);
            prev = value;
        }
    }
}

mod set_easing_steps_guard {
    use super::*;

    static GUARD_SEEN: std::sync::Mutex<Vec<(i32, bool)>> = std::sync::Mutex::new(Vec::new());

    fn recording_guard(count: i32, _position: StepPosition) {
        GUARD_SEEN.lock().unwrap().push((count, true));
    }

    #[test]
    fn reports_the_degenerate_jump_none_call_that_silently_returns_nan() {
        GUARD_SEEN.lock().unwrap().clear();
        set_easing_steps_guard(Some(recording_guard));
        let ease = ease_steps(1, StepPosition::JumpNone);
        assert!(ease(0.5).is_nan());
        set_easing_steps_guard(None);
        let seen = GUARD_SEEN.lock().unwrap();
        assert_eq!(seen.len(), 1);
        assert_eq!(seen[0].0, 1);
    }

    #[test]
    fn stays_silent_for_well_defined_calls_and_once_uninstalled() {
        GUARD_SEEN.lock().unwrap().clear();
        set_easing_steps_guard(Some(recording_guard));
        ease_steps(2, StepPosition::JumpNone)(0.5);
        ease_steps(1, StepPosition::JumpEnd)(0.5);
        ease_steps(1, StepPosition::JumpBoth)(0.5);
        set_easing_steps_guard(None);
        assert_eq!(GUARD_SEEN.lock().unwrap().len(), 0);

        ease_steps(1, StepPosition::JumpNone)(0.5);
        assert_eq!(GUARD_SEEN.lock().unwrap().len(), 0);
    }
}
