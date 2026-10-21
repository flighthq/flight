use std::sync::{Arc, Mutex, RwLock};

use flight_skeleton2d::contract::*;

fn constraint(kind: &str, mix: f32) -> Skeleton2DConstraintRef {
    let mut value: Skeleton2DIkConstraint = flight_entity::allocate_entity();
    value.kind = String::from(kind);
    value.mix = mix;
    return Arc::new(RwLock::new(value));
}

fn rig() -> Skeleton2D {
    return create_skeleton_2d(
        vec![Bone2D {
            length: 0.0,
            name: None,
            parent_index: -1,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            shear_x: 0.0,
            shear_y: 0.0,
            transform_mode: TRANSFORM_MODE_2D_NORMAL,
            x: 0.0,
            y: 0.0,
        }],
        None,
    );
}

mod create_skeleton_2d_constraint_registry {
    use super::*;

    #[test]
    fn starts_empty() {
        let registry = create_skeleton_2d_constraint_registry();
        assert!(registry.entries.is_empty());
    }
}

mod get_skeleton_2d_constraint_solver {
    use super::*;

    #[test]
    fn returns_none_for_an_unclaimed_kind() {
        let registry = create_skeleton_2d_constraint_registry();
        assert!(get_skeleton_2d_constraint_solver(&registry, "test.None").is_none());
    }
}

mod register_skeleton_2d_constraint_solver {
    use super::*;

    #[test]
    fn claims_a_kind_and_takes_the_last_registration() {
        let mut registry = create_skeleton_2d_constraint_registry();
        register_skeleton_2d_constraint_solver(&mut registry, "test.Kind", Arc::new(|_, _| {}));
        let second: Skeleton2DConstraintSolver = Arc::new(|_, _| {});
        register_skeleton_2d_constraint_solver(&mut registry, "test.Kind", second.clone());
        assert!(Arc::ptr_eq(
            &get_skeleton_2d_constraint_solver(&registry, "test.Kind").unwrap(),
            &second
        ));
        assert_eq!(registry.entries.len(), 1);
    }
}

mod solve_skeleton_2d_constraints {
    use super::*;

    #[test]
    fn runs_constraints_in_declared_order() {
        let mut registry = create_skeleton_2d_constraint_registry();
        let seen = Arc::new(Mutex::new(Vec::new()));
        let sink = seen.clone();
        register_skeleton_2d_constraint_solver(
            &mut registry,
            "test.Kind",
            Arc::new(move |_, constraint| {
                sink.lock().unwrap().push(constraint.mix());
            }),
        );
        let constraints = vec![constraint("test.Kind", 0.25), constraint("test.Kind", 0.75)];
        let mut value = rig();
        solve_skeleton_2d_constraints(&registry, &mut value, &constraints);
        assert_eq!(*seen.lock().unwrap(), vec![0.25, 0.75]);
    }

    #[test]
    fn skips_an_unregistered_kind_and_keeps_going() {
        let registry = create_skeleton_2d_constraint_registry();
        let constraints = vec![constraint("test.None", 1.0), constraint("test.Other", 1.0)];
        let mut value = rig();
        solve_skeleton_2d_constraints(&registry, &mut value, &constraints);
    }
}

mod source_constraint_parity {
    use super::*;

    #[test]
    fn an_unregistered_kind_is_skipped_and_the_next_constraint_still_runs() {
        let mut registry = create_skeleton_2d_constraint_registry();
        let solved = Arc::new(Mutex::new(0u32));
        let sink = solved.clone();
        register_skeleton_2d_constraint_solver(
            &mut registry,
            "acme.Present",
            Arc::new(move |_, _| *sink.lock().unwrap() += 1),
        );
        let constraints = vec![
            constraint("acme.Absent", 1.0),
            constraint("acme.Present", 1.0),
        ];
        let mut value = rig();
        solve_skeleton_2d_constraints(&registry, &mut value, &constraints);
        assert_eq!(*solved.lock().unwrap(), 1);
    }

    #[test]
    fn hands_the_whole_constraint_to_its_solver() {
        let mut registry = create_skeleton_2d_constraint_registry();
        let seen_mix = Arc::new(Mutex::new(-1.0f32));
        let seen_kind = Arc::new(Mutex::new(String::new()));
        let mix_sink = seen_mix.clone();
        let kind_sink = seen_kind.clone();
        register_skeleton_2d_constraint_solver(
            &mut registry,
            "acme.Rope",
            Arc::new(move |_, value| {
                *mix_sink.lock().unwrap() = value.mix();
                *kind_sink.lock().unwrap() = String::from(value.kind());
            }),
        );
        let rope = constraint("acme.Rope", 0.25);
        let mut value = rig();
        solve_skeleton_2d_constraints(&registry, &mut value, &[rope]);
        assert!((*seen_mix.lock().unwrap() - 0.25).abs() < 1e-4);
        assert_eq!(*seen_kind.lock().unwrap(), "acme.Rope");
    }
}

mod unregister_skeleton_2d_constraint_solver {
    use super::*;

    #[test]
    fn releases_a_kind() {
        let mut registry = create_skeleton_2d_constraint_registry();
        register_skeleton_2d_constraint_solver(&mut registry, "test.Kind", Arc::new(|_, _| {}));
        unregister_skeleton_2d_constraint_solver(&mut registry, "test.Kind");
        assert!(get_skeleton_2d_constraint_solver(&registry, "test.Kind").is_none());
    }
}
