use std::collections::HashMap;

use flight_tween::*;

fn linear_ease(t: f32) -> f32 {
    t
}

mod add_tween_to_manager {
    use super::*;

    #[test]
    fn adds_a_tween_to_the_managers_tween_list() {
        let manager = create_tween_manager(Some(&TweenManagerOptions {
            default_ease: Some(linear_ease),
        }));
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = make_tween(
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
            linear_ease,
        );
        add_tween_to_manager(&manager, &tween, true, None, None);
        assert_eq!(get_active_tween_count(&manager), 1);
    }
}

mod has_tween_property {
    use super::*;

    #[test]
    fn returns_true_when_tween_has_the_property() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        assert!(has_tween_property(&tween, "x"));
    }

    #[test]
    fn returns_false_when_tween_does_not_have_the_property() {
        let manager = create_tween_manager(None);
        let target = create_tween_target(HashMap::from([("x".to_string(), 0.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        assert!(!has_tween_property(&tween, "y"));
    }
}

mod initialize_tween {
    use super::*;

    #[test]
    fn sets_initialized_flag_to_true() {
        let manager = create_tween_manager(Some(&TweenManagerOptions {
            default_ease: Some(linear_ease),
        }));
        let target = create_tween_target(HashMap::from([("x".to_string(), 10.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        assert!(!tween.data.read().unwrap().initialized);
        initialize_tween(&tween);
        assert!(tween.data.read().unwrap().initialized);
    }

    #[test]
    fn computes_start_and_change_from_target_and_property_map() {
        let manager = create_tween_manager(Some(&TweenManagerOptions {
            default_ease: Some(linear_ease),
        }));
        let target = create_tween_target(HashMap::from([("x".to_string(), 10.0)]));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
        );
        initialize_tween(&tween);
        let td = tween.data.read().unwrap();
        let detail = td.properties.iter().find(|d| d.key == "x").unwrap();
        assert_eq!(detail.start, 10.0);
        assert_eq!(detail.change, 90.0);
    }
}

mod make_tween {
    use super::*;

    #[test]
    fn creates_a_tween_with_properties_from_the_property_map() {
        let target = create_tween_target(HashMap::from([
            ("x".to_string(), 0.0),
            ("y".to_string(), 0.0),
        ]));
        let tween = make_tween(
            &target,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0), ("y".to_string(), 200.0)]),
            None,
            linear_ease,
        );
        let td = tween.data.read().unwrap();
        assert_eq!(td.duration, 1000.0);
        assert_eq!(td.properties.len(), 2);
    }
}
