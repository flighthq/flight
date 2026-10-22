use crate::flight_physics2d_support_test::*;

// The source drives these through its module stepping set; that set is a private per-world flag
// here (D5), so the crate's inline ownership tests cover it directly and these observe the same
// contract through a real step, from inside a pre-solve hook.
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::{Arc, Mutex};

use flight_collision::{CollisionCircle2D, CollisionRegistry2D, CollisionShape2D};
use flight_entity::FlightError;
use flight_physics2d::*;

fn message(result: std::thread::Result<()>) -> Option<String> {
    return result.err().map(|payload| {
        payload
            .downcast_ref::<FlightError>()
            .unwrap()
            .message
            .clone()
    });
}

fn registry() -> CollisionRegistry2D {
    let mut registry = CollisionRegistry2D {
        pair_tests: std::collections::HashMap::new(),
        supports: std::collections::HashMap::new(),
        test_guard: None,
    };
    flight_collision::register_built_in_collision_supports2d(&mut registry);
    flight_collision::register_built_in_collision_pair_tests2d(&mut registry);
    return registry;
}

// Two overlapping dynamic circles, so the step reaches the pre-solve hook.
fn touching_world() -> (Physics2DWorld, Ref<RigidBody2D>) {
    let mut world = physics2d_world(Some(0.0), Some(0.0), None);
    let material = Physics2DMaterial {
        density: 1.0,
        friction: 0.5,
        restitution: 0.0,
    };
    let shape = CollisionShape2D::Circle(CollisionCircle2D {
        x: 0.0,
        y: 0.0,
        radius: 0.5,
    });
    let first = rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, None);
    let second = rigid_body2d(Physics2DBodyType::Dynamic, 0.75, 0.0, None);
    add_physics2d_body(&mut world, &first);
    add_physics2d_body(&mut world, &second);
    add_physics2d_collider(
        &mut world,
        &first,
        &physics2d_collider(&shape, &material, None, None),
    );
    add_physics2d_collider(
        &mut world,
        &second,
        &physics2d_collider(&shape, &material, None, None),
    );
    return (world, first);
}

type Ref<T> = flight_entity::Ref<T>;

mod assert_physics2d_body_not_stepping {
    use super::*;

    #[test]
    fn resolves_an_owned_body_to_its_active_world_while_leaving_detached_authoring_data_available()
    {
        let (mut world, owned) = touching_world();
        let detached = rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, None);
        let observed: Arc<Mutex<Vec<Option<String>>>> = Arc::new(Mutex::new(Vec::new()));
        let (hook_owned, hook_detached, hook_observed) =
            (owned.clone(), detached.clone(), observed.clone());
        world.contact_hooks.pre_solve = Some(Arc::new(move |_world, _contact| {
            let mut observed = hook_observed.lock().unwrap();
            if !observed.is_empty() {
                return;
            }
            let owned = hook_owned.clone();
            observed.push(message(catch_unwind(AssertUnwindSafe(move || {
                assert_physics2d_body_not_stepping(&owned.read().unwrap())
            }))));
            let detached = hook_detached.clone();
            observed.push(message(catch_unwind(AssertUnwindSafe(move || {
                assert_physics2d_body_not_stepping(&detached.read().unwrap())
            }))));
        }));
        step_physics2d(&mut world, 1.0 / 60.0, &registry(), None);
        let observed = observed.lock().unwrap();
        assert_eq!(observed.len(), 2);
        assert!(
            observed[0]
                .as_deref()
                .unwrap()
                .contains("while it is stepping")
        );
        assert_eq!(observed[1], None);
        assert!(
            catch_unwind(AssertUnwindSafe(|| assert_physics2d_body_not_stepping(
                &owned.read().unwrap()
            )))
            .is_ok()
        );
    }
}

mod assert_physics2d_world_not_stepping {
    use super::*;

    #[test]
    fn rejects_an_active_world_and_accepts_it_again_after_the_step_boundary_is_released() {
        let (mut world, _) = touching_world();
        assert!(
            catch_unwind(AssertUnwindSafe(|| assert_physics2d_world_not_stepping(
                &world
            )))
            .is_ok()
        );

        let observed: Arc<Mutex<Vec<Option<String>>>> = Arc::new(Mutex::new(Vec::new()));
        let hook_observed = observed.clone();
        world.contact_hooks.pre_solve = Some(Arc::new(move |world, _contact| {
            hook_observed
                .lock()
                .unwrap()
                .push(message(catch_unwind(AssertUnwindSafe(|| {
                    assert_physics2d_world_not_stepping(world)
                }))));
        }));
        step_physics2d(&mut world, 1.0 / 60.0, &registry(), None);
        let observed = observed.lock().unwrap();
        assert!(!observed.is_empty());
        assert!(
            observed[0]
                .as_deref()
                .unwrap()
                .contains("while it is stepping")
        );

        assert!(
            catch_unwind(AssertUnwindSafe(|| assert_physics2d_world_not_stepping(
                &world
            )))
            .is_ok()
        );
    }
}
