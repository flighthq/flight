use flight_easing::*;

mod disable_easing_guards {
    use super::*;

    #[test]
    fn uninstalls_the_guard_returning_the_degenerate_call_to_silence() {
        enable_easing_guards();
        disable_easing_guards();
        let ease = ease_steps(1, StepPosition::JumpNone);
        assert!(ease(0.5).is_nan());
    }
}

mod enable_easing_guards {
    use super::*;

    #[test]
    fn does_not_panic_on_degenerate_call() {
        enable_easing_guards();
        let ease = ease_steps(1, StepPosition::JumpNone);
        assert!(ease(0.5).is_nan());
        disable_easing_guards();
    }
}
