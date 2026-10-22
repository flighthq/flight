use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_tween::*;

trait Animatable: Send + Sync {
    fn alpha_mut(&mut self) -> &mut f32;
}

struct ConcreteNode {
    alpha: f32,
    scale: f32,
}

impl Animatable for ConcreteNode {
    fn alpha_mut(&mut self) -> &mut f32 {
        return &mut self.alpha;
    }
}

fn alpha_prop() -> TweenProp<dyn Animatable> {
    return tween_with::<dyn Animatable>(|t| t.alpha_mut(), "alpha", 1.0);
}

fn make_concrete() -> Ref<ConcreteNode> {
    return Ref::new(RwLock::new(ConcreteNode {
        alpha: 0.0,
        scale: 1.0,
    }));
}

fn erase(concrete: &Ref<ConcreteNode>) -> Ref<dyn Animatable> {
    return concrete.clone() as Ref<dyn Animatable>;
}

fn linear_ease(t: f32) -> f32 {
    return t;
}

fn setup() -> TweenManager {
    let manager = create_tween_manager(None);
    manager.data.write().unwrap().default_ease = linear_ease;
    return manager;
}

mod create_tween_dyn {
    use super::*;

    #[test]
    fn creates_a_tween_targeting_a_trait_object() {
        let manager = setup();
        let concrete = make_concrete();
        let erased: Ref<dyn Animatable> = erase(&concrete);
        let tween: Tween<dyn Animatable> =
            create_tween(&manager, &erased, 1000.0, &[alpha_prop()], None);
        assert!(!is_tween_complete(&tween));
    }

    #[test]
    fn updates_the_underlying_concrete_data_through_trait_dispatch() {
        let manager = setup();
        let concrete = make_concrete();
        let erased = erase(&concrete);
        create_tween(&manager, &erased, 1000.0, &[alpha_prop()], None);
        update_tweens(&manager, 500.0);
        assert!((concrete.read().unwrap().alpha - 0.5).abs() < 0.01);
    }

    #[test]
    fn completes_and_reaches_target_value() {
        let manager = setup();
        let concrete = make_concrete();
        let erased = erase(&concrete);
        create_tween(&manager, &erased, 1000.0, &[alpha_prop()], None);
        update_tweens(&manager, 1000.0);
        assert!((concrete.read().unwrap().alpha - 1.0).abs() < 0.01);
    }
}

mod dyn_target_identity {
    use super::*;

    #[test]
    fn concrete_and_erased_refs_share_the_same_target_key() {
        let manager = setup();
        let concrete = make_concrete();
        let erased = erase(&concrete);
        create_tween(&manager, &erased, 1000.0, &[alpha_prop()], None);
        assert!(has_tweens_of(&manager, &erased));
        assert!(has_tweens_of(&manager, &concrete));
    }

    #[test]
    fn get_tweens_of_finds_dyn_tweens_via_concrete_ref() {
        let manager = setup();
        let concrete = make_concrete();
        let erased = erase(&concrete);
        create_tween(&manager, &erased, 1000.0, &[alpha_prop()], None);
        let mut out: Vec<Tween<ConcreteNode>> = Vec::new();
        get_tweens_of(&mut out, &manager, &concrete);
        assert_eq!(out.len(), 1);
    }

    #[test]
    fn stop_tweens_via_concrete_ref_stops_dyn_tween() {
        let manager = setup();
        let concrete = make_concrete();
        let erased = erase(&concrete);
        let tween: Tween<dyn Animatable> =
            create_tween(&manager, &erased, 1000.0, &[alpha_prop()], None);
        stop_tweens::<ConcreteNode>(&manager, &concrete, None, None);
        assert!(is_tween_complete(&tween));
    }

    #[test]
    fn different_allocations_have_different_keys() {
        let manager = setup();
        let a = make_concrete();
        let b = make_concrete();
        let ea = erase(&a);
        let eb = erase(&b);
        create_tween(&manager, &ea, 1000.0, &[alpha_prop()], None);
        assert!(has_tweens_of(&manager, &ea));
        assert!(!has_tweens_of(&manager, &eb));
    }
}

mod dyn_tween_lifecycle {
    use super::*;

    #[test]
    fn pause_and_resume_through_dyn_tween() {
        let manager = setup();
        let concrete = make_concrete();
        let erased = erase(&concrete);
        let tween: Tween<dyn Animatable> =
            create_tween(&manager, &erased, 1000.0, &[alpha_prop()], None);
        pause_tween(&tween);
        assert!(is_tween_paused(&tween));
        resume_tween(&tween);
        assert!(!is_tween_paused(&tween));
    }

    #[test]
    fn seek_through_dyn_tween() {
        let manager = setup();
        let concrete = make_concrete();
        let erased = erase(&concrete);
        let tween: Tween<dyn Animatable> =
            create_tween(&manager, &erased, 1000.0, &[alpha_prop()], None);
        seek_tween(&tween, 500.0);
        assert!((concrete.read().unwrap().alpha - 0.5).abs() < 0.01);
    }

    #[test]
    fn complete_tween_through_dyn_ref() {
        let manager = setup();
        let concrete = make_concrete();
        let erased = erase(&concrete);
        let tween: Tween<dyn Animatable> =
            create_tween(&manager, &erased, 1000.0, &[alpha_prop()], None);
        complete_tween(&tween);
        assert!(is_tween_complete(&tween));
        assert!((concrete.read().unwrap().alpha - 1.0).abs() < 0.01);
    }

    #[test]
    fn callbacks_fire_for_dyn_tweens() {
        let manager = setup();
        let concrete = make_concrete();
        let erased = erase(&concrete);
        let tween: Tween<dyn Animatable> =
            create_tween(&manager, &erased, 1000.0, &[alpha_prop()], None);
        let fired = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let fired_clone = fired.clone();
        flight_signals::connect_signal(
            &get_tween_on_complete(&tween),
            Arc::new(move |_: &()| {
                fired_clone.store(true, std::sync::atomic::Ordering::SeqCst);
            }),
            None,
        );
        update_tweens(&manager, 1000.0);
        assert!(fired.load(std::sync::atomic::Ordering::SeqCst));
    }
}

mod sized_target_unchanged {
    use super::*;

    #[test]
    fn existing_sized_target_behavior_is_preserved() {
        let manager = setup();
        let concrete = make_concrete();
        let prop: TweenProp<ConcreteNode> = tween_with(|t| &mut t.scale, "scale", 2.0);
        create_tween(&manager, &concrete, 1000.0, &[prop], None);
        update_tweens(&manager, 1000.0);
        assert!((concrete.read().unwrap().scale - 2.0).abs() < 0.01);
    }

    #[test]
    fn tween_prop_macro_still_works_for_sized_types() {
        let manager = setup();
        let concrete = make_concrete();
        create_tween(&manager, &concrete, 500.0, &[tween_prop!(alpha, 0.5)], None);
        update_tweens(&manager, 500.0);
        assert!((concrete.read().unwrap().alpha - 0.5).abs() < 0.01);
    }
}

mod apply_tween_dyn {
    use super::*;

    #[test]
    fn immediately_sets_property_through_trait_dispatch() {
        let manager = setup();
        let concrete = make_concrete();
        let erased = erase(&concrete);
        apply_tween(&manager, &erased, &[alpha_prop()]);
        assert!((concrete.read().unwrap().alpha - 1.0).abs() < 0.01);
    }
}

mod pause_tweens_dyn {
    use super::*;

    #[test]
    fn pause_and_resume_tweens_via_erased_ref() {
        let manager = setup();
        let concrete = make_concrete();
        let erased = erase(&concrete);
        let tween: Tween<dyn Animatable> =
            create_tween(&manager, &erased, 1000.0, &[alpha_prop()], None);
        pause_tweens(&manager, &erased);
        assert!(is_tween_paused(&tween));
        resume_tweens(&manager, &erased);
        assert!(!is_tween_paused(&tween));
    }
}
