use std::collections::HashMap;
use std::sync::Arc;

use flight_tween::*;

fn linear_ease(t: f32) -> f32 {
    t
}

fn get_prop(target: &TweenTarget, key: &str) -> f32 {
    *target.props.read().unwrap().get(key).unwrap_or(&0.0)
}

mod create_tween_stagger {
    use super::*;

    #[test]
    fn returns_an_empty_array_for_empty_targets() {
        let manager = create_tween_manager(None);
        let targets: Vec<TweenTarget> = vec![];
        let result = create_tween_stagger(&manager, &targets, 1000.0, &HashMap::new(), None, None);
        assert!(result.is_empty());
    }

    #[test]
    fn returns_one_tween_per_target() {
        let manager = create_tween_manager(None);
        let targets = vec![
            create_tween_target(HashMap::from([("x".to_string(), 0.0)])),
            create_tween_target(HashMap::from([("x".to_string(), 0.0)])),
            create_tween_target(HashMap::from([("x".to_string(), 0.0)])),
        ];
        let tweens = create_tween_stagger(
            &manager,
            &targets,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
            None,
        );
        assert_eq!(tweens.len(), 3);
    }

    #[test]
    fn each_tween_targets_the_corresponding_element() {
        let manager = create_tween_manager(None);
        let targets = vec![
            create_tween_target(HashMap::from([("x".to_string(), 0.0)])),
            create_tween_target(HashMap::from([("x".to_string(), 0.0)])),
        ];
        let tweens = create_tween_stagger(
            &manager,
            &targets,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
            None,
        );
        assert!(Arc::ptr_eq(&tweens[0].data.read().unwrap().target.props, &targets[0].props));
        assert!(Arc::ptr_eq(&tweens[1].data.read().unwrap().target.props, &targets[1].props));
    }

    #[test]
    fn staggers_start_delays_by_each_interval_from_start_default() {
        let manager = create_tween_manager(None);
        let targets = vec![
            create_tween_target(HashMap::from([("x".to_string(), 0.0)])),
            create_tween_target(HashMap::from([("x".to_string(), 0.0)])),
            create_tween_target(HashMap::from([("x".to_string(), 0.0)])),
        ];
        let tweens = create_tween_stagger(
            &manager,
            &targets,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenStaggerOptions {
                each: Some(200.0),
                from: None,
                stagger_ease: None,
            }),
            None,
        );
        assert!((tweens[0].data.read().unwrap().delay - 0.0).abs() < 0.01);
        assert!((tweens[1].data.read().unwrap().delay - 200.0).abs() < 0.01);
        assert!((tweens[2].data.read().unwrap().delay - 400.0).abs() < 0.01);
    }

    #[test]
    fn from_end_reverses_the_stagger_order() {
        let manager = create_tween_manager(None);
        let targets = vec![
            create_tween_target(HashMap::from([("x".to_string(), 0.0)])),
            create_tween_target(HashMap::from([("x".to_string(), 0.0)])),
            create_tween_target(HashMap::from([("x".to_string(), 0.0)])),
        ];
        let tweens = create_tween_stagger(
            &manager,
            &targets,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenStaggerOptions {
                each: Some(100.0),
                from: Some(StaggerFrom::End),
                stagger_ease: None,
            }),
            None,
        );
        assert!((tweens[2].data.read().unwrap().delay - 0.0).abs() < 0.01);
        assert!((tweens[0].data.read().unwrap().delay - 200.0).abs() < 0.01);
    }

    #[test]
    fn from_center_staggers_outward_from_the_middle() {
        let manager = create_tween_manager(None);
        let targets = vec![
            create_tween_target(HashMap::from([("x".to_string(), 0.0)])),
            create_tween_target(HashMap::from([("x".to_string(), 0.0)])),
            create_tween_target(HashMap::from([("x".to_string(), 0.0)])),
            create_tween_target(HashMap::from([("x".to_string(), 0.0)])),
            create_tween_target(HashMap::from([("x".to_string(), 0.0)])),
        ];
        let tweens = create_tween_stagger(
            &manager,
            &targets,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenStaggerOptions {
                each: Some(100.0),
                from: Some(StaggerFrom::Center),
                stagger_ease: None,
            }),
            None,
        );
        assert!((tweens[2].data.read().unwrap().delay - 0.0).abs() < 0.01);
        assert!((tweens[0].data.read().unwrap().delay - 400.0).abs() < 0.01);
        assert!((tweens[4].data.read().unwrap().delay - 400.0).abs() < 0.01);
    }

    #[test]
    fn from_numeric_index_staggers_outward_from_that_index() {
        let manager = create_tween_manager(None);
        let targets = vec![
            create_tween_target(HashMap::from([("x".to_string(), 0.0)])),
            create_tween_target(HashMap::from([("x".to_string(), 0.0)])),
            create_tween_target(HashMap::from([("x".to_string(), 0.0)])),
        ];
        let tweens = create_tween_stagger(
            &manager,
            &targets,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenStaggerOptions {
                each: Some(100.0),
                from: Some(StaggerFrom::Index(0.0)),
                stagger_ease: None,
            }),
            None,
        );
        assert!((tweens[0].data.read().unwrap().delay - 0.0).abs() < 0.01);
        assert!((tweens[1].data.read().unwrap().delay - 100.0).abs() < 0.01);
        assert!((tweens[2].data.read().unwrap().delay - 200.0).abs() < 0.01);
    }

    #[test]
    fn adds_base_delay_from_options_to_all_stagger_delays() {
        let manager = create_tween_manager(None);
        let targets = vec![
            create_tween_target(HashMap::from([("x".to_string(), 0.0)])),
            create_tween_target(HashMap::from([("x".to_string(), 0.0)])),
        ];
        let tweens = create_tween_stagger(
            &manager,
            &targets,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenStaggerOptions {
                each: Some(100.0),
                from: None,
                stagger_ease: None,
            }),
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
        assert!((tweens[0].data.read().unwrap().delay - 500.0).abs() < 0.01);
        assert!((tweens[1].data.read().unwrap().delay - 600.0).abs() < 0.01);
    }

    #[test]
    fn actually_animates_targets_with_staggered_timing() {
        let manager = create_tween_manager(None);
        let targets = vec![
            create_tween_target(HashMap::from([("x".to_string(), 0.0)])),
            create_tween_target(HashMap::from([("x".to_string(), 0.0)])),
        ];
        create_tween_stagger(
            &manager,
            &targets,
            1000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            Some(&TweenStaggerOptions {
                each: Some(200.0),
                from: None,
                stagger_ease: None,
            }),
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
        update_tweens(&manager, 100.0);
        assert!((get_prop(&targets[0], "x") - 10.0).abs() < 0.01);
        assert_eq!(get_prop(&targets[1], "x"), 0.0); // still in delay
    }

    #[test]
    fn passes_duration_correctly_to_each_tween() {
        let manager = create_tween_manager(None);
        let targets = vec![
            create_tween_target(HashMap::from([("x".to_string(), 0.0)])),
            create_tween_target(HashMap::from([("x".to_string(), 0.0)])),
        ];
        let tweens = create_tween_stagger(
            &manager,
            &targets,
            2000.0,
            &HashMap::from([("x".to_string(), 100.0)]),
            None,
            None,
        );
        assert_eq!(tweens[0].data.read().unwrap().duration, 2000.0);
        assert_eq!(tweens[1].data.read().unwrap().duration, 2000.0);
    }
}
