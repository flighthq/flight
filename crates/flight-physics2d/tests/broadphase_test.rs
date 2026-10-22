use crate::flight_physics2d_support_test::*;

use std::sync::{Arc, Mutex};

use flight_collision::{CollisionAabb2D, CollisionCircle2D, CollisionPoint2D, CollisionShape2D};
use flight_physics2d::*;
use flight_spatial::{SpatialAabb2D, SpatialPair};

const STONE: Physics2DMaterial = Physics2DMaterial {
    density: 1.0,
    friction: 0.3,
    restitution: 0.0,
};

fn circle(radius: f64) -> CollisionShape2D {
    return CollisionShape2D::Circle(CollisionCircle2D {
        x: 0.0,
        y: 0.0,
        radius,
    });
}

fn body_with(
    world: &mut Physics2DWorld,
    body_type: Physics2DBodyType,
    x: f32,
    y: f32,
    shape: &CollisionShape2D,
) -> flight_entity::Ref<RigidBody2D> {
    let body = rigid_body2d(body_type, x, y, None);
    body.write()
        .unwrap()
        .colliders
        .push(physics2d_collider(shape, &STONE, None, None));
    add_physics2d_body(world, &body);
    return body;
}

mod synchronize_physics2d_broadphase {
    use super::*;

    #[test]
    fn keeps_published_bounds_isolated_when_an_index_callback_synchronizes_another_world() {
        let mut world = physics2d_world(Some(0.0), Some(0.0), None);
        body_with(
            &mut world,
            Physics2DBodyType::Dynamic,
            2.0,
            3.0,
            &circle(1.0),
        );

        let mut nested_world = physics2d_world(Some(0.0), Some(0.0), None);
        body_with(
            &mut nested_world,
            Physics2DBodyType::Dynamic,
            100.0,
            200.0,
            &circle(5.0),
        );
        let nested_world = Arc::new(nested_world);

        let nested_calls = Arc::new(Mutex::new(0));
        let published = Arc::new(Mutex::new(SpatialAabb2D {
            min_x: 0.0,
            min_y: 0.0,
            max_x: 0.0,
            max_y: 0.0,
        }));
        let (calls, out, nested) = (
            nested_calls.clone(),
            published.clone(),
            nested_world.clone(),
        );
        world.index.update_spatial_object = Arc::new(move |_id, bounds| {
            *calls.lock().unwrap() += 1;
            synchronize_physics2d_broadphase(&nested);
            *out.lock().unwrap() = *bounds;
            return true;
        });

        synchronize_physics2d_broadphase(&world);

        assert_eq!(*nested_calls.lock().unwrap(), 1);
        let published = *published.lock().unwrap();
        assert_eq!(published.min_x, 1.0);
        assert_eq!(published.min_y, 2.0);
        assert!((published.max_x - 3.0).abs() < 0.005);
        assert!((published.max_y - 4.0).abs() < 0.005);
    }

    #[test]
    fn keeps_zero_area_shapes_and_inclusive_upper_edges_queryable() {
        let mut world = physics2d_world(Some(0.0), Some(0.0), None);
        let point = CollisionShape2D::Point(CollisionPoint2D { x: 1.0, y: 1.0 });
        let body = body_with(&mut world, Physics2DBodyType::Dynamic, 2.0, 3.0, &point);
        let mut found = Vec::new();

        synchronize_physics2d_broadphase(&world);
        (world.index.query_spatial_point)(&mut found, 3.0, 4.0);

        assert_eq!(found, vec![body.read().unwrap().index]);
    }

    #[test]
    fn publishes_a_body_at_its_current_pose() {
        let mut world = physics2d_world(Some(0.0), Some(0.0), None);
        let body = body_with(
            &mut world,
            Physics2DBodyType::Dynamic,
            2.0,
            3.0,
            &circle(1.0),
        );
        let mut found = Vec::new();

        synchronize_physics2d_broadphase(&world);
        (world.index.query_spatial_point)(&mut found, 2.0, 3.0);

        assert_eq!(found, vec![body.read().unwrap().index]);
    }
}

mod synchronize_physics2d_swept_broadphase {
    use super::*;

    #[test]
    fn conservatively_indexes_the_full_rotation_radius_of_an_angular_body() {
        let mut world = physics2d_world(Some(0.0), Some(0.0), None);
        let rod_shape = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: -2.0,
            min_y: -0.05,
            max_x: 2.0,
            max_y: 0.05,
        });
        let rod = body_with(&mut world, Physics2DBodyType::Dynamic, 0.0, 0.0, &rod_shape);
        rod.write().unwrap().angular_velocity = std::f32::consts::PI;
        let obstacle = body_with(
            &mut world,
            Physics2DBodyType::Static,
            0.0,
            1.5,
            &circle(0.1),
        );
        let mut pairs: Vec<SpatialPair> = Vec::new();

        synchronize_physics2d_broadphase(&world);
        (world.index.query_spatial_pairs)(&mut pairs);
        assert_eq!(pairs.len(), 0);

        synchronize_physics2d_swept_broadphase(&world, 0.5);
        (world.index.query_spatial_pairs)(&mut pairs);
        assert_eq!(
            pairs,
            vec![SpatialPair {
                a: rod.read().unwrap().index,
                b: obstacle.read().unwrap().index,
            }]
        );
    }

    #[test]
    fn emits_a_pair_separated_now_but_overlapping_during_relative_translation() {
        let mut world = physics2d_world(Some(0.0), Some(0.0), None);
        let first = body_with(
            &mut world,
            Physics2DBodyType::Dynamic,
            0.0,
            0.0,
            &circle(0.5),
        );
        first.write().unwrap().velocity_x = 10.0;
        let second = body_with(
            &mut world,
            Physics2DBodyType::Kinematic,
            10.0,
            0.0,
            &circle(0.5),
        );
        second.write().unwrap().velocity_x = -10.0;
        let mut pairs: Vec<SpatialPair> = Vec::new();

        synchronize_physics2d_broadphase(&world);
        (world.index.query_spatial_pairs)(&mut pairs);
        assert_eq!(pairs.len(), 0);

        synchronize_physics2d_swept_broadphase(&world, 0.5);
        (world.index.query_spatial_pairs)(&mut pairs);
        assert_eq!(
            pairs,
            vec![SpatialPair {
                a: first.read().unwrap().index,
                b: second.read().unwrap().index,
            }]
        );
    }
}
