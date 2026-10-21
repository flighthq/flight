use std::collections::HashMap;
use std::sync::Arc;

use flight_tween::*;

mod create_tween_context {
    use super::*;

    #[test]
    fn returns_a_fresh_context() {
        let ctx = create_tween_context();
        let dm = default_manager(&ctx);
        assert_eq!(dm.data.read().unwrap().tweens.len(), 0);
    }
}

mod create_tween_target {
    use super::*;

    #[test]
    fn creates_a_target_with_the_given_properties() {
        let target = create_tween_target(HashMap::from([
            ("x".to_string(), 10.0),
            ("y".to_string(), 20.0),
        ]));
        let props = target.props.read().unwrap();
        assert_eq!(*props.get("x").unwrap(), 10.0);
        assert_eq!(*props.get("y").unwrap(), 20.0);
    }

    #[test]
    fn creates_a_target_with_empty_props() {
        let target = create_tween_target(HashMap::new());
        assert!(target.props.read().unwrap().is_empty());
    }
}

mod equals_tween {
    use super::*;

    #[test]
    fn returns_true_for_the_same_tween() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        assert!(equals_tween(&tween, &tween));
    }

    #[test]
    fn returns_false_for_different_tweens() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
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
        assert!(!equals_tween(&a, &b));
    }
}

mod target_identity {
    use super::*;

    #[test]
    fn same_target_has_same_identity() {
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        assert!(Arc::ptr_eq(&target.props, &target.props));
    }

    #[test]
    fn different_targets_have_different_identities() {
        let a = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let b = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        assert!(!Arc::ptr_eq(&a.props, &b.props));
    }
}
