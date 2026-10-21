use std::sync::{Arc, Mutex};

use flight_collision::{CollisionAabb3D, CollisionColliderShape3D, CollisionShape3D};
use flight_spatial::{SpatialIndexingReason, SpatialPair, set_spatial_indexing_guard};

use super::*;
use crate::common::*;

fn aabb_shape(
    min_x: f32,
    min_y: f32,
    min_z: f32,
    max_x: f32,
    max_y: f32,
    max_z: f32,
) -> CollisionColliderShape3D {
    CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(CollisionAabb3D {
        min_x,
        min_y,
        min_z,
        max_x,
        max_y,
        max_z,
    }))
}

fn add_box_body(world: &mut Physics3DWorld, x: f32, y: f32, z: f32) -> RigidBody3DRef {
    let body = create_rigid_body_3d();
    {
        let mut body_write = body.write().unwrap();
        body_write.x = x;
        body_write.y = y;
        body_write.z = z;
    }
    add_physics_3d_body(world, &body);
    let collider = physics_3d_collider(
        &aabb_shape(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5),
        None,
        None,
        None,
    );
    add_physics_3d_collider(world, &body, &collider);
    body
}

fn pairs(world: &Physics3DWorld) -> Vec<SpatialPair> {
    let mut out = Vec::new();
    (world.index.query_spatial_pairs)(&mut out);
    out
}

mod synchronize_physics_3d_broadphase {
    use super::*;

    #[test]
    fn follows_a_body_that_moves_after_insertion() {
        let mut world = world();
        add_box_body(&mut world, 0.0, 0.0, 0.0);
        let mover = add_box_body(&mut world, 500.0, 0.0, 0.0);
        synchronize_physics_3d_broadphase(&mut world);
        assert!(pairs(&world).is_empty());

        mover.write().unwrap().x = 0.25;
        synchronize_physics_3d_broadphase(&mut world);

        assert_eq!(pairs(&world).len(), 1);
    }

    #[test]
    fn publishes_an_overlapping_neighbour_as_a_candidate_pair() {
        let mut world = world();
        add_box_body(&mut world, 0.0, 0.0, 0.0);
        add_box_body(&mut world, 0.25, 0.0, 0.0);

        synchronize_physics_3d_broadphase(&mut world);

        assert_eq!(pairs(&world).len(), 1);
    }

    #[test]
    fn refreshes_each_collider_world_shape_at_the_current_pose() {
        let mut world = world();
        let body = add_box_body(&mut world, 0.0, 0.0, 0.0);
        body.write().unwrap().x = 7.0;

        synchronize_physics_3d_broadphase(&mut world);

        let collider = body.read().unwrap().colliders[0].clone();
        let collider = collider.read().unwrap();
        let CollisionColliderShape3D::BuiltIn(CollisionShape3D::Box(world_box)) = &collider.world
        else {
            panic!("expected the transformed AABB to be a box");
        };
        assert!((world_box.x - 7.0).abs() < 1.0e-6);
    }

    #[test]
    fn reports_no_pair_for_bodies_far_apart() {
        let mut world = world();
        add_box_body(&mut world, 0.0, 0.0, 0.0);
        add_box_body(&mut world, 500.0, 0.0, 0.0);

        synchronize_physics_3d_broadphase(&mut world);

        assert!(pairs(&world).is_empty());
    }

    #[test]
    fn separates_bodies_along_z() {
        let mut world = world();
        add_box_body(&mut world, 0.0, 0.0, 0.0);
        add_box_body(&mut world, 0.0, 0.0, 500.0);

        synchronize_physics_3d_broadphase(&mut world);

        assert!(pairs(&world).is_empty());
    }

    #[test]
    fn unions_a_compound_body_into_one_indexed_volume() {
        let mut world = world();
        let compound = create_rigid_body_3d();
        add_physics_3d_body(&mut world, &compound);
        let near = physics_3d_collider(
            &aabb_shape(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5),
            None,
            None,
            None,
        );
        add_physics_3d_collider(&mut world, &compound, &near);
        let far = physics_3d_collider(
            &aabb_shape(9.5, -0.5, -0.5, 10.5, 0.5, 0.5),
            None,
            None,
            None,
        );
        add_physics_3d_collider(&mut world, &compound, &far);
        add_box_body(&mut world, 10.0, 0.0, 0.0);

        synchronize_physics_3d_broadphase(&mut world);

        assert_eq!(pairs(&world).len(), 1);
    }

    #[test]
    fn uses_insert_update_and_remove_without_missing_id_notices() {
        let notices = Arc::new(Mutex::new(Vec::new()));
        let seen = notices.clone();
        set_spatial_indexing_guard(Some(Arc::new(move |notice| {
            seen.lock().unwrap().push(notice.clone());
        })));
        let mut world = world();
        let body = create_rigid_body_3d();

        add_physics_3d_body(&mut world, &body);
        for _ in 0..100 {
            synchronize_physics_3d_broadphase(&mut world);
        }
        let collider = physics_3d_collider(
            &aabb_shape(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5),
            None,
            None,
            None,
        );
        add_physics_3d_collider(&mut world, &body, &collider);
        synchronize_physics_3d_broadphase(&mut world);
        body.write().unwrap().colliders.clear();
        synchronize_physics_3d_broadphase(&mut world);
        synchronize_physics_3d_broadphase(&mut world);
        assert!(remove_physics_3d_body(&mut world, &body));
        set_spatial_indexing_guard(None);

        assert!(
            notices
                .lock()
                .unwrap()
                .iter()
                .all(|notice| notice.reason != Some(SpatialIndexingReason::MissingId))
        );
    }

    #[test]
    fn withdraws_a_body_that_has_no_colliders() {
        let mut world = world();
        add_box_body(&mut world, 0.0, 0.0, 0.0);
        let ghost = add_box_body(&mut world, 0.25, 0.0, 0.0);
        synchronize_physics_3d_broadphase(&mut world);
        assert_eq!(pairs(&world).len(), 1);

        ghost.write().unwrap().colliders.clear();
        synchronize_physics_3d_broadphase(&mut world);

        assert!(pairs(&world).is_empty());
    }

    #[test]
    fn withdraws_a_body_that_has_non_finite_position() {
        let mut world = world();
        add_box_body(&mut world, 0.0, 0.0, 0.0);
        let diverged = add_box_body(&mut world, 0.25, 0.0, 0.0);
        diverged.write().unwrap().x = f32::NAN;

        synchronize_physics_3d_broadphase(&mut world);

        assert!(pairs(&world).is_empty());
    }

    #[test]
    fn withdraws_a_body_whose_bounds_exceed_the_simulated_extent() {
        let mut world = world();
        add_box_body(&mut world, 0.0, 0.0, 0.0);
        let huge = create_rigid_body_3d();
        add_physics_3d_body(&mut world, &huge);
        let collider = physics_3d_collider(
            &aabb_shape(-1.0e9, -1.0, -1.0, 1.0e9, 1.0, 1.0),
            None,
            None,
            None,
        );
        add_physics_3d_collider(&mut world, &huge, &collider);

        synchronize_physics_3d_broadphase(&mut world);

        assert!(pairs(&world).is_empty());
    }
}

mod synchronize_physics_3d_swept_broadphase {
    use super::*;

    #[test]
    fn covers_every_orientation_a_spinning_body_could_reach() {
        let mut world = world();
        let spinner = create_rigid_body_3d();
        add_physics_3d_body(&mut world, &spinner);
        let arm = physics_3d_collider(
            &aabb_shape(-0.25, -0.25, -0.25, 4.0, 0.25, 0.25),
            None,
            None,
            None,
        );
        add_physics_3d_collider(&mut world, &spinner, &arm);
        spinner.write().unwrap().angular_velocity_y = 30.0;
        add_box_body(&mut world, 0.0, 0.0, 3.5);
        synchronize_physics_3d_broadphase(&mut world);
        assert!(pairs(&world).is_empty());

        synchronize_physics_3d_swept_broadphase(&mut world, 1.0 / 60.0);

        assert_eq!(pairs(&world).len(), 1);
    }

    #[test]
    fn does_not_widen_a_sleeping_body() {
        let mut world = world();
        add_box_body(&mut world, 0.0, 0.0, 0.0);
        let asleep = add_box_body(&mut world, 20.0, 0.0, 0.0);
        {
            let mut asleep = asleep.write().unwrap();
            asleep.velocity_x = -1200.0;
            asleep.sleeping = true;
        }

        synchronize_physics_3d_swept_broadphase(&mut world, 1.0 / 60.0);

        assert!(pairs(&world).is_empty());
    }

    #[test]
    fn does_not_widen_a_static_body() {
        let mut world = world();
        add_box_body(&mut world, 0.0, 0.0, 0.0);
        let stuck = rigid_body(Physics3DBodyType::Static);
        {
            let mut stuck_write = stuck.write().unwrap();
            stuck_write.x = 20.0;
            stuck_write.velocity_x = -1200.0;
        }
        add_physics_3d_body(&mut world, &stuck);
        let collider = physics_3d_collider(
            &aabb_shape(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5),
            None,
            None,
            None,
        );
        add_physics_3d_collider(&mut world, &stuck, &collider);

        synchronize_physics_3d_swept_broadphase(&mut world, 1.0 / 60.0);

        assert!(pairs(&world).is_empty());
    }

    #[test]
    fn leaves_a_body_that_is_not_moving_where_it_was() {
        let mut world = world();
        add_box_body(&mut world, 0.0, 0.0, 0.0);
        add_box_body(&mut world, 20.0, 0.0, 0.0);

        synchronize_physics_3d_swept_broadphase(&mut world, 1.0 / 60.0);

        assert!(pairs(&world).is_empty());
    }

    #[test]
    fn pairs_bodies_that_only_meet_partway_through_the_interval() {
        let mut world = world();
        add_box_body(&mut world, 0.0, 0.0, 0.0);
        let mover = add_box_body(&mut world, 20.0, 0.0, 0.0);
        mover.write().unwrap().velocity_x = -1200.0;
        synchronize_physics_3d_broadphase(&mut world);
        assert!(pairs(&world).is_empty());

        synchronize_physics_3d_swept_broadphase(&mut world, 1.0 / 60.0);

        assert_eq!(pairs(&world).len(), 1);
    }

    #[test]
    fn restores_ordinary_bounds_when_plain_sync_runs_afterward() {
        let mut world = world();
        add_box_body(&mut world, 0.0, 0.0, 0.0);
        let mover = add_box_body(&mut world, 20.0, 0.0, 0.0);
        mover.write().unwrap().velocity_x = -1200.0;

        synchronize_physics_3d_swept_broadphase(&mut world, 1.0 / 60.0);
        assert_eq!(pairs(&world).len(), 1);
        synchronize_physics_3d_broadphase(&mut world);

        assert!(pairs(&world).is_empty());
    }
}
