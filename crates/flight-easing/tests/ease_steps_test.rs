use flight_easing::contract::get_step_position_string;
use flight_easing::contract::parse_step_position;
use flight_easing::contract::set_easing_steps_guard;
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
        let ease: EasingFunction = ease_steps(4, Some(StepPosition::JumpEnd));
        assert_eq!(ease(0.0), 0.0);
        assert_eq!(ease(0.1), 0.0);
        assert_approx(ease(0.25), 0.25);
        assert_approx(ease(0.6), 0.5);
        assert_approx(ease(0.99), 0.75);
        assert_eq!(ease(1.0), 1.0);
    }

    #[test]
    fn jump_end_is_the_default_position() {
        let explicit: EasingFunction = ease_steps(4, Some(StepPosition::JumpEnd));
        let implicit: EasingFunction = ease_steps(4, None);
        for i in 0..=10 {
            assert_eq!(implicit(i as f32 / 10.0), explicit(i as f32 / 10.0));
        }
    }

    #[test]
    fn jump_start_jumps_immediately_and_reaches_1_before_t_1() {
        let ease: EasingFunction = ease_steps(4, Some(StepPosition::JumpStart));
        assert_approx(ease(0.0), 0.25);
        assert_approx(ease(0.1), 0.25);
        assert_approx(ease(0.5), 0.75);
        assert_eq!(ease(0.99), 1.0);
        assert_eq!(ease(1.0), 1.0);
    }

    #[test]
    fn jump_none_spans_the_closed_range_0_to_1_with_count_minus_1_jumps() {
        let ease: EasingFunction = ease_steps(4, Some(StepPosition::JumpNone));
        assert_eq!(ease(0.0), 0.0);
        assert_approx(ease(0.25), 1.0 / 3.0);
        assert_approx(ease(0.5), 2.0 / 3.0);
        assert_eq!(ease(0.99), 1.0);
        assert_eq!(ease(1.0), 1.0);
    }

    #[test]
    fn jump_none_with_count_1_yields_nan() {
        let ease: EasingFunction = ease_steps(1, Some(StepPosition::JumpNone));
        assert!(ease(0.0).is_nan());
        assert!(ease(0.5).is_nan());
        assert!(ease(1.0).is_nan());
    }

    #[test]
    fn jump_both_never_outputs_0_at_the_start() {
        let ease: EasingFunction = ease_steps(4, Some(StepPosition::JumpBoth));
        assert_approx(ease(0.0), 0.2);
        assert_approx(ease(0.1), 0.2);
        assert_approx(ease(0.25), 0.4);
        assert_approx(ease(0.99), 0.8);
        assert_eq!(ease(1.0), 1.0);
    }

    #[test]
    fn is_monotonically_non_decreasing_for_jump_end() {
        let ease: EasingFunction = ease_steps(5, Some(StepPosition::JumpEnd));
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
        assert_eq!(
            get_step_position_string(StepPosition::JumpStart),
            "jumpStart"
        );
        assert_eq!(get_step_position_string(StepPosition::JumpEnd), "jumpEnd");
        assert_eq!(get_step_position_string(StepPosition::JumpNone), "jumpNone");
        assert_eq!(get_step_position_string(StepPosition::JumpBoth), "jumpBoth");
    }
}

mod parse_step_position {
    use super::*;

    #[test]
    fn parses_the_exact_ts_strings() {
        assert_eq!(
            parse_step_position("jumpStart"),
            Some(StepPosition::JumpStart)
        );
        assert_eq!(parse_step_position("jumpEnd"), Some(StepPosition::JumpEnd));
        assert_eq!(
            parse_step_position("jumpNone"),
            Some(StepPosition::JumpNone)
        );
        assert_eq!(
            parse_step_position("jumpBoth"),
            Some(StepPosition::JumpBoth)
        );
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

    #[test]
    fn is_available_to_the_target_native_guard_suite() {
        // Bind the contract without mutating its process-global slot. Behavioral coverage lives in
        // the matched target-native enable_easing_guards suites, where the Rust tests can serialize.
        let _clear_guard = || set_easing_steps_guard(None);
    }
}
