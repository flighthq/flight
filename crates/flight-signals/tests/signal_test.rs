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
    fn is_the_construction_initializer_of_create_signal() {
        let signal: Signal<()> = create_signal();
        connect_signal(&signal, std::sync::Arc::new(|_| {}), None);
        assert!(has_signal_slots(&signal));
        let mut reset: Signal<()> = create_signal();
        connect_signal(&reset, std::sync::Arc::new(|_| {}), None);
        flight_signals::contract::initialize_signal(&mut reset);
        assert!(!has_signal_slots(&reset));
    }
}
