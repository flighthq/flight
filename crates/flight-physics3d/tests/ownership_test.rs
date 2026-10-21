use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::Arc;

use super::*;
use crate::common::*;

mod assert_physics_3d_body_not_stepping {
    use super::*;

    #[test]
    fn accepts_an_unowned_body() {
        let body = create_rigid_body_3d();
        assert_physics_3d_body_not_stepping(&body.read().unwrap());
        assert_eq!(body.read().unwrap().index, -1);
    }

    #[test]
    fn resolves_the_owner_and_refuses_mutation_during_its_step() {
        let mut world = world();
        let body = add_body(&mut world, Physics3DBodyType::Dynamic);
        let other = add_body(&mut world, Physics3DBodyType::Static);
        add_physics_3d_collider(&mut world, &body, &collider());
        add_physics_3d_collider(&mut world, &other, &collider());
        let body_during_step = body.clone();
        world.contact_hooks.pre_solve = Some(Arc::new(move |_, _| {
            assert_physics_3d_body_not_stepping(&body_during_step.read().unwrap());
        }));

        let result = catch_unwind(AssertUnwindSafe(|| {
            step_physics_3d(&mut world, &registered_registry(), 1.0 / 60.0, None);
        }));

        assert!(result.is_err());
        assert_physics_3d_body_not_stepping(&body.read().unwrap());
    }
}
