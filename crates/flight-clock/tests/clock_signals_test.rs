//! flight-compiler: target-native

use std::sync::{Arc, Mutex};

use flight_clock::contract::*;
use flight_signals::{FrameTick, connect_signal, emit_signal, has_signal_slots};

mod advance_clock {
    use super::*;

    #[test]
    fn does_not_emit_or_throw_when_signals_are_not_enabled() {
        let clock = create_clock();
        advance_clock(&clock, 1000.0);
        assert!(clock.read().unwrap().on_tick.is_none());
    }

    #[test]
    fn emits_on_tick_with_the_scaled_delta_when_signals_are_enabled() {
        let clock = create_clock();
        clock.write().unwrap().scale = 2.0;
        let received: Arc<Mutex<Vec<f64>>> = Arc::new(Mutex::new(Vec::new()));
        let on_tick = enable_clock_signals(&mut clock.write().unwrap());
        let sink = received.clone();
        connect_signal(
            &on_tick,
            Arc::new(move |tick: &FrameTick| sink.lock().unwrap().push(tick.delta_time)),
            None,
        );
        advance_clock(&clock, 500.0);
        assert_eq!(*received.lock().unwrap(), vec![1000.0]);
    }

    #[test]
    fn fires_a_clock_on_tick_before_its_children_advance() {
        let parent = create_clock();
        let child = create_child_clock(&parent, None);
        let seen_child_delta: Arc<Mutex<Vec<f64>>> = Arc::new(Mutex::new(Vec::new()));
        let on_tick = enable_clock_signals(&mut parent.write().unwrap());
        let probe = child.clone();
        let sink = seen_child_delta.clone();
        connect_signal(
            &on_tick,
            Arc::new(move |_tick: &FrameTick| {
                sink.lock().unwrap().push(probe.read().unwrap().delta_time)
            }),
            None,
        );
        advance_clock(&parent, 100.0);
        assert_eq!(*seen_child_delta.lock().unwrap(), vec![0.0]);
        assert_eq!(child.read().unwrap().delta_time, 100.0);
    }

    #[test]
    fn lets_an_on_tick_slot_re_enter_and_attach_a_child_that_advances_in_the_same_pass() {
        let parent = create_clock();
        let late = create_clock();
        let on_tick = enable_clock_signals(&mut parent.write().unwrap());
        let (target, added) = (parent.clone(), late.clone());
        connect_signal(
            &on_tick,
            Arc::new(move |_tick: &FrameTick| add_clock_child(&target, &added)),
            None,
        );
        advance_clock(&parent, 40.0);
        let parent_read = parent.read().unwrap();
        assert_eq!(parent_read.children.len(), 1);
        assert!(Arc::ptr_eq(&parent_read.children[0], &late));
        assert_eq!(late.read().unwrap().delta_time, 40.0);
    }
}

mod dispose_clock {
    use super::*;

    #[test]
    fn clears_on_tick_listeners() {
        let clock = create_clock();
        let on_tick = enable_clock_signals(&mut clock.write().unwrap());
        connect_signal(&on_tick, Arc::new(|_tick: &FrameTick| {}), None);
        assert!(has_signal_slots(&on_tick));
        dispose_clock(&clock);
        assert!(!has_signal_slots(&on_tick));
    }
}

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
        let hits = Arc::new(Mutex::new(0usize));
        let counter = hits.clone();
        connect_signal(
            &first,
            Arc::new(move |_tick: &FrameTick| {
                *counter.lock().unwrap() += 1;
            }),
            None,
        );
        emit_signal(&second, &FrameTick { delta_time: 1.0 });
        assert_eq!(*hits.lock().unwrap(), 1);
        assert!(Arc::ptr_eq(&first.data, &second.data));
    }
}
