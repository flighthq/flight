use std::sync::RwLock;

use flight_entity::Ref;
use flight_tween::*;

fn linear_ease(t: f32) -> f32 {
    return t;
}

struct Obj {
    x: f32,
    y: f32,
}

mod add_tween_to_manager {
    use super::*;

    #[test]
    fn adds_a_tween_to_the_managers_tween_list() {
        let manager = create_tween_manager(Some(&TweenManagerOptions {
            default_ease: Some(linear_ease),
        }));
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0, y: 0.0 }));
        create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            None,
        );
        assert_eq!(get_active_tween_count(&manager), 1);
    }
}

mod has_tween_property {
    use super::*;

    #[test]
    fn returns_true_when_tween_has_the_property() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0, y: 0.0 }));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            None,
        );
        assert!(tween.property_keys().contains(&"x".to_string()));
    }

    #[test]
    fn returns_false_when_tween_does_not_have_the_property() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0, y: 0.0 }));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            None,
        );
        assert!(!tween.property_keys().contains(&"y".to_string()));
    }
}

mod initialize_tween {
    use super::*;

    #[test]
    fn sets_initialized_flag_to_true() {
        let manager = create_tween_manager(Some(&TweenManagerOptions {
            default_ease: Some(linear_ease),
        }));
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 10.0, y: 0.0 }));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
            None,
        );
        assert!(!tween.is_initialized());
        update_tweens(&manager, 1.0);
        assert!(tween.is_initialized());
    }

    #[test]
    fn computes_start_and_change_from_target_and_property_map() {
        let manager = create_tween_manager(Some(&TweenManagerOptions {
            default_ease: Some(linear_ease),
        }));
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 10.0, y: 0.0 }));
        create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 100.0,
            }],
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
        // start=10, change=90, at 50% linear: 10 + 0.5*90 = 55
        assert!((target.read().unwrap().x - 55.0).abs() < 0.01);
    }
}

mod make_tween {
    use super::*;
    use flight_tween::contract::make_tween;

    #[test]
    fn creates_a_tween_with_properties_from_the_property_map() {
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0, y: 0.0 }));
        let tween = make_tween(
            &target,
            1000.0,
            &[
                TweenProp {
                    get: |t: &mut Obj| &mut t.x,
                    key: "x",
                    to: 100.0,
                },
                TweenProp {
                    get: |t: &mut Obj| &mut t.y,
                    key: "y",
                    to: 200.0,
                },
            ],
            None,
            linear_ease,
        );
        assert_eq!(tween.duration(), 1000.0);
        assert_eq!(tween.property_keys().len(), 2);
    }
}
