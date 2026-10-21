use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_tween::*;

struct Obj {
    x: f32,
    #[allow(dead_code)]
    y: f32,
}

mod create_tween_context {
    use super::*;

    #[test]
    fn returns_a_fresh_context() {
        let ctx = create_tween_context();
        let dm = default_manager(&ctx);
        assert_eq!(get_active_tween_count(&dm), 0);
    }
}

mod equals_tween {
    use super::*;

    #[test]
    fn returns_true_for_the_same_tween() {
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
        assert!(equals_tween(&tween, &tween));
    }

    #[test]
    fn returns_false_for_different_tweens() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0, y: 0.0 }));
        let a = create_tween(
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
        let b = create_tween(
            &manager,
            &target,
            1000.0,
            &[TweenProp {
                get: |t: &mut Obj| &mut t.x,
                key: "x",
                to: 200.0,
            }],
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

mod target_creation {
    use super::*;

    #[test]
    fn creates_a_target_with_the_given_properties() {
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 10.0, y: 20.0 }));
        let t = target.read().unwrap();
        assert_eq!(t.x, 10.0);
        assert_eq!(t.y, 20.0);
    }

    #[test]
    fn creates_a_target_with_default_values() {
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0, y: 0.0 }));
        let t = target.read().unwrap();
        assert_eq!(t.x, 0.0);
        assert_eq!(t.y, 0.0);
    }
}

mod target_identity {
    use super::*;

    #[test]
    fn same_target_has_same_identity() {
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0, y: 0.0 }));
        assert!(Arc::ptr_eq(&target, &target));
    }

    #[test]
    fn different_targets_have_different_identities() {
        let a: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0, y: 0.0 }));
        let b: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0, y: 0.0 }));
        assert!(!Arc::ptr_eq(&a, &b));
    }
}

mod tween_with {
    use super::*;

    #[test]
    fn constructs_a_tween_prop_with_the_given_fields() {
        let prop = tween_with::<Obj>(|t| &mut t.x, "x", 42.0);
        assert_eq!(prop.key, "x");
        assert_eq!(prop.to, 42.0);
    }

    #[test]
    fn works_as_a_prop_in_create_tween() {
        let manager = create_tween_manager(None);
        let target: Ref<Obj> = Ref::new(RwLock::new(Obj { x: 0.0, y: 0.0 }));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[tween_with(|t: &mut Obj| &mut t.x, "x", 100.0)],
            None,
        );
        assert!(get_tween_property_keys(&tween).contains(&"x".to_string()));
    }
}

mod external_user_struct {
    use super::*;

    struct GameEntity {
        health: f32,
        speed: f32,
        rotation: f32,
    }

    #[test]
    fn tweens_user_defined_struct_with_tween_prop_macro() {
        let manager = create_tween_manager(None);
        let target: Ref<GameEntity> = Ref::new(RwLock::new(GameEntity {
            health: 100.0,
            speed: 0.0,
            rotation: 0.0,
        }));
        let tween = create_tween(
            &manager,
            &target,
            1000.0,
            &[tween_prop!(speed, 50.0), tween_prop!(rotation, 180.0)],
            None,
        );
        let keys = get_tween_property_keys(&tween);
        assert!(keys.contains(&"speed".to_string()));
        assert!(keys.contains(&"rotation".to_string()));
        assert_eq!(keys.len(), 2);
    }

    #[test]
    fn tweens_user_defined_struct_with_tween_with() {
        let manager = create_tween_manager(None);
        let target: Ref<GameEntity> = Ref::new(RwLock::new(GameEntity {
            health: 100.0,
            speed: 0.0,
            rotation: 0.0,
        }));
        let tween = create_tween(
            &manager,
            &target,
            500.0,
            &[tween_with(|t: &mut GameEntity| &mut t.health, "health", 0.0)],
            None,
        );
        assert!(get_tween_property_keys(&tween).contains(&"health".to_string()));
    }

    #[test]
    fn update_writes_values_to_user_struct() {
        let manager = create_tween_manager(None);
        let target: Ref<GameEntity> = Ref::new(RwLock::new(GameEntity {
            health: 0.0,
            speed: 0.0,
            rotation: 0.0,
        }));
        create_tween(
            &manager,
            &target,
            1000.0,
            &[tween_prop!(speed, 100.0)],
            None,
        );
        update_tweens(&manager, 1000.0);
        let t = target.read().unwrap();
        assert!((t.speed - 100.0).abs() < 0.01);
    }

    #[test]
    fn apply_tween_sets_user_struct_immediately() {
        let manager = create_tween_manager(None);
        let target: Ref<GameEntity> = Ref::new(RwLock::new(GameEntity {
            health: 100.0,
            speed: 0.0,
            rotation: 0.0,
        }));
        apply_tween(&manager, &target, &[tween_prop!(rotation, 90.0)]);
        let t = target.read().unwrap();
        assert!((t.rotation - 90.0).abs() < 0.01);
    }
}
