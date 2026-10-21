use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use flight_signals::connect_signal;
use flight_tween::*;

fn linear_ease(t: f32) -> f32 {
    t
}

fn get_prop(target: &TweenTarget, key: &str) -> f32 {
    *target.props.read().unwrap().get(key).unwrap_or(&0.0)
}

mod get_tween_progress_mod {
    use super::*;

    #[test]
    fn returns_0_before_any_update() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        assert_eq!(get_tween_progress(&tween), 0.0);
    }

    #[test]
    fn returns_0_while_still_in_delay_phase() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                delay: Some(500.0),
                ..Default::default()
            }),
        );
        update_tweens(&manager, 400.0);
        assert_eq!(get_tween_progress(&tween), 0.0);
    }

    #[test]
    fn returns_half_at_the_halfway_point() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                ..Default::default()
            }),
        );
        update_tweens(&manager, 500.0);
        assert!((get_tween_progress(&tween) - 0.5).abs() < 0.01);
    }

    #[test]
    fn returns_1_when_complete() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        update_tweens(&manager, 1000.0);
        assert_eq!(get_tween_progress(&tween), 1.0);
    }
}

mod invalidate_tween_mod {
    use super::*;

    #[test]
    fn resets_initialized_complete_and_elapsed() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                ..Default::default()
            }),
        );
        update_tweens(&manager, 1000.0);
        assert!(tween.data.read().unwrap().complete);
        invalidate_tween(&tween);
        assert!(!tween.data.read().unwrap().initialized);
        assert!(!tween.data.read().unwrap().complete);
        assert_eq!(tween.data.read().unwrap().elapsed, 0.0);
    }

    #[test]
    fn re_captures_start_values_from_current_target_state_on_next_update() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                ..Default::default()
            }),
        );
        update_tweens(&manager, 1000.0); // x is now 100
        invalidate_tween(&tween);
        // Re-register: the new start is 100
        let key = target_key(&target);
        manager
            .data
            .write().unwrap()
            .tweens
            .iter_mut()
            .find(|(k, _)| *k == key)
            .unwrap()
            .1
            .push(tween.clone());
        update_tweens(&manager, 1000.0); // tween from 100 to 100 (change is 0)
        assert_eq!(get_prop(&target, "x"), 100.0);
    }
}

mod restart_tween_mod {
    use super::*;

    #[test]
    fn resets_complete_and_elapsed_to_zero() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                ..Default::default()
            }),
        );
        update_tweens(&manager, 1000.0);
        assert!(tween.data.read().unwrap().complete);
        restart_tween(&tween, true);
        assert!(!tween.data.read().unwrap().complete);
        assert_eq!(tween.data.read().unwrap().elapsed, 0.0);
    }

    #[test]
    fn include_delay_false_skips_the_initial_delay() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                delay: Some(500.0),
                ..Default::default()
            }),
        );
        restart_tween(&tween, false);
        assert_eq!(tween.data.read().unwrap().elapsed, 500.0);
    }

    #[test]
    fn keeps_initialized_false_so_start_values_are_re_captured() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        update_tweens(&manager, 500.0); // gets initialized
        restart_tween(&tween, true);
        assert!(!tween.data.read().unwrap().initialized);
    }
}

mod seek_tween_mod {
    use super::*;

    #[test]
    fn immediately_applies_property_values_at_the_given_time() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                ..Default::default()
            }),
        );
        seek_tween(&tween, 500.0);
        assert!((get_prop(&target, "x") - 50.0).abs() < 0.01);
    }

    #[test]
    fn clamps_to_0_when_time_is_negative() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                ..Default::default()
            }),
        );
        seek_tween(&tween, -100.0);
        assert_eq!(get_prop(&target, "x"), 0.0);
    }

    #[test]
    fn clamps_to_the_end_value_when_time_exceeds_duration() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                ..Default::default()
            }),
        );
        seek_tween(&tween, 9999.0);
        assert_eq!(get_prop(&target, "x"), 100.0);
        assert!(tween.data.read().unwrap().complete);
    }

    #[test]
    fn accounts_for_delay_in_the_elapsed_time() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                delay: Some(500.0),
                ..Default::default()
            }),
        );
        seek_tween(&tween, 1000.0); // delay=500 + 500ms active = 50%
        assert!((get_prop(&target, "x") - 50.0).abs() < 0.01);
    }

    #[test]
    fn emits_on_update_when_applying_values() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        let updates = Arc::new(Mutex::new(0i32));
        let updates_c = updates.clone();
        connect_signal(
            &tween.data.read().unwrap().on_update,
            Arc::new(move |_: &()| {
                *updates_c.lock().unwrap() += 1;
            }),
            None,
        );
        seek_tween(&tween, 500.0);
        assert_eq!(*updates.lock().unwrap(), 1);
    }

    #[test]
    fn fires_on_complete_when_seeking_to_exact_end() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                delay: Some(200.0),
                ..Default::default()
            }),
        );
        let fired = Arc::new(Mutex::new(0i32));
        let fired_c = fired.clone();
        connect_signal(
            &tween.data.read().unwrap().on_complete,
            Arc::new(move |_: &()| {
                *fired_c.lock().unwrap() += 1;
            }),
            None,
        );
        seek_tween(&tween, 1200.0);
        assert_eq!(*fired.lock().unwrap(), 1);
        assert!(tween.data.read().unwrap().complete);
    }

    #[test]
    fn does_not_fire_on_complete_when_seeking_just_before_the_end() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                delay: Some(200.0),
                ..Default::default()
            }),
        );
        let fired = Arc::new(Mutex::new(0i32));
        let fired_c = fired.clone();
        connect_signal(
            &tween.data.read().unwrap().on_complete,
            Arc::new(move |_: &()| {
                *fired_c.lock().unwrap() += 1;
            }),
            None,
        );
        seek_tween(&tween, 1199.999);
        assert_eq!(*fired.lock().unwrap(), 0);
        assert!(!tween.data.read().unwrap().complete);
    }

    #[test]
    fn is_alias_safe() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                ..Default::default()
            }),
        );
        seek_tween(&tween, 500.0);
        assert!((get_prop(&target, "x") - 50.0).abs() < 0.01);
        // Calling again should be consistent
        seek_tween(&tween, 750.0);
        assert!((get_prop(&target, "x") - 75.0).abs() < 0.01);
    }
}

mod set_tween_progress_mod {
    use super::*;

    #[test]
    fn applies_the_progress_fraction_to_target_values() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                ..Default::default()
            }),
        );
        set_tween_progress(&tween, 0.5);
        assert!((get_prop(&target, "x") - 50.0).abs() < 0.01);
    }

    #[test]
    fn clamps_progress_to_0() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                ..Default::default()
            }),
        );
        set_tween_progress(&tween, -1.0);
        assert_eq!(get_prop(&target, "x"), 0.0);
    }

    #[test]
    fn clamps_progress_to_1_and_marks_tween_complete() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                ..Default::default()
            }),
        );
        set_tween_progress(&tween, 2.0);
        assert_eq!(get_prop(&target, "x"), 100.0);
        assert!(tween.data.read().unwrap().complete);
    }

    #[test]
    fn fires_on_complete_when_setting_progress_to_1() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                ..Default::default()
            }),
        );
        let fired = Arc::new(Mutex::new(0i32));
        let fired_c = fired.clone();
        connect_signal(
            &tween.data.read().unwrap().on_complete,
            Arc::new(move |_: &()| {
                *fired_c.lock().unwrap() += 1;
            }),
            None,
        );
        set_tween_progress(&tween, 1.0);
        assert_eq!(*fired.lock().unwrap(), 1);
        assert!(tween.data.read().unwrap().complete);
    }

    #[test]
    fn is_alias_safe_multiple_sequential_calls_produce_consistent_results() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                ..Default::default()
            }),
        );
        set_tween_progress(&tween, 0.25);
        assert!((get_prop(&target, "x") - 25.0).abs() < 0.01);
        set_tween_progress(&tween, 0.75);
        assert!((get_prop(&target, "x") - 75.0).abs() < 0.01);
    }
}
