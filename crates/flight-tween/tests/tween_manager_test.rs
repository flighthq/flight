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

    // D5: translated from TS `defaultManager` singleton test to explicit caller-owned context.
    // TS verifies defaultManager.tweens is a Map; Rust verifies a caller-owned default manager
    // behaves identically.
    #[test]
    fn caller_owned_default_is_a_tween_manager() {
        let dm = create_tween_manager(None);
        let _ = dm.data.read().unwrap().tweens.len();
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
