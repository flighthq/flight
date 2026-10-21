use std::collections::HashMap;

use flight_tween::*;

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

mod target_key {
    use super::*;

    #[test]
    fn returns_the_same_key_for_the_same_target() {
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        assert_eq!(target_key(&target), target_key(&target));
    }

    #[test]
    fn returns_different_keys_for_different_targets() {
        let a = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let b = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        assert_ne!(target_key(&a), target_key(&b));
    }
}
