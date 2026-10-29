use flight_entity::Ref;
use flight_input::contract::*;
use flight_signals::Signal;

fn signal_is_inert<T>(signal: &Signal<T>) -> bool {
    return signal.data.read().unwrap().is_none();
}

mod create_input_manager {
    use super::*;

    #[test]
    fn is_enabled_by_default() {
        let manager = create_input_manager();
        assert!(manager.read().unwrap().enabled);
    }

    #[test]
    fn creates_all_fifteen_inert_signals() {
        let manager = create_input_manager();
        let borrowed = manager.read().unwrap();
        assert!(signal_is_inert(&borrowed.on_key_down));
        assert!(signal_is_inert(&borrowed.on_key_up));
        assert!(signal_is_inert(&borrowed.on_pointer_down));
        assert!(signal_is_inert(&borrowed.on_pointer_up));
        assert!(signal_is_inert(&borrowed.on_pointer_move));
        assert!(signal_is_inert(&borrowed.on_pointer_move_relative));
        assert!(signal_is_inert(&borrowed.on_pointer_cancel));
        assert!(signal_is_inert(&borrowed.on_gamepad_button_down));
        assert!(signal_is_inert(&borrowed.on_gamepad_button_up));
        assert!(signal_is_inert(&borrowed.on_gamepad_axis_move));
        assert!(signal_is_inert(&borrowed.on_gamepad_connect));
        assert!(signal_is_inert(&borrowed.on_gamepad_disconnect));
        assert!(signal_is_inert(&borrowed.on_text_input));
        assert!(signal_is_inert(&borrowed.on_text_edit));
        assert!(signal_is_inert(&borrowed.on_wheel));
    }
}

mod create_input_signals {
    use super::*;

    #[test]
    fn creates_all_fifteen_inert_signals() {
        let signals = create_input_signals();
        let borrowed = signals.read().unwrap();
        assert!(signal_is_inert(&borrowed.on_key_down));
        assert!(signal_is_inert(&borrowed.on_wheel));
        assert!(signal_is_inert(&borrowed.on_gamepad_axis_move));
    }
}

mod initialize_input_manager {
    use super::*;

    fn reinitialize_disabled(manager: &Ref<InputManager>) {
        let mut locked = manager.write().unwrap();
        locked.enabled = false;
        initialize_input_manager(&mut locked);
    }

    #[test]
    fn enables_the_manager_and_gives_it_inert_signals() {
        let manager = create_input_manager();
        reinitialize_disabled(&manager);
        let borrowed = manager.read().unwrap();
        assert!(borrowed.enabled);
        assert!(signal_is_inert(&borrowed.on_key_down));
    }
}

mod initialize_input_signals {
    use super::*;

    fn reinitialize(signals: &Ref<InputSignals>) {
        let mut locked = signals.write().unwrap();
        initialize_input_signals(&mut locked);
    }

    #[test]
    fn replaces_every_signal_with_a_fresh_inert_one() {
        let signals = create_input_signals();
        reinitialize(&signals);
        let borrowed = signals.read().unwrap();
        assert!(signal_is_inert(&borrowed.on_text_input));
        assert!(signal_is_inert(&borrowed.on_gamepad_connect));
    }
}
