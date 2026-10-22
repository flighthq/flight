use std::sync::Arc;

use flight_clock::contract::*;
use flight_signals::{FrameTick, connect_signal, emit_signal, has_signal_slots};

mod enable_clock_signals {
    use super::*;

    #[test]
    fn allocates_the_on_tick_signal_and_returns_it() {
        let clock = create_clock();
        let on_tick = enable_clock_signals(&mut clock.write().unwrap());
        assert!(clock.read().unwrap().on_tick.is_some());
        connect_signal(&on_tick, Arc::new(|_tick: &FrameTick| {}), None);
        assert!(has_signal_slots(
            clock.read().unwrap().on_tick.as_ref().unwrap()
        ));
    }

    #[test]
    fn is_idempotent_a_second_call_returns_the_same_signal() {
        let clock = create_clock();
        let first = enable_clock_signals(&mut clock.write().unwrap());
        let second = enable_clock_signals(&mut clock.write().unwrap());
        let hits = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let counter = hits.clone();
        connect_signal(
            &first,
            Arc::new(move |_tick: &FrameTick| {
                counter.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            }),
            None,
        );
        emit_signal(&second, &FrameTick { delta_time: 1.0 });
        assert_eq!(hits.load(std::sync::atomic::Ordering::SeqCst), 1);
        assert!(Arc::ptr_eq(&first.data, &second.data));
    }
}
