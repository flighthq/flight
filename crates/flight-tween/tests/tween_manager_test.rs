use std::collections::HashMap;

use flight_tween::contract::*;

fn linear_ease(t: f32) -> f32 {
    t
}

fn always_one(_t: f32) -> f32 {
    1.0
}

mod create_tween_manager {
    use super::*;

    #[test]
    fn returns_a_tween_manager_with_empty_tweens_map() {
        let manager = create_tween_manager(None);
        assert_eq!(manager.data.read().unwrap().tweens.len(), 0);
    }

    #[test]
    fn each_call_returns_a_distinct_instance() {
        let a = create_tween_manager(None);
        let b = create_tween_manager(None);
        assert!(!std::sync::Arc::ptr_eq(&a.data, &b.data));
    }
}

mod default_ease {
    use super::*;

    #[test]
    fn defaults_to_ease_out_exponential_when_no_option_provided() {
        let manager = create_tween_manager(None);
        let ease = manager.data.read().unwrap().default_ease;
        assert_eq!(ease(0.0), 0.0);
        assert!((ease(1.0) - 1.0).abs() < 0.01);
    }

    #[test]
    fn uses_provided_default_ease_for_tweens_that_omit_ease_option() {
        let manager = create_tween_manager(Some(&TweenManagerOptions {
            default_ease: Some(linear_ease),
        }));
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        update_tweens(&manager, 500.0);
        let x = *target.props.read().unwrap().get("x").unwrap();
        assert!((x - 50.0).abs() < 0.01); // linear: exactly 50% at 50% time
    }

    #[test]
    fn explicit_ease_option_overrides_default_ease() {
        let manager = create_tween_manager(Some(&TweenManagerOptions {
            default_ease: Some(linear_ease),
        }));
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenOptions {
                delay: None,
                ease: Some(always_one),
                overwrite: None,
                reflect: None,
                repeat: None,
                reverse: None,
                smart_rotation: None,
                snapping: None,
            }),
        );
        update_tweens(&manager, 1.0);
        let x = *target.props.read().unwrap().get("x").unwrap();
        assert_eq!(x, 100.0); // alwaysOne ease jumps straight to end
    }
}

mod default_manager {
    use super::*;

    #[test]
    fn caller_owned_default_is_a_tween_manager() {
        let ctx = create_tween_context();
        let dm = default_manager(&ctx);
        let _ = dm.data.read().unwrap().tweens.len();
    }

    #[test]
    fn repeated_lookup_yields_same_identity() {
        let ctx = create_tween_context();
        let first = default_manager(&ctx);
        let second = default_manager(&ctx);
        assert!(std::sync::Arc::ptr_eq(&first.data, &second.data));
    }

    #[test]
    fn independent_contexts_are_independent() {
        let ctx_a = create_tween_context();
        let ctx_b = create_tween_context();
        let dm_a = default_manager(&ctx_a);
        let dm_b = default_manager(&ctx_b);
        assert!(!std::sync::Arc::ptr_eq(&dm_a.data, &dm_b.data));
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        create_tween(
            &dm_a,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        assert!(has_tweens_of(&dm_a, &target));
        assert!(!has_tweens_of(&dm_b, &target));
    }

    #[test]
    fn operations_use_the_explicit_context() {
        let ctx = create_tween_context();
        let dm = default_manager(&ctx);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        create_tween(
            &dm,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        assert_eq!(get_active_tween_count(&dm), 1);
        update_tweens(&dm, 1000.0);
        let x = *target.props.read().unwrap().get("x").unwrap();
        assert!(x > 0.0);
    }
}

mod initialize_tween_manager {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_tween_manager() {
        let mut manager = create_tween_manager(None);
        initialize_tween_manager(&mut manager, None);
        assert_eq!(manager.data.read().unwrap().tweens.len(), 0);
    }
}
