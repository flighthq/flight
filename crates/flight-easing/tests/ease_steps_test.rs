use std::sync::{Arc, Mutex};

use flight_easing::*;
use flight_easing::contract::get_step_position_string;
use flight_easing::contract::parse_step_position;
use flight_easing::contract::set_easing_steps_guard;

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
        let ease = ease_steps(4, Some(StepPosition::JumpEnd));
        assert_eq!(ease(0.0), 0.0);
        assert_eq!(ease(0.1), 0.0);
        assert_approx(ease(0.25), 0.25);
        assert_approx(ease(0.6), 0.5);
        assert_approx(ease(0.99), 0.75);
        assert_eq!(ease(1.0), 1.0);
    }

    #[test]
    fn jump_end_is_the_default_position() {
        let explicit = ease_steps(4, Some(StepPosition::JumpEnd));
        let implicit = ease_steps(4, None);
        for i in 0..=10 {
            assert_eq!(implicit(i as f32 / 10.0), explicit(i as f32 / 10.0));
        }
    }

    #[test]
    fn jump_start_jumps_immediately_and_reaches_1_before_t_1() {
        let ease = ease_steps(4, Some(StepPosition::JumpStart));
        assert_approx(ease(0.0), 0.25);
        assert_approx(ease(0.1), 0.25);
        assert_approx(ease(0.5), 0.75);
        assert_eq!(ease(0.99), 1.0);
        assert_eq!(ease(1.0), 1.0);
    }

    #[test]
    fn jump_none_spans_the_closed_range_0_to_1_with_count_minus_1_jumps() {
        let ease = ease_steps(4, Some(StepPosition::JumpNone));
        assert_eq!(ease(0.0), 0.0);
        assert_approx(ease(0.25), 1.0 / 3.0);
        assert_approx(ease(0.5), 2.0 / 3.0);
        assert_eq!(ease(0.99), 1.0);
        assert_eq!(ease(1.0), 1.0);
    }

    #[test]
    fn jump_none_with_count_1_yields_nan() {
        let ease = ease_steps(1, Some(StepPosition::JumpNone));
        assert!(ease(0.0).is_nan());
        assert!(ease(0.5).is_nan());
        assert!(ease(1.0).is_nan());
    }

    #[test]
    fn jump_both_never_outputs_0_at_the_start() {
        let ease = ease_steps(4, Some(StepPosition::JumpBoth));
        assert_approx(ease(0.0), 0.2);
        assert_approx(ease(0.1), 0.2);
        assert_approx(ease(0.25), 0.4);
        assert_approx(ease(0.99), 0.8);
        assert_eq!(ease(1.0), 1.0);
    }

    #[test]
    fn is_monotonically_non_decreasing_for_jump_end() {
        let ease = ease_steps(5, Some(StepPosition::JumpEnd));
        let mut prev = ease(0.0);
        for i in 1..=50 {
            let value = ease(i as f32 / 50.0);
            assert!(value >= prev);
            prev = value;
        }
    }
}

mod get_step_position_string {
    use super::*;

    #[test]
    fn returns_the_exact_ts_strings() {
        assert_eq!(get_step_position_string(StepPosition::JumpStart), "jumpStart");
        assert_eq!(get_step_position_string(StepPosition::JumpEnd), "jumpEnd");
        assert_eq!(get_step_position_string(StepPosition::JumpNone), "jumpNone");
        assert_eq!(get_step_position_string(StepPosition::JumpBoth), "jumpBoth");
    }
}

mod parse_step_position {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(parse_step_position("jumpStart"), Some(StepPosition::JumpStart));
        assert_eq!(parse_step_position("jumpEnd"), Some(StepPosition::JumpEnd));
        assert_eq!(parse_step_position("jumpNone"), Some(StepPosition::JumpNone));
        assert_eq!(parse_step_position("jumpBoth"), Some(StepPosition::JumpBoth));
    }

    #[test]
    fn rejects_other_text_and_wrong_casing() {
        assert_eq!(parse_step_position("JumpNone"), None);
        assert_eq!(parse_step_position("jumpnone"), None);
        assert_eq!(parse_step_position(""), None);
    }
}

mod set_easing_steps_guard {
    use super::*;

    use crate::GUARD_TEST_LOCK;

    #[test]
    fn reports_the_degenerate_jump_none_call_that_silently_returns_nan() {
        let _lock = GUARD_TEST_LOCK
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let seen: Arc<Mutex<Vec<(i32, StepPosition)>>> = Arc::new(Mutex::new(Vec::new()));
        let seen_by_guard = seen.clone();
        let guard: Arc<dyn Fn(i32, StepPosition) + Send + Sync> = Arc::new(move |count, position| {
            seen_by_guard.lock().unwrap().push((count, position));
        });
        set_easing_steps_guard(Some(guard));
        let ease = ease_steps(1, Some(StepPosition::JumpNone));
        assert!(ease(0.5).is_nan());
        set_easing_steps_guard(None);
        let seen = seen.lock().unwrap();
        assert_eq!(seen.len(), 1);
        assert_eq!(seen[0].0, 1);
        assert_eq!(seen[0].1, StepPosition::JumpNone);
    }

    #[test]
    fn stays_silent_for_well_defined_calls_and_once_uninstalled() {
        let _lock = GUARD_TEST_LOCK
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let seen: Arc<Mutex<Vec<i32>>> = Arc::new(Mutex::new(Vec::new()));
        let seen_by_guard = seen.clone();
        let guard: Arc<dyn Fn(i32, StepPosition) + Send + Sync> = Arc::new(move |count, _position| {
            seen_by_guard.lock().unwrap().push(count);
        });
        set_easing_steps_guard(Some(guard));
        ease_steps(2, Some(StepPosition::JumpNone))(0.5);
        ease_steps(1, Some(StepPosition::JumpEnd))(0.5);
        ease_steps(1, Some(StepPosition::JumpBoth))(0.5);
        set_easing_steps_guard(None);
        assert_eq!(seen.lock().unwrap().len(), 0);

        ease_steps(1, Some(StepPosition::JumpNone))(0.5);
        assert_eq!(seen.lock().unwrap().len(), 0);
    }
}
