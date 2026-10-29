use flight_signals::contract::initialize_signal;
use flight_signals::*;

mod create_signal {
    use super::*;

    #[test]
    fn initializes_with_data_none() {
        let signal: Signal<()> = create_signal();
        assert!(signal.data.read().unwrap().is_none());
    }

    #[test]
    fn initializes_with_no_connected_slots() {
        let signal: Signal<()> = create_signal();
        assert!(!has_signal_slots(&signal));
    }
}

mod initialize_signal {
    use super::*;

    #[test]
    fn reinstalls_the_default_emitter_after_a_custom_callback_and_keeps_the_data_handle() {
        let mut signal: Signal<()> = create_signal();
        let data = signal.data.clone();
        let custom_calls = std::sync::Arc::new(std::sync::Mutex::new(0));
        let custom_count = custom_calls.clone();
        *signal.emit.write().unwrap() = std::sync::Arc::new(move |_| {
            *custom_count.lock().unwrap() += 1;
        });
        initialize_signal(&mut signal);
        emit_signal(&signal, &());
        assert_eq!(*custom_calls.lock().unwrap(), 0);
        assert!(std::sync::Arc::ptr_eq(&data, &signal.data));
        let calls = std::sync::Arc::new(std::sync::Mutex::new(0));
        let count = calls.clone();
        connect_signal(
            &signal,
            std::sync::Arc::new(move |_| *count.lock().unwrap() += 1),
            None,
        );
        emit_signal(&signal, &());
        assert_eq!(*calls.lock().unwrap(), 1);
    }

    #[test]
    fn is_the_construction_initializer_of_create_signal() {
        let signal: Signal<()> = create_signal();
        connect_signal(&signal, std::sync::Arc::new(|_| {}), None);
        assert!(has_signal_slots(&signal));
        let mut reset: Signal<()> = create_signal();
        connect_signal(&reset, std::sync::Arc::new(|_| {}), None);
        initialize_signal(&mut reset);
        assert!(!has_signal_slots(&reset));
    }
}
