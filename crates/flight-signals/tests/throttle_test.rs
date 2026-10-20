use std::any::Any;
use std::cell::RefCell;
use std::rc::Rc;

use flight_signals::*;

mod connect_signal_at_frame_rate_tests {
    use super::*;

    #[test]
    fn accumulates_remainder_across_firings() {
        let source = create_signal();
        let fired = Rc::new(RefCell::new(Vec::<f64>::new()));
        let fired_c = fired.clone();
        let _ = connect_signal_at_frame_rate(
            &source,
            10.0, // 10fps = 100ms period
            Rc::new(move |args: Rc<dyn Any>| {
                let delta = *args.downcast_ref::<f64>().unwrap();
                fired_c.borrow_mut().push(delta);
            }),
        );
        emit_signal(&source, Rc::new(110.0_f64)); // fires once, 10ms remainder
        emit_signal(&source, Rc::new(110.0_f64)); // 120ms total, fires again
        assert_eq!(fired.borrow().len(), 2);
    }

    #[test]
    fn fires_the_slot_only_when_accumulated_delta_reaches_the_period() {
        let source = create_signal();
        let fired = Rc::new(RefCell::new(Vec::<f64>::new()));
        let fired_c = fired.clone();
        let _ = connect_signal_at_frame_rate(
            &source,
            10.0, // 10fps = 100ms period
            Rc::new(move |args: Rc<dyn Any>| {
                let delta = *args.downcast_ref::<f64>().unwrap();
                fired_c.borrow_mut().push(delta);
            }),
        );
        emit_signal(&source, Rc::new(40.0_f64));
        emit_signal(&source, Rc::new(40.0_f64));
        assert_eq!(fired.borrow().len(), 0);
        emit_signal(&source, Rc::new(40.0_f64)); // total 120ms, crosses 100ms
        assert_eq!(fired.borrow().len(), 1);
        assert!((fired.borrow()[0] - 120.0).abs() < 0.01);
    }

    #[test]
    fn returns_a_cleanup_that_stops_the_slot() {
        let source = create_signal();
        let fired = Rc::new(RefCell::new(0));
        let fired_c = fired.clone();
        let detach = connect_signal_at_frame_rate(
            &source,
            10.0,
            Rc::new(move |_: Rc<dyn Any>| {
                *fired_c.borrow_mut() += 1;
            }),
        );
        detach();
        emit_signal(&source, Rc::new(200.0_f64));
        assert_eq!(*fired.borrow(), 0);
    }
}

mod connect_signal_debounced_tests {
    use super::*;

    #[test]
    fn cleanup_stops_the_slot() {
        use_fake_timers();
        let source = create_signal();
        let count = Rc::new(RefCell::new(0));
        let count_c = count.clone();
        let detach = connect_signal_debounced(
            &source,
            100.0,
            Rc::new(move |_: Rc<dyn Any>| {
                *count_c.borrow_mut() += 1;
            }),
            None,
        );
        emit_signal(&source, Rc::new(()));
        detach();
        advance_timers_by_time(200.0);
        assert_eq!(*count.borrow(), 0);
        use_real_timers();
    }

    #[test]
    fn fires_after_the_delay_when_signal_goes_quiet() {
        use_fake_timers();
        let source = create_signal();
        let fired = Rc::new(RefCell::new(Vec::<i32>::new()));
        let fired_c = fired.clone();
        let _ = connect_signal_debounced(
            &source,
            100.0,
            Rc::new(move |args: Rc<dyn Any>| {
                let v = *args.downcast_ref::<i32>().unwrap();
                fired_c.borrow_mut().push(v);
            }),
            None,
        );
        emit_signal(&source, Rc::new(1_i32));
        emit_signal(&source, Rc::new(2_i32));
        assert!(fired.borrow().is_empty());
        advance_timers_by_time(100.0);
        assert_eq!(fired.borrow().len(), 1);
        assert_eq!(fired.borrow()[0], 2); // trailing: most recent arg
        use_real_timers();
    }

    #[test]
    fn fires_on_the_leading_edge_when_leading_is_true() {
        use_fake_timers();
        let source = create_signal();
        let count = Rc::new(RefCell::new(0));
        let count_c = count.clone();
        let _ = connect_signal_debounced(
            &source,
            100.0,
            Rc::new(move |_: Rc<dyn Any>| {
                *count_c.borrow_mut() += 1;
            }),
            Some(&SignalThrottleOptions {
                leading: Some(true),
                trailing: Some(false),
            }),
        );
        emit_signal(&source, Rc::new(()));
        assert_eq!(*count.borrow(), 1); // leading fire
        emit_signal(&source, Rc::new(()));
        emit_signal(&source, Rc::new(()));
        advance_timers_by_time(100.0);
        assert_eq!(*count.borrow(), 1); // no trailing
        use_real_timers();
    }

    #[test]
    fn resets_the_timer_on_each_emission() {
        use_fake_timers();
        let source = create_signal();
        let count = Rc::new(RefCell::new(0));
        let count_c = count.clone();
        let _ = connect_signal_debounced(
            &source,
            100.0,
            Rc::new(move |_: Rc<dyn Any>| {
                *count_c.borrow_mut() += 1;
            }),
            None,
        );
        emit_signal(&source, Rc::new(()));
        advance_timers_by_time(50.0);
        emit_signal(&source, Rc::new(())); // resets
        advance_timers_by_time(50.0);
        assert_eq!(*count.borrow(), 0); // not fired yet
        advance_timers_by_time(50.0);
        assert_eq!(*count.borrow(), 1);
        use_real_timers();
    }
}

mod connect_signal_throttled_tests {
    use super::*;

    #[test]
    fn cleanup_stops_the_slot_and_cancels_trailing() {
        use_fake_timers();
        let source = create_signal();
        let count = Rc::new(RefCell::new(0));
        let count_c = count.clone();
        let detach = connect_signal_throttled(
            &source,
            100.0,
            Rc::new(move |_: Rc<dyn Any>| {
                *count_c.borrow_mut() += 1;
            }),
            None,
        );
        emit_signal(&source, Rc::new(()));
        assert_eq!(*count.borrow(), 1);
        emit_signal(&source, Rc::new(())); // schedules trailing
        detach();
        advance_timers_by_time(200.0);
        assert_eq!(*count.borrow(), 1); // trailing was cancelled
        use_real_timers();
    }

    #[test]
    fn does_not_fire_when_both_leading_and_trailing_are_disabled() {
        use_fake_timers();
        let source = create_signal();
        let fired = Rc::new(RefCell::new(Vec::<i32>::new()));
        let fired_c = fired.clone();
        let _ = connect_signal_throttled(
            &source,
            100.0,
            Rc::new(move |args: Rc<dyn Any>| {
                let v = *args.downcast_ref::<i32>().unwrap();
                fired_c.borrow_mut().push(v);
            }),
            Some(&SignalThrottleOptions {
                leading: Some(false),
                trailing: Some(false),
            }),
        );
        emit_signal(&source, Rc::new(3_i32));
        advance_timers_by_time(100.0);
        assert!(fired.borrow().is_empty());
        use_real_timers();
    }

    #[test]
    fn fires_immediately_on_the_first_emission_leading_true() {
        use_fake_timers();
        let source = create_signal();
        let fired = Rc::new(RefCell::new(Vec::<i32>::new()));
        let fired_c = fired.clone();
        let _ = connect_signal_throttled(
            &source,
            100.0,
            Rc::new(move |args: Rc<dyn Any>| {
                let v = *args.downcast_ref::<i32>().unwrap();
                fired_c.borrow_mut().push(v);
            }),
            None,
        );
        emit_signal(&source, Rc::new(1_i32));
        assert_eq!(fired.borrow().len(), 1);
        assert_eq!(fired.borrow()[0], 1);
        use_real_timers();
    }

    #[test]
    fn fires_the_first_emission_on_the_trailing_edge_when_leading_is_disabled() {
        use_fake_timers();
        let source = create_signal();
        let fired = Rc::new(RefCell::new(Vec::<i32>::new()));
        let fired_c = fired.clone();
        let _ = connect_signal_throttled(
            &source,
            100.0,
            Rc::new(move |args: Rc<dyn Any>| {
                let v = *args.downcast_ref::<i32>().unwrap();
                fired_c.borrow_mut().push(v);
            }),
            Some(&SignalThrottleOptions {
                leading: Some(false),
                trailing: Some(true),
            }),
        );
        emit_signal(&source, Rc::new(3_i32));
        assert!(fired.borrow().is_empty());
        advance_timers_by_time(99.0);
        assert!(fired.borrow().is_empty());
        advance_timers_by_time(1.0);
        assert_eq!(*fired.borrow(), vec![3]);
        use_real_timers();
    }

    #[test]
    fn ignores_cooldown_emissions_when_trailing_is_disabled() {
        use_fake_timers();
        let source = create_signal();
        let fired = Rc::new(RefCell::new(Vec::<i32>::new()));
        let fired_c = fired.clone();
        let _ = connect_signal_throttled(
            &source,
            100.0,
            Rc::new(move |args: Rc<dyn Any>| {
                let v = *args.downcast_ref::<i32>().unwrap();
                fired_c.borrow_mut().push(v);
            }),
            Some(&SignalThrottleOptions {
                trailing: Some(false),
                ..Default::default()
            }),
        );
        emit_signal(&source, Rc::new(3_i32));
        advance_timers_by_time(50.0);
        emit_signal(&source, Rc::new(7_i32));
        advance_timers_by_time(100.0);
        assert_eq!(*fired.borrow(), vec![3]);
        use_real_timers();
    }

    #[test]
    fn preserves_the_original_args_payload_preserving() {
        use_fake_timers();
        let source = create_signal();
        let fired = Rc::new(RefCell::new(Vec::<(i32, i32)>::new()));
        let fired_c = fired.clone();
        let _ = connect_signal_throttled(
            &source,
            100.0,
            Rc::new(move |args: Rc<dyn Any>| {
                let (x, y) = *args.downcast_ref::<(i32, i32)>().unwrap();
                fired_c.borrow_mut().push((x, y));
            }),
            None,
        );
        emit_signal(&source, Rc::new((3_i32, 7_i32)));
        assert_eq!(*fired.borrow(), vec![(3, 7)]);
        use_real_timers();
    }

    #[test]
    fn suppresses_emissions_within_the_interval() {
        use_fake_timers();
        let source = create_signal();
        let fired = Rc::new(RefCell::new(Vec::<i32>::new()));
        let fired_c = fired.clone();
        let _ = connect_signal_throttled(
            &source,
            100.0,
            Rc::new(move |args: Rc<dyn Any>| {
                let v = *args.downcast_ref::<i32>().unwrap();
                fired_c.borrow_mut().push(v);
            }),
            None,
        );
        emit_signal(&source, Rc::new(1_i32));
        advance_timers_by_time(50.0);
        emit_signal(&source, Rc::new(2_i32));
        advance_timers_by_time(50.0);
        // trailing fires with value=2
        assert!(fired.borrow().contains(&1));
        assert!(fired.borrow().contains(&2));
        use_real_timers();
    }
}
