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
    fn reinstalls_the_default_emitter_after_a_custom_callback() {
        let mut signal: Signal<()> = create_signal();
        let custom_calls = std::sync::Arc::new(std::sync::Mutex::new(0));
        let custom_count = custom_calls.clone();
        *signal.emit.write().unwrap() = std::sync::Arc::new(move |_| {
            *custom_count.lock().unwrap() += 1;
        });
        initialize_signal(&mut signal);
        emit_signal(&signal, &());
        assert_eq!(*custom_calls.lock().unwrap(), 0);
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

    /// flight-compiler: rust-only — TypeScript exposes field values, not their Rust lock cells.
    #[test]
    fn preserves_emit_and_data_cell_handles() {
        let mut signal: Signal<()> = create_signal();
        let emit = signal.emit.clone();
        let data = signal.data.clone();
        initialize_signal(&mut signal);
        assert!(std::sync::Arc::ptr_eq(&emit, &signal.emit));
        assert!(std::sync::Arc::ptr_eq(&data, &signal.data));
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
