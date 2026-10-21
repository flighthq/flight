use std::sync::{Arc, Mutex, RwLock};

use flight_entity::Ref;
use flight_signals::connect_signal;
use flight_tween::*;

fn linear_ease(t: f32) -> f32 {
    return t;
}

struct Obj {
    x: f32,
    y: f32,
}

fn get_x(target: &Ref<Obj>) -> f32 {
    return target.read().unwrap().x;
}

fn get_y(target: &Ref<Obj>) -> f32 {
    return target.read().unwrap().y;
}

fn prop_x(to: f32) -> TweenProp<Obj> {
    return TweenProp {
        get: |t: &mut Obj| &mut t.x,
        key: "x",
        to,
    };
}

fn prop_y(to: f32) -> TweenProp<Obj> {
    return TweenProp {
        get: |t: &mut Obj| &mut t.y,
        key: "y",
        to,
    };
}

fn target_x(x: f32) -> Ref<Obj> {
    return Ref::new(RwLock::new(Obj { x, y: 0.0 }));
}

fn target_xy(x: f32, y: f32) -> Ref<Obj> {
    return Ref::new(RwLock::new(Obj { x, y }));
}

mod apply_tween {
    use super::*;

    #[test]
    fn immediately_sets_properties_on_target() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        apply_tween(
            &manager,
            &target,
            &[prop_x(50.0)],
        );
        assert_eq!(get_x(&target), 50.0);
    }

    #[test]
    fn stops_conflicting_tweens_before_applying() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        apply_tween(
            &manager,
            &target,
            &[prop_x(50.0)],
        );
        assert!(tween.is_complete());
        assert_eq!(get_x(&target), 50.0);
    }
}

mod create_tween {
    use super::*;

    #[test]
    fn registers_with_manager() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        assert!(has_tweens_of(&manager, &target));
    }

    #[test]
    fn stops_existing_tween_on_same_property_when_overwrite_true() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let first = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(200.0)],
            None,
        );
        assert!(first.is_complete());
    }

    #[test]
    fn does_not_stop_existing_tween_when_overwrite_false() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let first = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(200.0)],
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
        assert!(!first.is_complete());
    }

    #[test]
    fn does_not_stop_existing_tween_with_non_overlapping_properties() {
        let manager = create_tween_manager(None);
        let target = target_xy(0.0, 0.0);
        let first = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_y(200.0)],
            None,
        );
        assert!(!first.is_complete());
    }

    #[test]
    fn initializes_with_correct_defaults() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        assert!(!tween.is_complete());
        assert_eq!(tween.elapsed(), 0.0);
        assert!(!tween.is_paused());
        assert_eq!(tween.repeat(), 0);
        assert!(!tween.reflect());
        assert!(!tween.reverse());
        assert!(!tween.smart_rotation());
        assert!(!tween.snapping());
    }

    #[test]
    fn pre_allocates_properties_array_from_property_map_at_creation() {
        let manager = create_tween_manager(None);
        let target = target_xy(0.0, 0.0);
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0), prop_y(200.0)],
            None,
        );
        let keys = tween.property_keys();
        assert_eq!(keys.len(), 2);
        assert!(keys.contains(&"x".to_string()));
        assert!(keys.contains(&"y".to_string()));
    }
}

mod create_tween_default {
    use super::*;

    #[test]
    fn registers_on_the_contexts_default_manager() {
        let ctx = create_tween_context();
        let target = target_x(0.0);
        create_tween_default(
            &ctx,
            &target,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        let dm = default_manager(&ctx);
        assert!(has_tweens_of(&dm, &target));
    }

    #[test]
    fn binds_to_the_same_target() {
        let ctx = create_tween_context();
        let target = target_x(0.0);
        create_tween_default(
            &ctx,
            &target,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        let dm = default_manager(&ctx);
        update_tweens(&dm, 1000.0);
        assert!(get_x(&target) > 0.0);
    }

    #[test]
    fn repeated_calls_share_the_same_manager() {
        let ctx = create_tween_context();
        let t1 = target_x(0.0);
        let t2 = target_x(0.0);
        create_tween_default(
            &ctx,
            &t1,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        create_tween_default(
            &ctx,
            &t2,
            1000.0,
            &[prop_x(100.0)],
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
        let t1 = target_x(0.0);
        let t2 = target_x(0.0);
        create_tween(
            &manager,
            &t1,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        create_tween(
            &manager,
            &t2,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        assert_eq!(get_active_tween_count(&manager), 2);
    }

    #[test]
    fn decreases_after_tweens_complete_and_are_cleaned_up() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        update_tweens(&manager, 1000.0);
        update_tweens(&manager, 0.0); // cleanup pass
        assert_eq!(get_active_tween_count(&manager), 0);
    }
}

mod get_tween_delay {
    use super::*;

    #[test]
    fn returns_zero_when_no_delay_set() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        assert_eq!(get_tween_delay(&tween), 0.0);
    }

    #[test]
    fn returns_the_configured_delay() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
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
        assert_eq!(get_tween_delay(&tween), 500.0);
    }
}

mod get_tween_duration {
    use super::*;

    #[test]
    fn returns_the_configured_duration() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(&manager, &target, 2000.0, &[prop_x(100.0)], None);
        assert_eq!(get_tween_duration(&tween), 2000.0);
    }
}

mod get_tween_elapsed {
    use super::*;

    #[test]
    fn starts_at_zero() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        assert_eq!(get_tween_elapsed(&tween), 0.0);
    }

    #[test]
    fn advances_after_update() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        update_tweens(&manager, 300.0);
        assert!((get_tween_elapsed(&tween) - 300.0).abs() < 0.01);
    }
}

mod get_tween_on_complete {
    use super::*;

    #[test]
    fn returns_a_signal_that_fires_on_completion() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        let fired = Arc::new(Mutex::new(false));
        let fired_c = fired.clone();
        connect_signal(
            &get_tween_on_complete(&tween),
            Arc::new(move |_: &()| { *fired_c.lock().unwrap() = true; }),
            None,
        );
        update_tweens(&manager, 1000.0);
        assert!(*fired.lock().unwrap());
    }
}

mod get_tween_on_repeat {
    use super::*;

    #[test]
    fn returns_a_signal_that_fires_on_each_repeat() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            Some(&TweenOptions {
                delay: None,
                ease: None,
                overwrite: None,
                reflect: None,
                repeat: Some(2),
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        let count = Arc::new(Mutex::new(0i32));
        let count_c = count.clone();
        connect_signal(
            &get_tween_on_repeat(&tween),
            Arc::new(move |_: &()| { *count_c.lock().unwrap() += 1; }),
            None,
        );
        update_tweens(&manager, 1000.0);
        update_tweens(&manager, 1000.0);
        assert!(*count.lock().unwrap() >= 1);
    }
}

mod get_tween_on_update {
    use super::*;

    #[test]
    fn returns_a_signal_that_fires_each_tick() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        let count = Arc::new(Mutex::new(0i32));
        let count_c = count.clone();
        connect_signal(
            &get_tween_on_update(&tween),
            Arc::new(move |_: &()| { *count_c.lock().unwrap() += 1; }),
            None,
        );
        update_tweens(&manager, 100.0);
        assert!(*count.lock().unwrap() >= 1);
    }
}

mod get_tween_on_yoyo {
    use super::*;

    #[test]
    fn returns_a_signal_that_fires_on_reflect_flip() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            Some(&TweenOptions {
                delay: None,
                ease: None,
                overwrite: None,
                reflect: Some(true),
                repeat: Some(2),
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        let fired = Arc::new(Mutex::new(false));
        let fired_c = fired.clone();
        connect_signal(
            &get_tween_on_yoyo(&tween),
            Arc::new(move |_: &()| { *fired_c.lock().unwrap() = true; }),
            None,
        );
        update_tweens(&manager, 1000.0);
        assert!(*fired.lock().unwrap());
    }
}

mod get_tween_property_keys {
    use super::*;

    #[test]
    fn returns_the_property_keys_of_the_tween() {
        let manager = create_tween_manager(None);
        let target = target_xy(0.0, 0.0);
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0), prop_y(200.0)],
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
        let keys = get_tween_property_keys(&tween);
        assert!(keys.contains(&"x".to_string()));
        assert!(keys.contains(&"y".to_string()));
    }
}

mod get_tween_repeat {
    use super::*;

    #[test]
    fn returns_zero_when_no_repeat_set() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        assert_eq!(get_tween_repeat(&tween), 0);
    }

    #[test]
    fn returns_the_configured_repeat_count() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            Some(&TweenOptions {
                delay: None,
                ease: None,
                overwrite: None,
                reflect: None,
                repeat: Some(3),
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        assert_eq!(get_tween_repeat(&tween), 3);
    }
}

mod get_tweens_of {
    use super::*;

    #[test]
    fn returns_empty_vec_when_target_has_no_tweens() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0, y: 0.0 }));
        assert!(get_tweens_of(&manager, &target).is_empty());
    }

    #[test]
    fn returns_the_tweens_registered_for_a_target() {
        let manager = create_tween_manager(None);
        let target = target_xy(0.0, 0.0);
        let t1 = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        let t2 = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_y(100.0)],
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
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0, y: 0.0 }));
        assert!(!has_tweens_of(&manager, &target));
    }

    #[test]
    fn returns_true_when_target_has_active_tweens() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        assert!(has_tweens_of(&manager, &target));
    }

    #[test]
    fn returns_false_after_all_tweens_for_that_target_complete_and_are_cleaned_up() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        update_tweens(&manager, 1000.0);
        update_tweens(&manager, 0.0); // cleanup pass
        assert!(!has_tweens_of(&manager, &target));
    }
}

mod is_tween_complete {
    use super::*;

    #[test]
    fn returns_false_before_completion() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        assert!(!is_tween_complete(&tween));
    }

    #[test]
    fn returns_true_after_completion() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        update_tweens(&manager, 1000.0);
        assert!(is_tween_complete(&tween));
    }
}

mod is_tween_initialized {
    use super::*;

    #[test]
    fn returns_false_before_first_update() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        assert!(!is_tween_initialized(&tween));
    }

    #[test]
    fn returns_true_after_first_update() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        update_tweens(&manager, 1.0);
        assert!(is_tween_initialized(&tween));
    }
}

mod is_tween_paused {
    use super::*;

    #[test]
    fn returns_false_by_default() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        assert!(!is_tween_paused(&tween));
    }

    #[test]
    fn returns_true_after_pause() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        pause_tween(&tween);
        assert!(is_tween_paused(&tween));
    }
}

mod is_tween_reflect {
    use super::*;

    #[test]
    fn returns_false_by_default() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        assert!(!is_tween_reflect(&tween));
    }

    #[test]
    fn returns_true_when_reflect_configured() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            Some(&TweenOptions {
                delay: None,
                ease: None,
                overwrite: None,
                reflect: Some(true),
                repeat: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        assert!(is_tween_reflect(&tween));
    }
}

mod is_tween_reverse {
    use super::*;

    #[test]
    fn returns_false_by_default() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        assert!(!is_tween_reverse(&tween));
    }

    #[test]
    fn returns_true_when_reverse_configured() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            Some(&TweenOptions {
                delay: None,
                ease: None,
                overwrite: None,
                reflect: None,
                repeat: None,
                reverse: Some(true),
                smart_rotation: None,
                snapping: None,
            }),
        );
        assert!(is_tween_reverse(&tween));
    }
}

mod is_tween_smart_rotation {
    use super::*;

    #[test]
    fn returns_false_by_default() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        assert!(!is_tween_smart_rotation(&tween));
    }

    #[test]
    fn returns_true_when_smart_rotation_configured() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            Some(&TweenOptions {
                delay: None,
                ease: None,
                overwrite: None,
                reflect: None,
                repeat: None,
                reverse: None,
                smart_rotation: Some(true),
                snapping: None,
            }),
        );
        assert!(is_tween_smart_rotation(&tween));
    }
}

mod is_tween_snapping {
    use super::*;

    #[test]
    fn returns_false_by_default() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(&manager, &target, 1000.0, &[prop_x(100.0)], None);
        assert!(!is_tween_snapping(&tween));
    }

    #[test]
    fn returns_true_when_snapping_configured() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            Some(&TweenOptions {
                delay: None,
                ease: None,
                overwrite: None,
                reflect: None,
                repeat: None,
                reverse: None,
                smart_rotation: None,
                snapping: Some(true),
            }),
        );
        assert!(is_tween_snapping(&tween));
    }
}

mod kill_tweens_of_property {
    use super::*;

    #[test]
    fn marks_all_tweens_with_the_given_property_as_complete() {
        let manager = create_tween_manager(None);
        let t1 = target_x(0.0);
        let t2 = target_x(0.0);
        let a = create_tween(
            &manager,
            &t1,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        let b = create_tween(
            &manager,
            &t2,
            1000.0,
            &[prop_x(200.0)],
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
        assert!(a.is_complete());
        assert!(b.is_complete());
    }

    #[test]
    fn does_not_affect_tweens_without_the_given_property() {
        let manager = create_tween_manager(None);
        let target = target_xy(0.0, 0.0);
        let a = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        let b = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_y(100.0)],
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
        assert!(a.is_complete());
        assert!(!b.is_complete());
    }

    #[test]
    fn is_a_no_op_when_no_tweens_match() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        // Should not panic
        kill_tweens_of_property(&manager, "z");
    }

    #[test]
    fn kills_matching_tweens_across_multiple_targets() {
        let manager = create_tween_manager(None);
        let t1_target = target_x(0.0);
        let t2_target = target_x(0.0);
        let t1 = create_tween(
            &manager,
            &t1_target,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        let t2 = create_tween(
            &manager,
            &t2_target,
            1000.0,
            &[prop_x(200.0)],
            None,
        );
        kill_tweens_of_property(&manager, "x");
        assert!(t1.is_complete());
        assert!(t2.is_complete());
    }
}

mod pause_all_tweens {
    use super::*;

    #[test]
    fn sets_paused_true_on_every_tween_in_the_manager() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let a = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        pause_all_tweens(&manager);
        assert!(a.is_paused());
    }
}

mod pause_tween {
    use super::*;

    #[test]
    fn sets_paused_to_true_on_a_single_tween() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        pause_tween(&tween);
        assert!(tween.is_paused());
    }
}

mod pause_tweens {
    use super::*;

    #[test]
    fn pauses_only_tweens_for_the_given_target() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let t = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        pause_tweens(&manager, &target);
        assert!(t.is_paused());
    }
}

mod reset_all_tweens {
    use super::*;

    #[test]
    fn removes_all_tweens_from_the_manager_without_completing_them() {
        let manager = create_tween_manager(None);
        let t1 = target_x(0.0);
        let t2 = target_x(0.0);
        let a = create_tween(
            &manager,
            &t1,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        let b = create_tween(
            &manager,
            &t2,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        reset_all_tweens(&manager);
        assert_eq!(get_active_tween_count(&manager), 0);
        assert!(!a.is_complete());
        assert!(!b.is_complete());
    }
}

mod resume_all_tweens {
    use super::*;

    #[test]
    fn sets_paused_false_on_every_tween_in_the_manager() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let a = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        pause_all_tweens(&manager);
        resume_all_tweens(&manager);
        assert!(!a.is_paused());
    }
}

mod resume_tween {
    use super::*;

    #[test]
    fn sets_paused_to_false_on_a_single_tween() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        pause_tween(&tween);
        resume_tween(&tween);
        assert!(!tween.is_paused());
    }
}

mod resume_tweens {
    use super::*;

    #[test]
    fn resumes_only_tweens_for_the_given_target() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let t = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        pause_tweens(&manager, &target);
        resume_tweens(&manager, &target);
        assert!(!t.is_paused());
    }
}

mod stop_all_tweens {
    use super::*;

    #[test]
    fn marks_every_tween_in_the_manager_as_complete() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let a = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        stop_all_tweens(&manager, None);
        assert!(a.is_complete());
    }
}

mod stop_tween {
    use super::*;

    #[test]
    fn marks_a_single_tween_as_complete() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        stop_tween(&tween, None);
        assert!(tween.is_complete());
    }

    #[test]
    fn leaves_the_target_value_at_its_current_position() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
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
        assert!((get_x(&target) - 50.0).abs() < 0.01);
        stop_tween(&tween, None);
        assert!((get_x(&target) - 50.0).abs() < 0.01);
    }

    #[test]
    fn complete_true_jumps_to_end_values_before_stopping() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
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
        assert_eq!(get_x(&target), 100.0);
    }

    #[test]
    fn complete_true_fires_on_complete_by_default() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        let fired = Arc::new(Mutex::new(0i32));
        let fired_c = fired.clone();
        connect_signal(
            &tween.on_complete(),
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
        let target = target_x(0.0);
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        let fired = Arc::new(Mutex::new(0i32));
        let fired_c = fired.clone();
        connect_signal(
            &tween.on_complete(),
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
        assert_eq!(get_x(&target), 100.0); // values still applied
    }
}

mod stop_tweens {
    use super::*;

    #[test]
    fn stops_all_tweens_for_a_target() {
        let manager = create_tween_manager(None);
        let target = target_xy(0.0, 0.0);
        let a = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        let b = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_y(100.0)],
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
        assert!(a.is_complete());
        assert!(b.is_complete());
    }

    #[test]
    fn stops_only_tweens_with_matching_properties() {
        let manager = create_tween_manager(None);
        let target = target_xy(0.0, 0.0);
        let a = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        let b = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_y(100.0)],
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
            Some(&[prop_x(0.0)]),
            None,
        );
        assert!(a.is_complete());
        assert!(!b.is_complete());
    }

    #[test]
    fn leaves_the_target_value_at_its_current_position() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
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
        assert!((get_x(&target) - 50.0).abs() < 0.01);
        stop_tweens(&manager, &target, None, None);
        assert!((get_x(&target) - 50.0).abs() < 0.01);
    }

    #[test]
    fn complete_true_jumps_to_end_values_before_stopping() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
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
        assert_eq!(get_x(&target), 100.0);
    }

    #[test]
    fn complete_true_fires_on_complete_by_default() {
        let manager = create_tween_manager(None);
        let target = target_x(0.0);
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        let fired = Arc::new(Mutex::new(0i32));
        let fired_c = fired.clone();
        connect_signal(
            &tween.on_complete(),
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
        let target = target_x(0.0);
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[prop_x(100.0)],
            None,
        );
        let fired = Arc::new(Mutex::new(0i32));
        let fired_c = fired.clone();
        connect_signal(
            &tween.on_complete(),
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
        assert_eq!(get_x(&target), 100.0); // values still applied
    }
}
