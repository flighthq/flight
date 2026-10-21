use std::sync::RwLock;

use flight_entity::Ref;
use flight_tween::*;

fn linear_ease(t: f32) -> f32 {
    return t;
}

struct Obj {
    x: f32,
}

mod create_tween_stagger {
    use super::*;

    #[test]
    fn returns_an_empty_array_for_empty_targets() {
        let manager = create_tween_manager(None);
        let targets: Vec<Ref<Obj>> = vec![];
        let result = create_tween_stagger::<Obj>(&manager, &targets, 1000.0, &[], None, None);
        assert!(result.is_empty());
    }

    #[test]
    fn returns_one_tween_per_target() {
        let manager = create_tween_manager(None);
        let targets = vec![
            Ref::new(RwLock::new(Obj { x: 0.0 })),
            Ref::new(RwLock::new(Obj { x: 0.0 })),
            Ref::new(RwLock::new(Obj { x: 0.0 })),
        ];
        let tweens = create_tween_stagger(
            &manager,
            &targets,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            None,
            None,
        );
        assert_eq!(tweens.len(), 3);
    }

    #[test]
    fn each_tween_targets_the_corresponding_element() {
        let manager = create_tween_manager(None);
        let targets = vec![
            Ref::new(RwLock::new(Obj { x: 10.0 })),
            Ref::new(RwLock::new(Obj { x: 20.0 })),
        ];
        let _tweens = create_tween_stagger(
            &manager,
            &targets,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            None,
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
        // Different start values prove each tween targets its own element
        assert!((targets[0].read().unwrap().x - 55.0).abs() < 0.01);
        assert!((targets[1].read().unwrap().x - 60.0).abs() < 0.01);
    }

    #[test]
    fn staggers_start_delays_by_each_interval_from_start_default() {
        let manager = create_tween_manager(None);
        let targets = vec![
            Ref::new(RwLock::new(Obj { x: 0.0 })),
            Ref::new(RwLock::new(Obj { x: 0.0 })),
            Ref::new(RwLock::new(Obj { x: 0.0 })),
        ];
        let tweens = create_tween_stagger(
            &manager,
            &targets,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            Some(&TweenStaggerOptions {
                each: Some(200.0),
                from: None,
                stagger_ease: None,
            }),
            None,
        );
        assert!((tweens[0].delay() - 0.0).abs() < 0.01);
        assert!((tweens[1].delay() - 200.0).abs() < 0.01);
        assert!((tweens[2].delay() - 400.0).abs() < 0.01);
    }

    #[test]
    fn from_end_reverses_the_stagger_order() {
        let manager = create_tween_manager(None);
        let targets = vec![
            Ref::new(RwLock::new(Obj { x: 0.0 })),
            Ref::new(RwLock::new(Obj { x: 0.0 })),
            Ref::new(RwLock::new(Obj { x: 0.0 })),
        ];
        let tweens = create_tween_stagger(
            &manager,
            &targets,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            Some(&TweenStaggerOptions {
                each: Some(100.0),
                from: Some(StaggerFrom::End),
                stagger_ease: None,
            }),
            None,
        );
        assert!((tweens[2].delay() - 0.0).abs() < 0.01);
        assert!((tweens[0].delay() - 200.0).abs() < 0.01);
    }

    #[test]
    fn from_center_staggers_outward_from_the_middle() {
        let manager = create_tween_manager(None);
        let targets = vec![
            Ref::new(RwLock::new(Obj { x: 0.0 })),
            Ref::new(RwLock::new(Obj { x: 0.0 })),
            Ref::new(RwLock::new(Obj { x: 0.0 })),
            Ref::new(RwLock::new(Obj { x: 0.0 })),
            Ref::new(RwLock::new(Obj { x: 0.0 })),
        ];
        let tweens = create_tween_stagger(
            &manager,
            &targets,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            Some(&TweenStaggerOptions {
                each: Some(100.0),
                from: Some(StaggerFrom::Center),
                stagger_ease: None,
            }),
            None,
        );
        assert!((tweens[2].delay() - 0.0).abs() < 0.01);
        assert!((tweens[0].delay() - 400.0).abs() < 0.01);
        assert!((tweens[4].delay() - 400.0).abs() < 0.01);
    }

    #[test]
    fn from_numeric_index_staggers_outward_from_that_index() {
        let manager = create_tween_manager(None);
        let targets = vec![
            Ref::new(RwLock::new(Obj { x: 0.0 })),
            Ref::new(RwLock::new(Obj { x: 0.0 })),
            Ref::new(RwLock::new(Obj { x: 0.0 })),
        ];
        let tweens = create_tween_stagger(
            &manager,
            &targets,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            Some(&TweenStaggerOptions {
                each: Some(100.0),
                from: Some(StaggerFrom::Index(0.0)),
                stagger_ease: None,
            }),
            None,
        );
        assert!((tweens[0].delay() - 0.0).abs() < 0.01);
        assert!((tweens[1].delay() - 100.0).abs() < 0.01);
        assert!((tweens[2].delay() - 200.0).abs() < 0.01);
    }

    #[test]
    fn adds_base_delay_from_options_to_all_stagger_delays() {
        let manager = create_tween_manager(None);
        let targets = vec![
            Ref::new(RwLock::new(Obj { x: 0.0 })),
            Ref::new(RwLock::new(Obj { x: 0.0 })),
        ];
        let tweens = create_tween_stagger(
            &manager,
            &targets,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
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
        assert!((tweens[0].delay() - 500.0).abs() < 0.01);
        assert!((tweens[1].delay() - 600.0).abs() < 0.01);
    }

    #[test]
    fn actually_animates_targets_with_staggered_timing() {
        let manager = create_tween_manager(None);
        let targets = vec![
            Ref::new(RwLock::new(Obj { x: 0.0 })),
            Ref::new(RwLock::new(Obj { x: 0.0 })),
        ];
        create_tween_stagger(
            &manager,
            &targets,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
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
        assert!((targets[0].read().unwrap().x - 10.0).abs() < 0.01);
        assert_eq!(targets[1].read().unwrap().x, 0.0); // still in delay
    }

    #[test]
    fn passes_duration_correctly_to_each_tween() {
        let manager = create_tween_manager(None);
        let targets = vec![
            Ref::new(RwLock::new(Obj { x: 0.0 })),
            Ref::new(RwLock::new(Obj { x: 0.0 })),
        ];
        let tweens = create_tween_stagger(
            &manager,
            &targets,
            2000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            None,
            None,
        );
        assert_eq!(tweens[0].duration(), 2000.0);
        assert_eq!(tweens[1].duration(), 2000.0);
    }
}
