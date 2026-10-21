use std::sync::Arc;

use flight_textshaper::contract::*;

fn state() -> TextShaperSignalsState {
    let make: fn() -> TextShaperSignalsState = TextShaperSignalsState::default;
    return make();
}

mod dispose_text_shaper_signals {
    use super::*;

    #[test]
    fn is_a_no_op_when_signals_have_not_been_enabled() {
        let mut state = state();
        dispose_text_shaper_signals(&mut state);
        assert!(get_text_shaper_signals(&state).is_none());
    }

    #[test]
    fn get_returns_null_after_dispose_and_a_new_entity_follows() {
        let mut state = state();
        let first = enable_text_shaper_signals(&mut state);
        dispose_text_shaper_signals(&mut state);
        assert!(get_text_shaper_signals(&state).is_none());
        assert!(!Arc::ptr_eq(
            &enable_text_shaper_signals(&mut state),
            &first
        ));
    }

    #[test]
    fn clears_the_backend_changed_signal() {
        let mut state = state();
        let signals = enable_text_shaper_signals(&mut state);
        dispose_text_shaper_signals(&mut state);
        assert!(
            signals
                .read()
                .unwrap()
                .on_backend_changed
                .data
                .read()
                .unwrap()
                .is_none()
        );
    }
}

mod enable_text_shaper_signals {
    use super::*;

    #[test]
    fn returns_a_text_shaper_signals_entity_with_on_backend_changed() {
        let mut state = state();
        let signals = enable_text_shaper_signals(&mut state);
        let emit = signals
            .read()
            .unwrap()
            .on_backend_changed
            .emit
            .read()
            .unwrap()
            .clone();
        emit(&None);
    }

    #[test]
    fn is_idempotent_returning_the_same_entity_on_repeat_calls() {
        let mut state = state();
        let first = enable_text_shaper_signals(&mut state);
        assert!(Arc::ptr_eq(&enable_text_shaper_signals(&mut state), &first));
    }

    #[test]
    fn keeps_separate_states_separate() {
        let (mut a, mut b) = (state(), state());
        assert!(!Arc::ptr_eq(
            &enable_text_shaper_signals(&mut a),
            &enable_text_shaper_signals(&mut b)
        ));
    }
}

mod get_text_shaper_signals {
    use super::*;

    #[test]
    fn returns_null_before_signals_are_enabled_and_the_entity_after() {
        let mut state = state();
        assert!(get_text_shaper_signals(&state).is_none());
        let signals = enable_text_shaper_signals(&mut state);
        assert!(Arc::ptr_eq(
            &get_text_shaper_signals(&state).unwrap(),
            &signals
        ));
    }
}

mod initialize_text_shaper_signals {
    use super::*;

    #[test]
    fn is_the_construction_initializer_giving_a_fresh_signal() {
        let mut state = state();
        let signals = enable_text_shaper_signals(&mut state);
        let before = signals.read().unwrap().on_backend_changed.data.clone();
        initialize_text_shaper_signals(&mut signals.write().unwrap());
        assert!(!Arc::ptr_eq(
            &before,
            &signals.read().unwrap().on_backend_changed.data
        ));
    }
}
