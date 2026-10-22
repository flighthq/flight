//! Exclusive world ownership and the stepping boundary (TS `ownership.ts`). The source's module
//! WeakMaps and WeakSet are private per-entity links to the owner's durable identity token.

use std::sync::atomic::Ordering;

use flight_entity::throw_error;

use crate::types::*;

#[cfg(test)]
mod ownership_tests {
    use std::panic::{AssertUnwindSafe, catch_unwind};

    use flight_entity::FlightError;

    use super::*;
    use crate::world::{
        add_physics2d_body, add_physics2d_collider, create_physics2d_collider,
        create_physics2d_world, create_rigid_body2d,
    };

    fn message(result: std::thread::Result<()>) -> Option<String> {
        return result.err().map(|payload| {
            payload
                .downcast_ref::<FlightError>()
                .unwrap()
                .message
                .clone()
        });
    }

    #[test]
    fn assert_physics2d_body_not_stepping_resolves_an_owned_body_to_its_active_world() {
        let mut world = create_physics2d_world();
        let owned = create_rigid_body2d();
        add_physics2d_body(&mut world, &owned);
        let detached = create_rigid_body2d();
        set_physics2d_world_stepping(&world, true);
        let rejected = message(catch_unwind(AssertUnwindSafe(|| {
            assert_physics2d_body_not_stepping(&owned.read().unwrap())
        })));
        assert!(rejected.unwrap().contains("while it is stepping"));
        assert!(
            catch_unwind(AssertUnwindSafe(|| assert_physics2d_body_not_stepping(
                &detached.read().unwrap()
            )))
            .is_ok()
        );
        set_physics2d_world_stepping(&world, false);
    }

    #[test]
    fn assert_physics2d_world_not_stepping_rejects_an_active_world_and_accepts_it_after_release() {
        let world = create_physics2d_world();
        assert!(
            catch_unwind(AssertUnwindSafe(|| assert_physics2d_world_not_stepping(
                &world
            )))
            .is_ok()
        );
        set_physics2d_world_stepping(&world, true);
        let rejected = message(catch_unwind(AssertUnwindSafe(|| {
            assert_physics2d_world_not_stepping(&world)
        })));
        assert!(rejected.unwrap().contains("while it is stepping"));
        set_physics2d_world_stepping(&world, false);
        assert!(
            catch_unwind(AssertUnwindSafe(|| assert_physics2d_world_not_stepping(
                &world
            )))
            .is_ok()
        );
    }

    // TS: the colliderOwners WeakMap value keeps its body while the collider lives, so dropping
    // every handle to the owning body never frees the collider for another body.
    #[test]
    fn collider_ownership_survives_the_owning_body_being_dropped() {
        let mut world = create_physics2d_world();
        let material = Physics2DMaterial {
            density: 1.0,
            friction: 0.5,
            restitution: 0.0,
        };
        let shape = flight_collision::CollisionShape2D::Point(flight_collision::CollisionPoint2D {
            x: 0.0,
            y: 0.0,
        });
        let collider = create_physics2d_collider(&shape);
        collider.write().unwrap().material = material;
        {
            let owner = create_rigid_body2d();
            add_physics2d_collider(&mut world, &owner, &collider);
        }
        let other = create_rigid_body2d();
        let rejected = message(catch_unwind(AssertUnwindSafe(|| {
            add_physics2d_collider(&mut world, &other, &collider)
        })));
        assert_eq!(
            rejected.as_deref(),
            Some("Cannot share a physics collider between rigid bodies")
        );
    }
}

/// Panics when `body` belongs to a world that is stepping; detached authoring data passes (TS
/// `assertPhysics2DBodyNotStepping`).
pub fn assert_physics2d_body_not_stepping(body: &RigidBody2D) {
    if let Some(owner) = body.owner.as_ref()
        && owner.stepping.load(Ordering::SeqCst)
    {
        throw_error("Cannot mutate a physics world while it is stepping");
    }
}

/// Panics when `world` is stepping (TS `assertPhysics2DWorldNotStepping`).
pub fn assert_physics2d_world_not_stepping(world: &Physics2DWorld) {
    if is_physics2d_world_stepping(world) {
        throw_error("Cannot mutate a physics world while it is stepping");
    }
}

#[allow(dead_code)]
pub(crate) fn is_physics2d_body_owned_by(body: &RigidBody2D, world: &Physics2DWorld) -> bool {
    return body
        .owner
        .as_ref()
        .is_some_and(|owner| std::sync::Arc::ptr_eq(owner, &world.identity));
}

pub(crate) fn is_physics2d_world_stepping(world: &Physics2DWorld) -> bool {
    return world.identity.stepping.load(Ordering::SeqCst);
}

pub(crate) fn set_physics2d_world_stepping(world: &Physics2DWorld, stepping: bool) {
    world.identity.stepping.store(stepping, Ordering::SeqCst);
}
