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

mod apply_tween {
    use super::*;

    #[test]
    fn immediately_sets_properties_on_target() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        apply_tween(
            &manager,
            &target,
            &HashMap::from([("x".to_string(), 50.0)]),
        );
        assert_eq!(get_prop(&target, "x"), 50.0);
    }

    #[test]
    fn stops_conflicting_tweens_before_applying() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        apply_tween(
            &manager,
            &target,
            &HashMap::from([("x".to_string(), 50.0)]),
        );
        assert!(tween.data.read().unwrap().complete);
        assert_eq!(get_prop(&target, "x"), 50.0);
    }
}

mod create_tween {
    use super::*;

    #[test]
    fn registers_with_manager() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        assert!(has_tweens_of(&manager, &target));
    }

    #[test]
    fn stops_existing_tween_on_same_property_when_overwrite_true() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let first = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 200.0)]),
            None,
        );
        assert!(first.data.read().unwrap().complete);
    }

    #[test]
    fn does_not_stop_existing_tween_when_overwrite_false() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let first = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 200.0)]),
            Some(&TweenOptions {
                overwrite: Some(false),
                delay: None,
                ease: None,
                reflect: None,
                repeat: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        assert!(!first.data.read().unwrap().complete);
    }

    #[test]
    fn does_not_stop_existing_tween_with_non_overlapping_properties() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([
            ("x".to_string(), 0.0),
            ("y".to_string(), 0.0),
        ]));
        let first = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("y".to_string(), 200.0)]),
            None,
        );
        assert!(!first.data.read().unwrap().complete);
    }

    #[test]
    fn initializes_with_correct_defaults() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        let td = tween.data.read().unwrap();
        assert!(!td.complete);
        assert_eq!(td.elapsed, 0.0);
        assert!(!td.paused);
        assert_eq!(td.repeat, 0);
        assert!(!td.reflect);
        assert!(!td.reverse);
        assert!(!td.smart_rotation);
        assert!(!td.snapping);
    }

    #[test]
    fn pre_allocates_properties_array_from_property_map_at_creation() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([
            ("x".to_string(), 0.0),
            ("y".to_string(), 0.0),
        ]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0), ("y".to_string(), 200.0)]),
            None,
        );
        let td = tween.data.read().unwrap();
        assert_eq!(td.properties.len(), 2);
        let keys: Vec<&str> = td.properties.iter().map(|d| d.key.as_str()).collect();
        assert!(keys.contains(&"x"));
        assert!(keys.contains(&"y"));
    }
}

mod create_tween_default {
    use super::*;

    #[test]
    fn registers_on_the_contexts_default_manager() {
        let ctx = create_tween_context();
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        create_tween_default(
            &ctx,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        let dm = default_manager(&ctx);
        assert!(has_tweens_of(&dm, &target));
    }

    #[test]
    fn binds_to_the_same_target() {
        let ctx = create_tween_context();
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween_default(
            &ctx,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        assert!(Arc::ptr_eq(&tween.data.read().unwrap().target.props, &target.props));
    }

    #[test]
    fn repeated_calls_share_the_same_manager() {
        let ctx = create_tween_context();
        let t1 = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let t2 = create_tween_target(HashMap::from([("y".to_string(), 0.0)]));
        create_tween_default(
            &ctx,
            &t1,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        create_tween_default(
            &ctx,
            &t2,
            1000.0,
            &HashMap::from([("y".to_string(), 100.0)]),
            None,
        );
        let dm = default_manager(&ctx);
        assert_eq!(get_active_tween_count(&dm), 2);
    }
}

mod get_active_tween_count {
    use super::*;

    #[test]
    fn returns_0_for_an_empty_manager() {
        let manager = create_tween_manager(None);
        assert_eq!(get_active_tween_count(&manager), 0);
    }

    #[test]
    fn counts_total_tweens_across_all_targets() {
        let manager = create_tween_manager(None);
        let t1 = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let t2 = create_tween_target(HashMap::from([("y".to_string(), 0.0)]));
        create_tween(
            &manager,
            &t1,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        create_tween(
            &manager,
            &t2,
            1000.0,
            &HashMap::from([("y".to_string(), 100.0)]),
            None,
        );
        assert_eq!(get_active_tween_count(&manager), 2);
    }

    #[test]
    fn decreases_after_tweens_complete_and_are_cleaned_up() {
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
        update_tweens(&manager, 0.0); // cleanup pass
        assert_eq!(get_active_tween_count(&manager), 0);
    }
}

mod get_tweens_of {
    use super::*;

    #[test]
    fn returns_empty_vec_when_target_has_no_tweens() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::new());
        assert!(get_tweens_of(&manager, &target).is_empty());
    }

    #[test]
    fn returns_the_tweens_registered_for_a_target() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([
            ("x".to_string(), 0.0),
            ("y".to_string(), 0.0),
        ]));
        let t1 = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        let t2 = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("y".to_string(), 100.0)]),
            Some(&TweenOptions {
                overwrite: Some(false),
                delay: None,
                ease: None,
                reflect: None,
                repeat: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        let result = get_tweens_of(&manager, &target);
        assert!(result.iter().any(|t| *t == t1));
        assert!(result.iter().any(|t| *t == t2));
    }
}

mod has_tweens_of {
    use super::*;

    #[test]
    fn returns_false_when_target_has_no_tweens() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::new());
        assert!(!has_tweens_of(&manager, &target));
    }

    #[test]
    fn returns_true_when_target_has_active_tweens() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        assert!(has_tweens_of(&manager, &target));
    }

    #[test]
    fn returns_false_after_all_tweens_for_that_target_complete_and_are_cleaned_up() {
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
        update_tweens(&manager, 0.0); // cleanup pass
        assert!(!has_tweens_of(&manager, &target));
    }
}

mod kill_tweens_of_property {
    use super::*;

    #[test]
    fn marks_all_tweens_with_the_given_property_as_complete() {
        let manager = create_tween_manager(None);
        let t1 = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let t2 = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let a = create_tween(
            &manager,
            &t1,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        let b = create_tween(
            &manager,
            &t2,
            1000.0,
            &HashMap::from([("x".to_string(), 200.0)]),
            Some(&TweenOptions {
                delay: None,
                ease: None,
                overwrite: Some(false),
                reflect: None,
                repeat: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        kill_tweens_of_property(&manager, "x");
        assert!(a.data.read().unwrap().complete);
        assert!(b.data.read().unwrap().complete);
    }

    #[test]
    fn does_not_affect_tweens_without_the_given_property() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([
            ("x".to_string(), 0.0),
            ("y".to_string(), 0.0),
        ]));
        let a = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        let b = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("y".to_string(), 100.0)]),
            Some(&TweenOptions {
                overwrite: Some(false),
                delay: None,
                ease: None,
                reflect: None,
                repeat: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        kill_tweens_of_property(&manager, "x");
        assert!(a.data.read().unwrap().complete);
        assert!(!b.data.read().unwrap().complete);
    }

    #[test]
    fn is_a_no_op_when_no_tweens_match() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        // Should not panic
        kill_tweens_of_property(&manager, "z");
    }

    #[test]
    fn kills_matching_tweens_across_multiple_targets() {
        let manager = create_tween_manager(None);
        let t1_target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let t2_target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let t1 = create_tween(
            &manager,
            &t1_target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        let t2 = create_tween(
            &manager,
            &t2_target,
            1000.0,
            &HashMap::from([("x".to_string(), 200.0)]),
            None,
        );
        kill_tweens_of_property(&manager, "x");
        assert!(t1.data.read().unwrap().complete);
        assert!(t2.data.read().unwrap().complete);
    }
}

mod pause_all_tweens {
    use super::*;

    #[test]
    fn sets_paused_true_on_every_tween_in_the_manager() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let a = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        pause_all_tweens(&manager);
        assert!(a.data.read().unwrap().paused);
    }
}

mod pause_tween {
    use super::*;

    #[test]
    fn sets_paused_to_true_on_a_single_tween() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        pause_tween(&tween);
        assert!(tween.data.read().unwrap().paused);
    }
}

mod pause_tweens {
    use super::*;

    #[test]
    fn pauses_only_tweens_for_the_given_target() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let t = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        pause_tweens(&manager, &target);
        assert!(t.data.read().unwrap().paused);
    }
}

mod reset_all_tweens {
    use super::*;

    #[test]
    fn removes_all_tweens_from_the_manager_without_completing_them() {
        let manager = create_tween_manager(None);
        let t1 = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let t2 = create_tween_target(HashMap::from([("y".to_string(), 0.0)]));
        let a = create_tween(
            &manager,
            &t1,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        let b = create_tween(
            &manager,
            &t2,
            1000.0,
            &HashMap::from([("y".to_string(), 100.0)]),
            None,
        );
        reset_all_tweens(&manager);
        assert_eq!(manager.data.read().unwrap().tweens.len(), 0);
        assert!(!a.data.read().unwrap().complete);
        assert!(!b.data.read().unwrap().complete);
    }
}

mod resume_all_tweens {
    use super::*;

    #[test]
    fn sets_paused_false_on_every_tween_in_the_manager() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let a = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        pause_all_tweens(&manager);
        resume_all_tweens(&manager);
        assert!(!a.data.read().unwrap().paused);
    }
}

mod resume_tween {
    use super::*;

    #[test]
    fn sets_paused_to_false_on_a_single_tween() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        pause_tween(&tween);
        resume_tween(&tween);
        assert!(!tween.data.read().unwrap().paused);
    }
}

mod resume_tweens {
    use super::*;

    #[test]
    fn resumes_only_tweens_for_the_given_target() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let t = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        pause_tweens(&manager, &target);
        resume_tweens(&manager, &target);
        assert!(!t.data.read().unwrap().paused);
    }
}

mod stop_all_tweens {
    use super::*;

    #[test]
    fn marks_every_tween_in_the_manager_as_complete() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let a = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        stop_all_tweens(&manager, None);
        assert!(a.data.read().unwrap().complete);
    }
}

mod stop_tween {
    use super::*;

    #[test]
    fn marks_a_single_tween_as_complete() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        stop_tween(&tween, None);
        assert!(tween.data.read().unwrap().complete);
    }

    #[test]
    fn leaves_the_target_value_at_its_current_position() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                delay: None,
                overwrite: None,
                reflect: None,
                repeat: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        update_tweens(&manager, 500.0);
        assert!((get_prop(&target, "x") - 50.0).abs() < 0.01);
        stop_tween(&tween, None);
        assert!((get_prop(&target, "x") - 50.0).abs() < 0.01);
    }

    #[test]
    fn complete_true_jumps_to_end_values_before_stopping() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                delay: None,
                overwrite: None,
                reflect: None,
                repeat: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        update_tweens(&manager, 500.0);
        stop_tween(
            &tween,
            Some(&StopTweenOptions {
                complete: Some(true),
                send_event: None,
            }),
        );
        assert_eq!(get_prop(&target, "x"), 100.0);
    }

    #[test]
    fn complete_true_fires_on_complete_by_default() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
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
        stop_tween(
            &tween,
            Some(&StopTweenOptions {
                complete: Some(true),
                send_event: None,
            }),
        );
        assert_eq!(*fired.lock().unwrap(), 1);
    }

    #[test]
    fn complete_true_with_send_event_false_suppresses_on_complete() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
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
        stop_tween(
            &tween,
            Some(&StopTweenOptions {
                complete: Some(true),
                send_event: Some(false),
            }),
        );
        assert_eq!(*fired.lock().unwrap(), 0);
        assert_eq!(get_prop(&target, "x"), 100.0); // values still applied
    }
}

mod stop_tweens {
    use super::*;

    #[test]
    fn stops_all_tweens_for_a_target() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([
            ("x".to_string(), 0.0),
            ("y".to_string(), 0.0),
        ]));
        let a = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        let b = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("y".to_string(), 100.0)]),
            Some(&TweenOptions {
                delay: None,
                ease: None,
                overwrite: Some(false),
                reflect: None,
                repeat: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        stop_tweens(&manager, &target, None, None);
        assert!(a.data.read().unwrap().complete);
        assert!(b.data.read().unwrap().complete);
    }

    #[test]
    fn stops_only_tweens_with_matching_properties() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([
            ("x".to_string(), 0.0),
            ("y".to_string(), 0.0),
        ]));
        let a = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        let b = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("y".to_string(), 100.0)]),
            Some(&TweenOptions {
                overwrite: Some(false),
                delay: None,
                ease: None,
                reflect: None,
                repeat: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        stop_tweens(
            &manager,
            &target,
            Some(&HashMap::from([("x".to_string(), 0.0)])),
            None,
        );
        assert!(a.data.read().unwrap().complete);
        assert!(!b.data.read().unwrap().complete);
    }

    #[test]
    fn leaves_the_target_value_at_its_current_position() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                delay: None,
                overwrite: None,
                reflect: None,
                repeat: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        update_tweens(&manager, 500.0);
        assert!((get_prop(&target, "x") - 50.0).abs() < 0.01);
        stop_tweens(&manager, &target, None, None);
        assert!((get_prop(&target, "x") - 50.0).abs() < 0.01);
    }

    #[test]
    fn complete_true_jumps_to_end_values_before_stopping() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                ease: Some(linear_ease),
                delay: None,
                overwrite: None,
                reflect: None,
                repeat: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        update_tweens(&manager, 500.0);
        stop_tweens(
            &manager,
            &target,
            None,
            Some(&StopTweenOptions {
                complete: Some(true),
                send_event: None,
            }),
        );
        assert_eq!(get_prop(&target, "x"), 100.0);
    }

    #[test]
    fn complete_true_fires_on_complete_by_default() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
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
        stop_tweens(
            &manager,
            &target,
            None,
            Some(&StopTweenOptions {
                complete: Some(true),
                send_event: None,
            }),
        );
        assert_eq!(*fired.lock().unwrap(), 1);
    }

    #[test]
    fn complete_true_with_send_event_false_suppresses_on_complete() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
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
        stop_tweens(
            &manager,
            &target,
            None,
            Some(&StopTweenOptions {
                complete: Some(true),
                send_event: Some(false),
            }),
        );
        assert_eq!(*fired.lock().unwrap(), 0);
        assert_eq!(get_prop(&target, "x"), 100.0); // values still applied
    }
}
