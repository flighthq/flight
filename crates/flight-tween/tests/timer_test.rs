use std::any::Any;
use std::cell::RefCell;
use std::rc::Rc;

use flight_signals::connect_signal;
use flight_tween::*;

mod create_tween_timer {
    use super::*;

    #[test]
    fn fires_on_complete_after_the_specified_duration() {
        let manager = create_tween_manager(None);
        let timer = create_tween_timer(&manager, 1000.0, None);
        let fired = Rc::new(RefCell::new(0i32));
        let fired_c = fired.clone();
        connect_signal(
            &timer.data.borrow().on_complete,
            Rc::new(move |_: Rc<dyn Any>| {
                *fired_c.borrow_mut() += 1;
            }),
            None,
        );
        update_tweens(&manager, 1000.0);
        assert_eq!(*fired.borrow(), 1);
    }

    #[test]
    fn does_not_fire_on_complete_before_duration_elapses() {
        let manager = create_tween_manager(None);
        let timer = create_tween_timer(&manager, 1000.0, None);
        let fired = Rc::new(RefCell::new(0i32));
        let fired_c = fired.clone();
        connect_signal(
            &timer.data.borrow().on_complete,
            Rc::new(move |_: Rc<dyn Any>| {
                *fired_c.borrow_mut() += 1;
            }),
            None,
        );
        update_tweens(&manager, 500.0);
        assert_eq!(*fired.borrow(), 0);
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
        let fired = Rc::new(RefCell::new(0i32));
        let fired_c = fired.clone();
        connect_signal(
            &timer.data.borrow().on_complete,
            Rc::new(move |_: Rc<dyn Any>| {
                *fired_c.borrow_mut() += 1;
            }),
            None,
        );
        update_tweens(&manager, 1000.0);
        assert_eq!(*fired.borrow(), 0);
        update_tweens(&manager, 500.0);
        assert_eq!(*fired.borrow(), 1);
    }

    #[test]
    fn each_call_produces_an_independent_sentinel_target() {
        let manager = create_tween_manager(None);
        let t1 = create_tween_timer(&manager, 1000.0, None);
        let t2 = create_tween_timer(&manager, 1000.0, None);
        assert!(!Rc::ptr_eq(
            &t1.data.borrow().target.props,
            &t2.data.borrow().target.props
        ));
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
        let ticks = Rc::new(RefCell::new(0i32));
        let ticks_c = ticks.clone();
        connect_signal(
            &timer.data.borrow().on_repeat,
            Rc::new(move |_: Rc<dyn Any>| {
                *ticks_c.borrow_mut() += 1;
            }),
            None,
        );
        update_tweens(&manager, 1000.0);
        update_tweens(&manager, 1000.0);
        update_tweens(&manager, 1000.0);
        assert_eq!(*ticks.borrow(), 3);
        assert!(!timer.data.borrow().complete);
    }
}
