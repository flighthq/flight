//! flight-compiler: target-native

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
        let mut tweens_for_0: Vec<Tween<Obj>> = Vec::new();
        get_tweens_of(&mut tweens_for_0, &manager, &targets[0]);
        let mut tweens_for_1: Vec<Tween<Obj>> = Vec::new();
        get_tweens_of(&mut tweens_for_1, &manager, &targets[1]);
        assert_eq!(tweens_for_0.len(), 1);
        assert_eq!(tweens_for_1.len(), 1);
        assert!(
            equals_tween(&tweens[0], &tweens_for_0[0]),
            "tweens[0] targets targets[0]"
        );
        assert!(
            equals_tween(&tweens[1], &tweens_for_1[0]),
            "tweens[1] targets targets[1]"
        );
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
        assert!((get_tween_delay(&tweens[0]) - 0.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
        assert!((get_tween_delay(&tweens[1]) - 200.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
        assert!((get_tween_delay(&tweens[2]) - 400.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
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
        assert!((get_tween_delay(&tweens[2]) - 0.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
        assert!((get_tween_delay(&tweens[0]) - 200.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
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
        assert!((get_tween_delay(&tweens[2]) - 0.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
        assert!((get_tween_delay(&tweens[0]) - 400.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
        assert!((get_tween_delay(&tweens[4]) - 400.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
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
        assert!((get_tween_delay(&tweens[0]) - 0.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
        assert!((get_tween_delay(&tweens[1]) - 100.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
        assert!((get_tween_delay(&tweens[2]) - 200.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
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
        assert!((get_tween_delay(&tweens[0]) - 500.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
        assert!((get_tween_delay(&tweens[1]) - 600.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
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
        assert!((targets[0].read().unwrap().x - 10.0).abs() < 0.005); // D1 f32 bound (TS: 0.005)
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
        assert_eq!(get_tween_duration(&tweens[0]), 2000.0);
        assert_eq!(get_tween_duration(&tweens[1]), 2000.0);
    }
}
