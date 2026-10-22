use crate::flight_physics2d_support_test::*;

use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, RwLockWriteGuard};

use flight_collision::{
    CollisionAabb2D, CollisionCircle2D, CollisionPoint2D, CollisionRegistry2D, CollisionSegment2D,
    CollisionShape2D, register_built_in_collision_pair_tests2d,
    register_built_in_collision_supports2d,
};
use flight_entity::{Entity, Ref};
use flight_physics2d::contract::*;
use flight_spatial::SpatialAabb2D;

const STONE: Physics2DMaterial = Physics2DMaterial {
    density: 1.0,
    friction: 0.3,
    restitution: 0.0,
};

fn aabb(min_x: f32, min_y: f32, max_x: f32, max_y: f32) -> CollisionShape2D {
    return CollisionShape2D::Aabb(CollisionAabb2D {
        min_x,
        min_y,
        max_x,
        max_y,
    });
}

fn assert_entity<T: Entity>(_value: &T) {}

fn body_with(
    world: &mut Physics2DWorld,
    body_type: Physics2DBodyType,
    x: f32,
    y: f32,
    angle: Option<f32>,
    shapes: &[CollisionShape2D],
) -> Ref<RigidBody2D> {
    let body = rigid_body2d(body_type, x, y, angle);
    for shape in shapes {
        write(&body)
            .colliders
            .push(physics2d_collider(shape, &STONE, None, None));
    }
    add_physics2d_body(world, &body);
    return body;
}

fn circle(x: f64, y: f64, radius: f64) -> CollisionShape2D {
    return CollisionShape2D::Circle(CollisionCircle2D { x, y, radius });
}

fn index_of(body: &Ref<RigidBody2D>) -> i32 {
    return body.read().unwrap().index;
}

fn live_bodies(out: &Physics2DQueryResult) -> Vec<Ref<RigidBody2D>> {
    return out.hits[..out.hit_count]
        .iter()
        .map(|hit| hit.body.clone())
        .collect();
}

fn live_pairs(out: &Physics2DQueryResult) -> Vec<(i32, usize)> {
    return out.hits[..out.hit_count]
        .iter()
        .map(|hit| (index_of(&hit.body), hit.collider_index))
        .collect();
}

fn region(min_x: f32, min_y: f32, max_x: f32, max_y: f32) -> SpatialAabb2D {
    return SpatialAabb2D {
        min_x,
        min_y,
        max_x,
        max_y,
    };
}

fn registry() -> CollisionRegistry2D {
    let mut registry = CollisionRegistry2D {
        pair_tests: HashMap::new(),
        supports: HashMap::new(),
        test_guard: None,
    };
    register_built_in_collision_supports2d(&mut registry);
    register_built_in_collision_pair_tests2d(&mut registry);
    return registry;
}

fn same_bodies(actual: &[Ref<RigidBody2D>], expected: &[&Ref<RigidBody2D>]) -> bool {
    return actual.len() == expected.len()
        && actual.iter().zip(expected).all(|(a, b)| Arc::ptr_eq(a, b));
}

fn unit_box() -> CollisionShape2D {
    return aabb(-0.5, -0.5, 0.5, 0.5);
}

// A world with one static wall, so the analytic answer for a box sweeping into it is arithmetic the
// test can do rather than a number read off the implementation.
fn walled_world() -> Physics2DWorld {
    let mut world = physics2d_world(Some(0.0), Some(0.0), None);
    body_with(
        &mut world,
        Physics2DBodyType::Static,
        0.0,
        0.0,
        None,
        &[aabb(5.0, -10.0, 6.0, 10.0)],
    );
    return world;
}

fn world() -> Physics2DWorld {
    return physics2d_world(Some(0.0), Some(0.0), None);
}

fn write(body: &Ref<RigidBody2D>) -> RwLockWriteGuard<'_, RigidBody2D> {
    return body.write().unwrap();
}

mod create_physics2d_query_filter {
    use super::*;

    #[test]
    fn includes_every_body_kind_sensor_category_and_mask_by_default() {
        assert_eq!(
            create_physics2d_query_filter(),
            Physics2DQueryFilter {
                category_bits: 0xffff_ffff,
                mask_bits: 0xffff_ffff,
                include_sensors: true,
                include_dynamic: true,
                include_kinematic: true,
                include_static: true,
            }
        );
    }
}

mod create_physics2d_query_result {
    use super::*;

    #[test]
    fn starts_with_no_live_hits() {
        let result = create_physics2d_query_result();
        assert_entity(&result);
        assert!(result.hits.is_empty());
        assert_eq!(result.hit_count, 0);
    }
}

mod create_physics2d_ray_result {
    use super::*;

    #[test]
    fn starts_with_no_live_hits() {
        let result = create_physics2d_ray_result();
        assert_entity(&result);
        assert!(result.hits.is_empty());
        assert_eq!(result.hit_count, 0);
    }
}

mod create_physics2d_shape_cast_result {
    use super::*;

    #[test]
    fn starts_as_a_miss_with_nothing_referenced() {
        let result = create_physics2d_shape_cast_result();
        assert_entity(&result);
        assert!(result.body.is_none());
        assert!(result.collider.is_none());
        assert_eq!(result.collider_index, -1);
        assert!(!result.hit);
        assert_eq!(result.fraction, 0.0);
        assert_eq!(result.x, 0.0);
        assert_eq!(result.y, 0.0);
        assert_eq!(result.normal_x, 0.0);
        assert_eq!(result.normal_y, 0.0);
    }
}

mod initialize_physics2d_query_result {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_query_result() {
        let mut world = world();
        body_with(
            &mut world,
            Physics2DBodyType::Dynamic,
            0.0,
            0.0,
            None,
            &[circle(0.0, 0.0, 1.0)],
        );
        let mut out = create_physics2d_query_result();
        query_physics2d_point(&mut out, &world, 0.0, 0.0, None);
        assert_eq!(out.hit_count, 1);
        initialize_physics2d_query_result(&mut out);
        assert!(out.hits.is_empty());
        assert_eq!(out.hit_count, 0);
    }
}

mod initialize_physics2d_ray_result {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_ray_result() {
        let mut world = world();
        body_with(
            &mut world,
            Physics2DBodyType::Dynamic,
            3.0,
            0.0,
            None,
            &[circle(0.0, 0.0, 1.0)],
        );
        let mut out = create_physics2d_ray_result();
        query_physics2d_ray(&mut out, &world, 0.0, 0.0, 1.0, 0.0, None, None);
        assert_eq!(out.hit_count, 1);
        initialize_physics2d_ray_result(&mut out);
        assert!(out.hits.is_empty());
        assert_eq!(out.hit_count, 0);
    }
}

mod initialize_physics2d_shape_cast_result {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics2d_shape_cast_result() {
        let world = walled_world();
        let mut out = create_physics2d_shape_cast_result();
        query_physics2d_shape_cast(
            &mut out,
            &world,
            &registry(),
            &unit_box(),
            10.0,
            0.0,
            None,
            None,
        );
        assert!(out.hit);
        initialize_physics2d_shape_cast_result(&mut out);
        assert!(!out.hit);
        assert!(out.body.is_none());
        assert_eq!(out.collider_index, -1);
    }
}

mod query_physics2d_point {
    use super::*;

    #[test]
    fn filters_body_participation_sensors_collider_categories_and_collider_masks() {
        let mut world = world();
        let dynamic = rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, None);
        write(&dynamic).colliders.push(physics2d_collider(
            &circle(0.0, 0.0, 1.0),
            &STONE,
            Some(true),
            Some(&Physics2DCollisionFilter {
                category_bits: 0x2,
                mask_bits: 0x4,
                group_index: 0,
            }),
        ));
        add_physics2d_body(&mut world, &dynamic);
        body_with(
            &mut world,
            Physics2DBodyType::Static,
            0.0,
            0.0,
            None,
            &[circle(0.0, 0.0, 1.0)],
        );
        let mut filter = create_physics2d_query_filter();
        filter.category_bits = 0x2;
        filter.mask_bits = 0x4;
        filter.include_sensors = false;
        filter.include_static = false;
        let mut out = create_physics2d_query_result();

        query_physics2d_point(&mut out, &world, 0.0, 0.0, Some(&filter));
        assert_eq!(out.hit_count, 0);
        filter.include_sensors = true;
        query_physics2d_point(&mut out, &world, 0.0, 0.0, Some(&filter));
        assert!(same_bodies(&live_bodies(&out), &[&dynamic]));
    }

    // TS re-enters through a filter property getter, which a plain Rust record cannot carry; the same
    // re-entrancy is driven from the broadphase callback the query consults for its candidates.
    #[test]
    fn keeps_broadphase_candidates_isolated_when_a_filter_getter_starts_a_nested_query() {
        let mut world = world();
        let first = body_with(
            &mut world,
            Physics2DBodyType::Dynamic,
            0.0,
            0.0,
            None,
            &[circle(0.0, 0.0, 1.0)],
        );
        let second = body_with(
            &mut world,
            Physics2DBodyType::Dynamic,
            0.0,
            0.0,
            None,
            &[circle(0.0, 0.0, 1.0)],
        );
        let nested_world = Arc::new(world_at_origin_with_body());
        let nested_calls = Arc::new(AtomicUsize::new(0));
        let original = world.index.query_spatial_point.clone();
        let (nested, calls) = (nested_world.clone(), nested_calls.clone());
        world.index.query_spatial_point = Arc::new(move |out, x, y| {
            original(out, x, y);
            if calls.load(Ordering::SeqCst) == 0 {
                calls.fetch_add(1, Ordering::SeqCst);
                query_physics2d_point(
                    &mut create_physics2d_query_result(),
                    &nested,
                    0.0,
                    0.0,
                    None,
                );
            }
        });
        let filter = create_physics2d_query_filter();
        let mut out = create_physics2d_query_result();

        query_physics2d_point(&mut out, &world, 0.0, 0.0, Some(&filter));

        assert_eq!(nested_calls.load(Ordering::SeqCst), 1);
        assert!(same_bodies(&live_bodies(&out), &[&first, &second]));
    }

    fn world_at_origin_with_body() -> Physics2DWorld {
        let mut nested = world();
        body_with(
            &mut nested,
            Physics2DBodyType::Dynamic,
            0.0,
            0.0,
            None,
            &[circle(0.0, 0.0, 1.0)],
        );
        return nested;
    }

    // The hit records are values in the reusable Vec, so "reuses its high-water hit object" is the
    // retained slot: the storage does not grow on a repeat query.
    #[test]
    fn observes_current_poses_and_reuses_its_high_water_hit_object() {
        let mut world = world();
        let body = body_with(
            &mut world,
            Physics2DBodyType::Dynamic,
            0.0,
            0.0,
            None,
            &[circle(0.0, 0.0, 1.0)],
        );
        let mut out = create_physics2d_query_result();

        query_physics2d_point(&mut out, &world, 0.0, 0.0, None);
        let retained = out.hits.len();
        write(&body).x = 5.0;
        query_physics2d_point(&mut out, &world, 0.0, 0.0, None);
        assert_eq!(out.hit_count, 0);
        query_physics2d_point(&mut out, &world, 5.0, 0.0, None);

        assert_eq!(out.hit_count, 1);
        assert_eq!(out.hits.len(), retained);
        assert!(Arc::ptr_eq(&out.hits[0].body, &body));
    }

    #[test]
    fn queries_transformed_point_and_segment_colliders_at_their_current_pose() {
        let mut world = world();
        body_with(
            &mut world,
            Physics2DBodyType::Dynamic,
            3.0,
            4.0,
            Some(std::f32::consts::FRAC_PI_2),
            &[
                CollisionShape2D::Point(CollisionPoint2D { x: 2.0, y: 0.0 }),
                CollisionShape2D::Segment(CollisionSegment2D {
                    x0: 0.0,
                    y0: 0.0,
                    x1: 2.0,
                    y1: 0.0,
                }),
            ],
        );
        let mut out = create_physics2d_query_result();

        query_physics2d_point(&mut out, &world, 3.0, 6.0, None);

        let indices: Vec<usize> = out.hits[..out.hit_count]
            .iter()
            .map(|hit| hit.collider_index)
            .collect();
        assert_eq!(indices, vec![0, 1]);
    }

    #[test]
    fn reports_every_containing_collider_in_deterministic_order() {
        let mut world = world();
        let first = body_with(
            &mut world,
            Physics2DBodyType::Dynamic,
            0.0,
            0.0,
            None,
            &[circle(0.0, 0.0, 2.0), circle(0.0, 0.0, 1.0)],
        );
        let second = body_with(
            &mut world,
            Physics2DBodyType::Dynamic,
            0.0,
            0.0,
            None,
            &[circle(0.0, 0.0, 1.0)],
        );
        let mut out = create_physics2d_query_result();

        query_physics2d_point(&mut out, &world, 0.0, 0.0, None);

        assert_eq!(
            live_pairs(&out),
            vec![
                (index_of(&first), 0),
                (index_of(&first), 1),
                (index_of(&second), 0)
            ]
        );
    }

    #[test]
    fn returns_exact_collider_hits_rather_than_broadphase_only_body_hits() {
        let mut world = world();
        let body = body_with(
            &mut world,
            Physics2DBodyType::Dynamic,
            0.0,
            0.0,
            Some(std::f32::consts::FRAC_PI_4),
            &[aabb(-2.0, -0.25, 2.0, 0.25)],
        );
        let mut out = create_physics2d_query_result();

        query_physics2d_point(&mut out, &world, 1.0, 0.0, None);
        assert_eq!(out.hit_count, 0);
        query_physics2d_point(&mut out, &world, 1.0, 1.0, None);

        assert_eq!(out.hit_count, 1);
        assert!(Arc::ptr_eq(&out.hits[0].body, &body));
        assert!(Arc::ptr_eq(
            &out.hits[0].collider,
            &body.read().unwrap().colliders[0]
        ));
        assert_eq!(out.hits[0].collider_index, 0);
    }
}

mod query_physics2d_ray {
    use super::*;

    #[test]
    fn degenerates_a_zero_direction_to_an_exact_point_query() {
        let mut world = world();
        let body = body_with(
            &mut world,
            Physics2DBodyType::Dynamic,
            3.0,
            4.0,
            None,
            &[CollisionShape2D::Point(CollisionPoint2D { x: 0.0, y: 0.0 })],
        );
        let mut out = create_physics2d_ray_result();

        query_physics2d_ray(&mut out, &world, 3.0, 4.0, 0.0, 0.0, None, None);

        assert_eq!(out.hit_count, 1);
        let hit = &out.hits[0];
        assert!(Arc::ptr_eq(&hit.body, &body));
        assert_eq!(
            [hit.fraction, hit.normal_x, hit.normal_y, hit.x, hit.y],
            [0.0, 0.0, 0.0, 3.0, 4.0]
        );
    }

    // The retained record is the Vec slot (see query_physics2d_point).
    #[test]
    fn honours_max_fraction_and_reuses_retained_hit_objects() {
        let mut world = world();
        body_with(
            &mut world,
            Physics2DBodyType::Dynamic,
            3.0,
            0.0,
            None,
            &[circle(0.0, 0.0, 1.0)],
        );
        let mut out = create_physics2d_ray_result();
        query_physics2d_ray(&mut out, &world, 0.0, 0.0, 1.0, 0.0, None, None);
        let retained = out.hits.len();

        query_physics2d_ray(&mut out, &world, 0.0, 0.0, 1.0, 0.0, Some(1.0), None);
        assert_eq!(out.hit_count, 0);
        query_physics2d_ray(&mut out, &world, 0.0, 0.0, 1.0, 0.0, Some(2.0), None);

        assert_eq!(out.hit_count, 1);
        assert_eq!(out.hits.len(), retained);
    }

    #[test]
    fn refines_broadphase_candidates_against_rotated_shape_geometry() {
        let mut world = world();
        body_with(
            &mut world,
            Physics2DBodyType::Dynamic,
            0.0,
            0.0,
            Some(std::f32::consts::FRAC_PI_4),
            &[aabb(-2.0, -0.25, 2.0, 0.25)],
        );
        let mut out = create_physics2d_ray_result();

        query_physics2d_ray(&mut out, &world, -1.5, 1.4, 0.2, 0.0, Some(1.0), None);

        assert_eq!(out.hit_count, 0);
    }

    #[test]
    fn returns_exact_intersections_nearest_first_rather_than_body_insertion_order() {
        let mut world = world();
        let far = body_with(
            &mut world,
            Physics2DBodyType::Dynamic,
            5.0,
            0.0,
            None,
            &[circle(0.0, 0.0, 1.0)],
        );
        let near = body_with(
            &mut world,
            Physics2DBodyType::Dynamic,
            2.0,
            0.0,
            None,
            &[aabb(-0.5, -1.0, 0.5, 1.0)],
        );
        let mut out = create_physics2d_ray_result();

        query_physics2d_ray(&mut out, &world, 0.0, 0.0, 1.0, 0.0, None, None);

        assert_eq!(out.hit_count, 2);
        let bodies: Vec<Ref<RigidBody2D>> = out.hits[..out.hit_count]
            .iter()
            .map(|hit| hit.body.clone())
            .collect();
        assert!(same_bodies(&bodies, &[&near, &far]));
        let hit = &out.hits[0];
        assert_eq!(hit.collider_index, 0);
        assert_eq!(
            [hit.fraction, hit.normal_x, hit.normal_y, hit.x, hit.y],
            [1.5, -1.0, 0.0, 1.5, 0.0]
        );
        assert!((out.hits[1].fraction - 4.0).abs() < 0.005);
    }
}

mod query_physics2d_ray_closest {
    use super::*;

    // The retained record is the single Vec slot the closest query rewrites.
    #[test]
    fn writes_only_the_deterministic_nearest_filtered_hit_and_reuses_its_retained_record() {
        let mut world = world();
        let far = rigid_body2d(Physics2DBodyType::Dynamic, 5.0, 0.0, None);
        write(&far).colliders.push(physics2d_collider(
            &circle(0.0, 0.0, 1.0),
            &STONE,
            Some(false),
            Some(&Physics2DCollisionFilter {
                category_bits: 0x2,
                mask_bits: 0x2,
                group_index: 0,
            }),
        ));
        add_physics2d_body(&mut world, &far);
        let near = body_with(
            &mut world,
            Physics2DBodyType::Dynamic,
            2.0,
            0.0,
            None,
            &[circle(0.0, 0.0, 0.5)],
        );
        let mut out = create_physics2d_ray_result();

        query_physics2d_ray_closest(&mut out, &world, 0.0, 0.0, 1.0, 0.0, None, None);
        assert_eq!(out.hit_count, 1);
        assert!(Arc::ptr_eq(&out.hits[0].body, &near));
        let retained = out.hits.len();

        let mut filter = create_physics2d_query_filter();
        filter.category_bits = 0x2;
        filter.mask_bits = 0x2;
        query_physics2d_ray_closest(
            &mut out,
            &world,
            0.0,
            0.0,
            1.0,
            0.0,
            Some(f32::INFINITY),
            Some(&filter),
        );
        assert_eq!(out.hit_count, 1);
        assert_eq!(out.hits.len(), retained);
        assert!(Arc::ptr_eq(&out.hits[0].body, &far));
    }
}

mod query_physics2d_region {
    use super::*;

    #[test]
    fn applies_the_same_reusable_filter_and_rejects_invalid_regions() {
        let mut world = world();
        let body = body_with(
            &mut world,
            Physics2DBodyType::Kinematic,
            0.0,
            0.0,
            None,
            &[circle(0.0, 0.0, 1.0)],
        );
        let mut filter = create_physics2d_query_filter();
        filter.include_kinematic = false;
        let mut out = create_physics2d_query_result();

        query_physics2d_region(
            &mut out,
            &world,
            &region(-1.0, -1.0, 1.0, 1.0),
            Some(&filter),
        );
        assert_eq!(out.hit_count, 0);
        filter.include_kinematic = true;
        query_physics2d_region(
            &mut out,
            &world,
            &region(1.0, 1.0, -1.0, -1.0),
            Some(&filter),
        );
        assert_eq!(out.hit_count, 0);
        query_physics2d_region(
            &mut out,
            &world,
            &region(-1.0, -1.0, 1.0, 1.0),
            Some(&filter),
        );
        assert!(same_bodies(&live_bodies(&out), &[&body]));
    }

    // The retained record is the Vec slot (see query_physics2d_point).
    #[test]
    fn clears_live_hits_for_an_empty_region_while_retaining_high_water_storage() {
        let mut world = world();
        let body = body_with(
            &mut world,
            Physics2DBodyType::Dynamic,
            0.0,
            0.0,
            None,
            &[circle(0.0, 0.0, 1.0)],
        );
        let mut out = create_physics2d_query_result();
        query_physics2d_region(&mut out, &world, &region(-1.0, -1.0, 1.0, 1.0), None);

        query_physics2d_region(&mut out, &world, &region(10.0, 10.0, 11.0, 11.0), None);

        assert_eq!(out.hit_count, 0);
        assert_eq!(out.hits.len(), 1);
        assert!(Arc::ptr_eq(&out.hits[0].body, &body));
    }

    #[test]
    fn refines_aggregate_body_candidates_to_overlapping_collider_bounds() {
        let mut world = world();
        let body = body_with(
            &mut world,
            Physics2DBodyType::Dynamic,
            0.0,
            0.0,
            None,
            &[circle(-5.0, 0.0, 1.0), circle(5.0, 0.0, 1.0)],
        );
        let mut out = create_physics2d_query_result();

        query_physics2d_region(&mut out, &world, &region(-0.5, -0.5, 0.5, 0.5), None);
        assert_eq!(out.hit_count, 0);

        query_physics2d_region(&mut out, &world, &region(4.5, -0.5, 5.5, 0.5), None);
        assert_eq!(out.hit_count, 1);
        assert!(Arc::ptr_eq(&out.hits[0].body, &body));
        assert!(Arc::ptr_eq(
            &out.hits[0].collider,
            &body.read().unwrap().colliders[1]
        ));
        assert_eq!(out.hits[0].collider_index, 1);
    }

    #[test]
    fn uses_current_poses_and_preserves_deterministic_body_collider_order() {
        let mut world = world();
        let first = body_with(
            &mut world,
            Physics2DBodyType::Dynamic,
            -10.0,
            0.0,
            None,
            &[circle(0.0, 0.0, 1.0), circle(0.0, 0.0, 0.5)],
        );
        let second = body_with(
            &mut world,
            Physics2DBodyType::Dynamic,
            0.0,
            0.0,
            None,
            &[circle(0.0, 0.0, 1.0)],
        );
        write(&first).x = 0.0;
        let mut out = create_physics2d_query_result();

        query_physics2d_region(&mut out, &world, &region(-0.25, -0.25, 0.25, 0.25), None);

        assert_eq!(
            live_pairs(&out),
            vec![
                (index_of(&first), 0),
                (index_of(&first), 1),
                (index_of(&second), 0)
            ]
        );
    }
}

mod query_physics2d_shape_cast {
    use super::*;

    #[test]
    fn agrees_with_a_brute_force_march_of_the_discrete_overlap_test() {
        let mut world = world();
        for (x, y) in [(4.0, 0.2), (7.0, -3.0), (9.0, 0.1)] {
            body_with(
                &mut world,
                Physics2DBodyType::Static,
                0.0,
                0.0,
                None,
                &[circle(x, y, 0.6)],
            );
        }
        let mut out = create_physics2d_shape_cast_result();
        query_physics2d_shape_cast(
            &mut out,
            &world,
            &registry(),
            &circle(0.0, 0.0, 0.3),
            12.0,
            0.0,
            None,
            None,
        );

        const SAMPLES: usize = 20000;
        let mut marched_fraction: f32 = -1.0;
        let mut sample = 0;
        while sample <= SAMPLES && marched_fraction < 0.0 {
            let fraction = sample as f32 / SAMPLES as f32;
            let probe_x = 12.0 * fraction;
            let mut found = create_physics2d_query_result();
            query_physics2d_region(
                &mut found,
                &world,
                &region(probe_x - 0.3, -0.3, probe_x + 0.3, 0.3),
                None,
            );
            for at in 0..found.hit_count {
                let collider = found.hits[at].collider.read().unwrap();
                let CollisionShape2D::Circle(shape) = &collider.world else {
                    continue;
                };
                let dx = shape.x - probe_x as f64;
                let dy = shape.y;
                if dx * dx + dy * dy <= (shape.radius + 0.3) * (shape.radius + 0.3) {
                    marched_fraction = fraction;
                }
            }
            sample += 1;
        }

        assert!(marched_fraction > 0.0);
        assert!(out.hit);
        assert!((out.fraction - marched_fraction).abs() < 2.0 / SAMPLES as f32);
    }

    #[test]
    fn applies_the_query_filter_to_bodies_and_colliders_alike() {
        let world = walled_world();
        let mut out = create_physics2d_shape_cast_result();
        let mut filter = create_physics2d_query_filter();

        filter.include_static = false;
        query_physics2d_shape_cast(
            &mut out,
            &world,
            &registry(),
            &unit_box(),
            10.0,
            0.0,
            Some(1.0),
            Some(&filter),
        );
        assert!(!out.hit);

        filter.include_static = true;
        filter.mask_bits = 0;
        query_physics2d_shape_cast(
            &mut out,
            &world,
            &registry(),
            &unit_box(),
            10.0,
            0.0,
            Some(1.0),
            Some(&filter),
        );
        assert!(!out.hit);
    }

    #[test]
    fn breaks_a_tie_between_two_equally_distant_colliders_by_body_order_every_time() {
        let mut world = world();
        for y in [-2.0, 2.0] {
            body_with(
                &mut world,
                Physics2DBodyType::Static,
                0.0,
                0.0,
                None,
                &[aabb(5.0, y - 1.0, 6.0, y + 1.0)],
            );
        }
        let tall = aabb(-0.5, -3.0, 0.5, 3.0);
        let mut out = create_physics2d_shape_cast_result();

        query_physics2d_shape_cast(&mut out, &world, &registry(), &tall, 10.0, 0.0, None, None);
        let first = out.body.clone().unwrap();
        for _ in 0..5 {
            query_physics2d_shape_cast(&mut out, &world, &registry(), &tall, 10.0, 0.0, None, None);
            assert!(Arc::ptr_eq(out.body.as_ref().unwrap(), &first));
        }
        assert!(Arc::ptr_eq(&first, &world.bodies[0]));
    }

    #[test]
    fn clears_a_reused_result_rather_than_leaving_the_previous_cast_in_it() {
        let world = walled_world();
        let mut out = create_physics2d_shape_cast_result();
        query_physics2d_shape_cast(
            &mut out,
            &world,
            &registry(),
            &unit_box(),
            10.0,
            0.0,
            None,
            None,
        );
        assert!(out.hit);

        query_physics2d_shape_cast(
            &mut out,
            &world,
            &registry(),
            &unit_box(),
            -10.0,
            0.0,
            None,
            None,
        );
        assert!(!out.hit);
        assert!(out.body.is_none());
        assert!(out.collider.is_none());
        assert_eq!(out.collider_index, -1);
    }

    #[test]
    fn declines_a_non_finite_displacement_or_a_negative_max_fraction_instead_of_searching() {
        let world = walled_world();
        let mut out = create_physics2d_shape_cast_result();

        for (dx, dy) in [(f32::NAN, 0.0), (0.0, f32::INFINITY)] {
            query_physics2d_shape_cast(
                &mut out,
                &world,
                &registry(),
                &unit_box(),
                dx,
                dy,
                None,
                None,
            );
            assert!(!out.hit);
        }
        query_physics2d_shape_cast(
            &mut out,
            &world,
            &registry(),
            &unit_box(),
            10.0,
            0.0,
            Some(-1.0),
            None,
        );
        assert!(!out.hit);
    }

    #[test]
    fn honours_max_fraction_without_changing_what_a_fraction_means() {
        let world = walled_world();
        let mut out = create_physics2d_shape_cast_result();

        query_physics2d_shape_cast(
            &mut out,
            &world,
            &registry(),
            &unit_box(),
            10.0,
            0.0,
            Some(0.4),
            None,
        );
        assert!(!out.hit);

        query_physics2d_shape_cast(
            &mut out,
            &world,
            &registry(),
            &unit_box(),
            10.0,
            0.0,
            Some(0.5),
            None,
        );
        assert!(out.hit);
        // f32: measured 0.450000048 vs 0.45; TS's 9 digits are finer than the f32 ulp at 0.45 (2.98e-8)
        assert!((out.fraction - 0.45).abs() < 6e-8);
    }

    #[test]
    fn reports_a_clean_miss_when_the_sweep_is_too_short_to_reach_anything() {
        let world = walled_world();
        let mut out = create_physics2d_shape_cast_result();

        query_physics2d_shape_cast(
            &mut out,
            &world,
            &registry(),
            &unit_box(),
            3.0,
            0.0,
            None,
            None,
        );

        assert!(out.body.is_none());
        assert!(out.collider.is_none());
        assert_eq!(out.collider_index, -1);
        assert!(!out.hit);
        assert_eq!(
            [out.fraction, out.x, out.y, out.normal_x, out.normal_y],
            [0.0; 5]
        );
    }

    #[test]
    fn reports_a_hit_at_fraction_zero_for_a_shape_that_already_overlaps_where_it_starts() {
        let world = walled_world();
        let mut out = create_physics2d_shape_cast_result();

        query_physics2d_shape_cast(
            &mut out,
            &world,
            &registry(),
            &aabb(5.2, -0.5, 5.8, 0.5),
            10.0,
            0.0,
            None,
            None,
        );

        assert!(out.hit);
        assert_eq!(out.fraction, 0.0);
    }

    #[test]
    fn stops_the_sweep_exactly_where_the_shape_first_touches() {
        let world = walled_world();
        let mut out = create_physics2d_shape_cast_result();

        query_physics2d_shape_cast(
            &mut out,
            &world,
            &registry(),
            &unit_box(),
            10.0,
            0.0,
            None,
            None,
        );

        assert!(out.hit);
        // f32: measured 0.450000048 vs 0.45; TS's 9 digits are finer than the f32 ulp at 0.45 (2.98e-8)
        assert!((out.fraction - 0.45).abs() < 6e-8);
        assert!(Arc::ptr_eq(out.body.as_ref().unwrap(), &world.bodies[0]));
        assert_eq!(out.collider_index, 0);
        assert!((out.normal_x - -1.0).abs() < 5e-10);
        assert!((out.normal_y - 0.0).abs() < 5e-10);
    }

    #[test]
    fn sweeps_backwards_as_readily_as_forwards_so_the_bounds_union_is_not_one_sided() {
        let mut world = world();
        body_with(
            &mut world,
            Physics2DBodyType::Static,
            0.0,
            0.0,
            None,
            &[aabb(-6.0, -10.0, -5.0, 10.0)],
        );
        let mut out = create_physics2d_shape_cast_result();

        query_physics2d_shape_cast(
            &mut out,
            &world,
            &registry(),
            &unit_box(),
            -10.0,
            0.0,
            None,
            None,
        );

        assert!(out.hit);
        // f32: measured 0.450000048 vs 0.45; TS's 9 digits are finer than the f32 ulp at 0.45 (2.98e-8)
        assert!((out.fraction - 0.45).abs() < 6e-8);
        assert!((out.normal_x - 1.0).abs() < 5e-10);
    }
}
