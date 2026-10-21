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
            &timer.on_complete(),
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
            &timer.on_complete(),
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
                ease: None,
                overwrite: None,
                reflect: None,
                repeat: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        let fired = Arc::new(Mutex::new(0i32));
        let fired_c = fired.clone();
        connect_signal(
            &timer.on_complete(),
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
        let _t1 = create_tween_timer(&manager, 1000.0, None);
        let _t2 = create_tween_timer(&manager, 1000.0, None);
        assert_eq!(get_active_tween_count(&manager), 2);
    }

    #[test]
    fn fires_on_repeat_and_keeps_running_when_repeat_negative_one() {
        let manager = create_tween_manager(None);
        let timer = create_tween_timer(
            &manager,
            1000.0,
            Some(&TweenOptions {
                delay: None,
                ease: None,
                overwrite: None,
                reflect: None,
                repeat: Some(-1),
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        let ticks = Arc::new(Mutex::new(0i32));
        let ticks_c = ticks.clone();
        connect_signal(
            &timer.on_repeat(),
            Arc::new(move |_: &()| {
                *ticks_c.lock().unwrap() += 1;
            }),
            None,
        );
        update_tweens(&manager, 1000.0);
        update_tweens(&manager, 1000.0);
        update_tweens(&manager, 1000.0);
        assert_eq!(*ticks.lock().unwrap(), 3);
        assert!(!timer.is_complete());
    }
}
