use std::any::Any;
use std::cell::RefCell;
use std::rc::Rc;
use std::sync::{Arc, Mutex};

use flight_signals::connect_signal;
use flight_tween::*;

mod create_tween_timer {
    use super::*;

    #[test]
    fn fires_on_complete_after_the_specified_duration() {
        let manager = create_tween_manager(None);
        let timer = create_tween_timer(&manager, 1000.0, None);
        let fired = Arc::new(Mutex::new(0i32));
        let fired_c = fired.clone();
        connect_signal(
            &timer.data.borrow().on_complete,
            Arc::new(move |_: &()| {
                *fired_c.lock().unwrap() += 1;
            }),
            None,
        );
        update_tweens(&manager, 1000.0);
        assert_eq!(*fired.lock().unwrap(), 1);
    }

    #[test]
    fn does_not_fire_on_complete_before_duration_elapses() {
        let manager = create_tween_manager(None);
        let timer = create_tween_timer(&manager, 1000.0, None);
        let fired = Arc::new(Mutex::new(0i32));
        let fired_c = fired.clone();
        connect_signal(
            &timer.data.borrow().on_complete,
            Arc::new(move |_: &()| {
                *fired_c.lock().unwrap() += 1;
            }),
            None,
        );
        update_tweens(&manager, 500.0);
        assert_eq!(*fired.lock().unwrap(), 0);
    }

    #[test]
    fn respects_the_delay_option() {
        let manager = create_tween_manager(None);
        let timer = create_tween_timer(
            &manager,
            1000.0,
            Some(&TweenOptions {
                delay: Some(500.0),
                ..Default::default()
            }),
        );
        let fired = Arc::new(Mutex::new(0i32));
        let fired_c = fired.clone();
        connect_signal(
            &timer.data.borrow().on_complete,
            Arc::new(move |_: &()| {
                *fired_c.lock().unwrap() += 1;
            }),
            None,
        );
        update_tweens(&manager, 1000.0);
        assert_eq!(*fired.lock().unwrap(), 0);
        update_tweens(&manager, 500.0);
        assert_eq!(*fired.lock().unwrap(), 1);
    }

    #[test]
    fn each_call_produces_an_independent_sentinel_target() {
        let manager = create_tween_manager(None);
        let t1 = create_tween_timer(&manager, 1000.0, None);
        let t2 = create_tween_timer(&manager, 1000.0, None);
        assert!(!Arc::ptr_eq(&t1.data.borrow().target.props, &t2.data.borrow().target.props));
        assert_eq!(manager.data.borrow().tweens.len(), 2);
    }

    #[test]
    fn fires_on_repeat_and_keeps_running_when_repeat_negative_one() {
        let manager = create_tween_manager(None);
        let timer = create_tween_timer(
            &manager,
            1000.0,
            Some(&TweenOptions {
                repeat: Some(-1),
                ..Default::default()
            }),
        );
        let ticks = Arc::new(Mutex::new(0i32));
        let ticks_c = ticks.clone();
        connect_signal(
            &timer.data.borrow().on_repeat,
            Arc::new(move |_: &()| {
                *ticks_c.lock().unwrap() += 1;
            }),
            None,
        );
        update_tweens(&manager, 1000.0);
        update_tweens(&manager, 1000.0);
        update_tweens(&manager, 1000.0);
        assert_eq!(*ticks.lock().unwrap(), 3);
        assert!(!timer.data.borrow().complete);
    }
}
