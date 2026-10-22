use flight_command::contract::*;
use flight_signals::connect_signal;

use crate::support::*;

mod enable_command_history_signals {
    use super::*;

    #[test]
    fn allocates_once_and_returns_the_same_signal_on_a_second_call() {
        let history = create_command_history();
        assert!(get_command_history_signals(&history).is_none());
        let signal = enable_command_history_signals(&history);
        let again = enable_command_history_signals(&history);
        assert!(std::sync::Arc::ptr_eq(&signal.data, &again.data));
    }

    #[test]
    fn emits_after_an_execute_and_after_an_undo() {
        let history = create_command_history();
        register_command_binding(&history, "test.Counter", inert_binding());
        let changes = std::sync::Arc::new(std::sync::Mutex::new(0));
        let counter = changes.clone();
        let _slot = connect_signal(
            &enable_command_history_signals(&history),
            std::sync::Arc::new(move |_value: &()| *counter.lock().unwrap() += 1),
            None,
        );
        assert!(execute_command(&history, &command("test.Counter", "One")));
        assert_eq!(*changes.lock().unwrap(), 1);
        assert!(undo_command(&history));
        assert_eq!(*changes.lock().unwrap(), 2);
    }

    #[test]
    fn does_not_emit_when_a_command_was_refused_for_want_of_a_binding() {
        let history = create_command_history();
        let changes = std::sync::Arc::new(std::sync::Mutex::new(0));
        let counter = changes.clone();
        let _slot = connect_signal(
            &enable_command_history_signals(&history),
            std::sync::Arc::new(move |_value: &()| *counter.lock().unwrap() += 1),
            None,
        );
        assert!(!execute_command(&history, &command("acme.Unbound", "Nope")));
        assert_eq!(*changes.lock().unwrap(), 0);
    }
}

mod get_command_history_signals {
    use super::*;

    #[test]
    fn returns_none_until_signals_are_enabled_and_never_allocates() {
        let history = create_command_history();
        assert!(get_command_history_signals(&history).is_none());
        assert!(history.read().unwrap().on_change.is_none());
        let signal = enable_command_history_signals(&history);
        assert!(std::sync::Arc::ptr_eq(
            &get_command_history_signals(&history).expect("signal").data,
            &signal.data
        ));
    }
}
