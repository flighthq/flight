use std::any::Any;
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use flight_signals::connect_signal;
use flight_tween::*;

fn linear_ease(t: f32) -> f32 {
    return t;
}

fn get_prop(target: &TweenTarget, key: &str) -> f32 {
    return *target.props.borrow().get(key).unwrap_or(&0.0);
}

mod complete_tween {
    use super::*;

    #[test]
    fn jumps_target_to_end_value_and_marks_tween_complete() {
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
        complete_tween(&tween);
        assert_eq!(get_prop(&target, "x"), 100.0);
        assert!(tween.data.borrow().complete);
    }

    #[test]
    fn emits_on_complete() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        let fired = Rc::new(RefCell::new(0i32));
        let fired_c = fired.clone();
        connect_signal(
            &tween.data.borrow().on_complete,
            Rc::new(move |_: Rc<dyn Any>| {
                *fired_c.borrow_mut() += 1;
            }),
            None,
        );
        complete_tween(&tween);
        assert_eq!(*fired.borrow(), 1);
    }

    #[test]
    fn works_on_an_uninitialized_tween_before_first_update() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 25.0)]));
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
        assert!(!tween.data.borrow().initialized);
        complete_tween(&tween);
        assert_eq!(get_prop(&target, "x"), 100.0);
    }

    #[test]
    fn lands_on_start_value_when_reverse_is_true() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                reverse: Some(true),
                ..Default::default()
            }),
        );
        complete_tween(&tween);
        assert_eq!(get_prop(&target, "x"), 0.0);
        assert!(tween.data.borrow().complete);
    }

    #[test]
    fn is_a_no_op_on_an_already_complete_tween() {
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
        complete_tween(&tween);
        target.props.borrow_mut().insert("x".to_string(), 0.0);
        complete_tween(&tween);
        assert_eq!(get_prop(&target, "x"), 0.0);
    }
}

mod smart_rotation {
    use super::*;

    #[test]
    fn takes_the_short_path_for_a_large_positive_delta() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("rotation".to_string(), 0.0)]));
        create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("rotation".to_string(), 350.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                smart_rotation: Some(true),
                ..Default::default()
            }),
        );
        update_tweens(&manager, 500.0);
        assert!((get_prop(&target, "rotation") - (-5.0)).abs() < 0.01);
    }

    #[test]
    fn takes_the_short_path_for_a_large_negative_delta() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("rotation".to_string(), 0.0)]));
        create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("rotation".to_string(), -350.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                smart_rotation: Some(true),
                ..Default::default()
            }),
        );
        update_tweens(&manager, 500.0);
        assert!((get_prop(&target, "rotation") - 5.0).abs() < 0.01);
    }

    #[test]
    fn finds_the_short_path_when_starting_from_a_non_zero_angle() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("rotation".to_string(), 350.0)]));
        create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("rotation".to_string(), 10.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                smart_rotation: Some(true),
                ..Default::default()
            }),
        );
        update_tweens(&manager, 500.0);
        assert!((get_prop(&target, "rotation") - 360.0).abs() < 0.01);
        update_tweens(&manager, 500.0);
        assert!((get_prop(&target, "rotation") - 370.0).abs() < 0.01);
    }

    #[test]
    fn leaves_small_deltas_unchanged() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("rotation".to_string(), 0.0)]));
        create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("rotation".to_string(), 90.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                smart_rotation: Some(true),
                ..Default::default()
            }),
        );
        update_tweens(&manager, 500.0);
        assert!((get_prop(&target, "rotation") - 45.0).abs() < 0.01);
    }
}

mod update_tweens_tests {
    use super::*;

    #[test]
    fn interpolates_property_toward_target_value() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        create_tween(
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
        assert!((get_prop(&target, "x") - 50.0).abs() < 0.01);
    }

    #[test]
    fn reaches_target_value_at_end_of_duration() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        create_tween(
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
        assert_eq!(get_prop(&target, "x"), 100.0);
    }

    #[test]
    fn animates_multiple_properties_independently_to_their_respective_targets() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([
            ("x".to_string(), 0.0),
            ("y".to_string(), 0.0),
        ]));
        create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0), ("y".to_string(), 200.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                ..Default::default()
            }),
        );
        update_tweens(&manager, 1000.0);
        assert_eq!(get_prop(&target, "x"), 100.0);
        assert_eq!(get_prop(&target, "y"), 200.0);
    }

    #[test]
    fn marks_tween_complete_after_duration() {
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
        assert!(tween.data.borrow().complete);
    }

    #[test]
    fn removes_completed_tweens_from_manager() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        update_tweens(&manager, 1000.0);
        update_tweens(&manager, 0.0);
        assert!(!manager
            .data
            .borrow()
            .tweens
            .contains_key(&target_key(&target)));
    }

    #[test]
    fn emits_on_complete_when_finished() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        let fired = Rc::new(RefCell::new(0i32));
        let fired_c = fired.clone();
        connect_signal(
            &tween.data.borrow().on_complete,
            Rc::new(move |_: Rc<dyn Any>| {
                *fired_c.borrow_mut() += 1;
            }),
            None,
        );
        update_tweens(&manager, 1000.0);
        assert_eq!(*fired.borrow(), 1);
    }

    #[test]
    fn emits_on_update_each_tick() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        let updates = Rc::new(RefCell::new(0i32));
        let updates_c = updates.clone();
        connect_signal(
            &tween.data.borrow().on_update,
            Rc::new(move |_: Rc<dyn Any>| {
                *updates_c.borrow_mut() += 1;
            }),
            None,
        );
        update_tweens(&manager, 250.0);
        update_tweens(&manager, 250.0);
        assert_eq!(*updates.borrow(), 2);
    }

    #[test]
    fn respects_delay_before_starting() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        create_tween(
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
        update_tweens(&manager, 500.0);
        assert_eq!(get_prop(&target, "x"), 0.0);
        update_tweens(&manager, 500.0);
        assert!((get_prop(&target, "x") - 50.0).abs() < 0.01);
    }

    #[test]
    fn repeats_the_specified_number_of_times() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                repeat: Some(2),
                ..Default::default()
            }),
        );
        let repeats = Rc::new(RefCell::new(0i32));
        let repeats_c = repeats.clone();
        connect_signal(
            &tween.data.borrow().on_repeat,
            Rc::new(move |_: Rc<dyn Any>| {
                *repeats_c.borrow_mut() += 1;
            }),
            None,
        );
        update_tweens(&manager, 1000.0);
        update_tweens(&manager, 1000.0);
        update_tweens(&manager, 1000.0);
        assert_eq!(*repeats.borrow(), 2);
        assert!(tween.data.borrow().complete);
    }

    #[test]
    fn reverse_true_animates_from_end_value_back_to_start() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                reverse: Some(true),
                ..Default::default()
            }),
        );
        update_tweens(&manager, 100.0);
        assert!((get_prop(&target, "x") - 90.0).abs() < 0.01);
        update_tweens(&manager, 900.0);
        assert_eq!(get_prop(&target, "x"), 0.0);
    }

    #[test]
    fn reflect_reverses_direction_on_each_repeat_arriving_back_at_start() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                repeat: Some(1),
                reflect: Some(true),
                ..Default::default()
            }),
        );
        update_tweens(&manager, 1000.0);
        assert_eq!(get_prop(&target, "x"), 100.0);
        update_tweens(&manager, 250.0);
        assert!((get_prop(&target, "x") - 75.0).abs() < 0.01);
        update_tweens(&manager, 750.0);
        assert_eq!(get_prop(&target, "x"), 0.0);
    }

    #[test]
    fn emits_on_yoyo_on_direction_flip_with_reflect() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                repeat: Some(1),
                reflect: Some(true),
                ..Default::default()
            }),
        );
        let yoyos = Rc::new(RefCell::new(0i32));
        let yoyos_c = yoyos.clone();
        connect_signal(
            &tween.data.borrow().on_yoyo,
            Rc::new(move |_: Rc<dyn Any>| {
                *yoyos_c.borrow_mut() += 1;
            }),
            None,
        );
        update_tweens(&manager, 1000.0);
        assert_eq!(*yoyos.borrow(), 1);
    }

    #[test]
    fn does_not_emit_on_yoyo_without_reflect() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                repeat: Some(1),
                ..Default::default()
            }),
        );
        let yoyos = Rc::new(RefCell::new(0i32));
        let yoyos_c = yoyos.clone();
        connect_signal(
            &tween.data.borrow().on_yoyo,
            Rc::new(move |_: Rc<dyn Any>| {
                *yoyos_c.borrow_mut() += 1;
            }),
            None,
        );
        update_tweens(&manager, 1000.0);
        update_tweens(&manager, 1000.0);
        assert_eq!(*yoyos.borrow(), 0);
    }

    #[test]
    fn emits_on_yoyo_each_reflect_cycle() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                repeat: Some(3),
                reflect: Some(true),
                ..Default::default()
            }),
        );
        let yoyos = Rc::new(RefCell::new(0i32));
        let yoyos_c = yoyos.clone();
        connect_signal(
            &tween.data.borrow().on_yoyo,
            Rc::new(move |_: Rc<dyn Any>| {
                *yoyos_c.borrow_mut() += 1;
            }),
            None,
        );
        update_tweens(&manager, 1000.0);
        update_tweens(&manager, 1000.0);
        update_tweens(&manager, 1000.0);
        assert_eq!(*yoyos.borrow(), 3);
    }

    #[test]
    fn repeat_negative_one_loops_indefinitely_without_completing() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                repeat: Some(-1),
                ..Default::default()
            }),
        );
        let repeats = Rc::new(RefCell::new(0i32));
        let repeats_c = repeats.clone();
        connect_signal(
            &tween.data.borrow().on_repeat,
            Rc::new(move |_: Rc<dyn Any>| {
                *repeats_c.borrow_mut() += 1;
            }),
            None,
        );
        update_tweens(&manager, 1000.0);
        update_tweens(&manager, 1000.0);
        update_tweens(&manager, 1000.0);
        assert_eq!(*repeats.borrow(), 3);
        assert!(!tween.data.borrow().complete);
        assert_eq!(tween.data.borrow().repeat, -1);
    }

    #[test]
    fn rounds_values_when_snapping_is_true() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                snapping: Some(true),
                ..Default::default()
            }),
        );
        update_tweens(&manager, 333.0);
        let x = get_prop(&target, "x");
        assert_eq!(x, x.round());
    }

    #[test]
    fn does_not_update_paused_tween() {
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
        pause_tween(&tween);
        update_tweens(&manager, 500.0);
        assert_eq!(get_prop(&target, "x"), 0.0);
    }

    #[test]
    fn resumes_after_pause() {
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
        pause_tween(&tween);
        update_tweens(&manager, 500.0);
        resume_tween(&tween);
        update_tweens(&manager, 500.0);
        assert!((get_prop(&target, "x") - 50.0).abs() < 0.01);
    }

    #[test]
    fn elapsed_does_not_accumulate_while_paused() {
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
        pause_tween(&tween);
        update_tweens(&manager, 500.0);
        assert_eq!(tween.data.borrow().elapsed, 0.0);
        resume_tween(&tween);
        update_tweens(&manager, 500.0);
        assert!((get_prop(&target, "x") - 50.0).abs() < 0.01);
    }

    #[test]
    fn handles_negative_delta_time_without_advancing() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        create_tween(
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
        assert!((get_prop(&target, "x") - 50.0).abs() < 0.01);
        update_tweens(&manager, -200.0);
        let x = get_prop(&target, "x");
        assert!(x.is_finite());
    }

    #[test]
    fn handles_zero_duration_tween_without_nan() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            0.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                ..Default::default()
            }),
        );
        update_tweens(&manager, 1.0);
        assert_eq!(get_prop(&target, "x"), 100.0);
        assert!(tween.data.borrow().complete);
        assert!(get_prop(&target, "x").is_finite());
    }
}
