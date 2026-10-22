use std::sync::{Arc, RwLock};

use super::*;
use crate::common::*;
use flight_collision::{
    CollisionAabb3D, CollisionColliderShape3D, CollisionShape3D, CollisionSphere3D,
};
use flight_spatial::SpatialAabb3D;

fn unit_box() -> CollisionShape3D {
    CollisionShape3D::Aabb(CollisionAabb3D {
        min_x: -0.5,
        min_y: -0.5,
        min_z: -0.5,
        max_x: 0.5,
        max_y: 0.5,
        max_z: 0.5,
    })
}

fn add_box_body(
    world: &mut Physics3DWorld,
    x: f32,
    y: f32,
    z: f32,
    body_type: Physics3DBodyType,
    sensor: bool,
) -> RigidBody3DRef {
    let body = rigid_body(body_type);
    {
        let mut body_write = body.write().unwrap();
        body_write.x = x;
        body_write.y = y;
        body_write.z = z;
    }
    add_physics_3d_body(world, &body);
    let shape = CollisionColliderShape3D::BuiltIn(unit_box());
    let collider = physics_3d_collider(&shape, None, None, Some(sensor));
    add_physics_3d_collider(world, &body, &collider);
    body
}

fn region(min_x: f32, min_y: f32, min_z: f32, max_x: f32, max_y: f32, max_z: f32) -> SpatialAabb3D {
    SpatialAabb3D {
        min_x,
        min_y,
        min_z,
        max_x,
        max_y,
        max_z,
    }
}

fn triangle_mesh_collider() -> Physics3DColliderRef {
    let shape =
        CollisionColliderShape3D::TriangleMesh(Arc::new(RwLock::new(collision_triangle_mesh3d(
            vec![-5.0, 0.0, -5.0, 5.0, 0.0, -5.0, 0.0, 0.0, 5.0],
            vec![0, 1, 2],
        ))));
    physics_3d_collider(&shape, None, None, None)
}

mod create_physics_3d_query_filter {
    use super::*;

    #[test]
    fn admits_everything_by_default_so_a_filter_is_opt_out_rather_than_opt_in() {
        assert_eq!(
            create_physics_3d_query_filter(),
            Physics3DQueryFilter {
                category_bits: u32::MAX,
                mask_bits: u32::MAX,
                include_sensors: true,
                include_dynamic: true,
                include_kinematic: true,
                include_static: true,
            }
        );
    }
}

mod create_physics_3d_query_result {
    use super::*;

    #[test]
    fn starts_empty() {
        let result = create_physics_3d_query_result();
        assert!(result.hits.is_empty());
        assert_eq!(result.hit_count, 0);
    }
}

mod create_physics_3d_ray_result {
    use super::*;

    #[test]
    fn starts_empty() {
        let result = create_physics_3d_ray_result();
        assert!(result.hits.is_empty());
        assert_eq!(result.hit_count, 0);
    }
}

mod create_physics_3d_shape_cast_result {
    use super::*;

    #[test]
    fn starts_as_a_miss_with_no_body() {
        let result = create_physics_3d_shape_cast_result();
        assert!(!result.hit);
        assert!(result.body.is_none());
        assert!(result.collider.is_none());
        assert_eq!(result.collider_index, -1);
    }
}

mod initialize_physics_3d_query_result {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics_3d_query_result() {
        let mut result = create_physics_3d_query_result();
        result.hit_count = 3;
        initialize_physics_3d_query_result(&mut result);
        assert!(result.hits.is_empty());
        assert_eq!(result.hit_count, 0);
    }
}

mod initialize_physics_3d_ray_result {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics_3d_ray_result() {
        let mut result = create_physics_3d_ray_result();
        result.hit_count = 3;
        initialize_physics_3d_ray_result(&mut result);
        assert!(result.hits.is_empty());
        assert_eq!(result.hit_count, 0);
    }
}

mod initialize_physics_3d_shape_cast_result {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_physics_3d_shape_cast_result() {
        let mut result = create_physics_3d_shape_cast_result();
        result.hit = true;
        result.collider_index = 4;
        initialize_physics_3d_shape_cast_result(&mut result);
        assert!(!result.hit);
        assert!(result.body.is_none());
        assert!(result.collider.is_none());
        assert_eq!(result.collider_index, -1);
    }
}

mod query_physics_3d_point {
    use super::*;

    #[test]
    fn finds_the_collider_containing_the_point() {
        let mut world = world();
        let body = add_box_body(&mut world, 0.0, 0.0, 0.0, Physics3DBodyType::Dynamic, false);
        let mut out = create_physics_3d_query_result();
        query_physics_3d_point(&mut out, &mut world, 0.1, 0.1, 0.1, None);
        assert_eq!(out.hit_count, 1);
        assert!(Arc::ptr_eq(&out.hits[0].body, &body));
        assert_eq!(out.hits[0].collider_index, 0);
    }

    #[test]
    fn finds_nothing_at_a_point_in_empty_space() {
        let mut world = world();
        add_box_body(&mut world, 0.0, 0.0, 0.0, Physics3DBodyType::Dynamic, false);
        let mut out = create_physics_3d_query_result();
        query_physics_3d_point(&mut out, &mut world, 5.0, 5.0, 5.0, None);
        assert_eq!(out.hit_count, 0);
    }

    #[test]
    fn separates_on_z_so_a_point_out_of_plane_does_not_hit() {
        let mut world = world();
        add_box_body(&mut world, 0.0, 0.0, 0.0, Physics3DBodyType::Dynamic, false);
        let mut out = create_physics_3d_query_result();
        query_physics_3d_point(&mut out, &mut world, 0.0, 0.0, 5.0, None);
        assert_eq!(out.hit_count, 0);
    }

    #[test]
    fn sees_the_current_pose_without_needing_a_step_first() {
        let mut world = world();
        let body = add_box_body(&mut world, 0.0, 0.0, 0.0, Physics3DBodyType::Dynamic, false);
        let mut out = create_physics_3d_query_result();
        body.write().unwrap().x = 10.0;
        query_physics_3d_point(&mut out, &mut world, 10.0, 0.0, 0.0, None);
        assert_eq!(out.hit_count, 1);
        query_physics_3d_point(&mut out, &mut world, 0.0, 0.0, 0.0, None);
        assert_eq!(out.hit_count, 0);
    }

    #[test]
    fn excludes_a_body_type_the_filter_turned_off() {
        let mut world = world();
        add_box_body(&mut world, 0.0, 0.0, 0.0, Physics3DBodyType::Static, false);
        let mut filter = create_physics_3d_query_filter();
        filter.include_static = false;
        let mut out = create_physics_3d_query_result();
        query_physics_3d_point(&mut out, &mut world, 0.0, 0.0, 0.0, Some(&filter));
        assert_eq!(out.hit_count, 0);
    }

    #[test]
    fn excludes_sensors_when_the_filter_says_so() {
        let mut world = world();
        add_box_body(&mut world, 0.0, 0.0, 0.0, Physics3DBodyType::Dynamic, true);
        let mut filter = create_physics_3d_query_filter();
        filter.include_sensors = false;
        let mut out = create_physics_3d_query_result();
        query_physics_3d_point(&mut out, &mut world, 0.0, 0.0, 0.0, Some(&filter));
        assert_eq!(out.hit_count, 0);
    }

    #[test]
    fn excludes_a_collider_whose_category_the_filter_mask_does_not_select() {
        let mut world = world();
        let body = add_body(&mut world, Physics3DBodyType::Dynamic);
        let shape = CollisionColliderShape3D::BuiltIn(unit_box());
        let collider_filter = Physics3DCollisionFilter {
            category_bits: 2,
            mask_bits: 2,
            group_index: 0,
        };
        let collider = physics_3d_collider(&shape, None, Some(&collider_filter), None);
        add_physics_3d_collider(&mut world, &body, &collider);
        let mut filter = create_physics_3d_query_filter();
        filter.category_bits = 1;
        let mut out = create_physics_3d_query_result();
        query_physics_3d_point(&mut out, &mut world, 0.0, 0.0, 0.0, Some(&filter));
        assert_eq!(out.hit_count, 0);
    }

    #[test]
    fn orders_hits_by_body_index_rather_than_by_broadphase_history() {
        let mut world = world();
        let first = add_box_body(&mut world, 0.0, 0.0, 0.0, Physics3DBodyType::Dynamic, false);
        let second = add_box_body(&mut world, 0.0, 0.0, 0.0, Physics3DBodyType::Dynamic, false);
        let mut out = create_physics_3d_query_result();
        query_physics_3d_point(&mut out, &mut world, 0.0, 0.0, 0.0, None);
        assert_eq!(out.hit_count, 2);
        let first_index = first.read().unwrap().index;
        let second_index = second.read().unwrap().index;
        assert!(out.hits[0].body.read().unwrap().index < out.hits[1].body.read().unwrap().index);
        assert!([first_index, second_index].contains(&out.hits[0].body.read().unwrap().index));
    }

    #[test]
    fn declines_a_non_finite_point_rather_than_reporting_a_hit() {
        let mut world = world();
        add_box_body(&mut world, 0.0, 0.0, 0.0, Physics3DBodyType::Dynamic, false);
        let mut out = create_physics_3d_query_result();
        query_physics_3d_point(&mut out, &mut world, f32::NAN, 0.0, 0.0, None);
        assert_eq!(out.hit_count, 0);
    }

    #[test]
    fn reuses_hit_records_across_calls() {
        let mut world = world();
        add_box_body(&mut world, 0.0, 0.0, 0.0, Physics3DBodyType::Dynamic, false);
        let mut out = create_physics_3d_query_result();
        query_physics_3d_point(&mut out, &mut world, 0.0, 0.0, 0.0, None);
        let record = out.hits.as_ptr();
        query_physics_3d_point(&mut out, &mut world, 5.0, 5.0, 5.0, None);
        assert_eq!(out.hit_count, 0);
        query_physics_3d_point(&mut out, &mut world, 0.0, 0.0, 0.0, None);
        assert_eq!(out.hits.as_ptr(), record);
        assert!(out.hits.len() >= out.hit_count);
    }
}

mod query_physics_3d_ray {
    use super::*;

    #[test]
    fn raycasts_static_triangle_mesh_surfaces() {
        let mut world = world();
        let terrain = add_body(&mut world, Physics3DBodyType::Static);
        let collider = triangle_mesh_collider();
        add_physics_3d_collider(&mut world, &terrain, &collider);
        let mut out = create_physics_3d_ray_result();
        query_physics_3d_ray(
            &mut out, &mut world, 0.0, 2.0, 0.0, 0.0, -1.0, 0.0, None, None,
        );
        assert_eq!(out.hit_count, 1);
        assert!(Arc::ptr_eq(&out.hits[0].body, &terrain));
        assert!((out.hits[0].fraction - 2.0).abs() < 1e-6);
    }

    #[test]
    fn finds_every_collider_along_the_ray_nearest_first() {
        let mut world = world();
        let far = add_box_body(
            &mut world,
            10.0,
            0.0,
            0.0,
            Physics3DBodyType::Dynamic,
            false,
        );
        let near = add_box_body(&mut world, 5.0, 0.0, 0.0, Physics3DBodyType::Dynamic, false);
        let mut out = create_physics_3d_ray_result();
        query_physics_3d_ray(
            &mut out, &mut world, -10.0, 0.0, 0.0, 1.0, 0.0, 0.0, None, None,
        );
        assert_eq!(out.hit_count, 2);
        assert!(Arc::ptr_eq(&out.hits[0].body, &near));
        assert!(Arc::ptr_eq(&out.hits[1].body, &far));
        assert!(out.hits[0].fraction < out.hits[1].fraction);
    }

    #[test]
    fn reports_the_hit_point_on_the_ray_in_the_caller_parameterization() {
        let mut world = world();
        add_box_body(&mut world, 5.0, 0.0, 0.0, Physics3DBodyType::Dynamic, false);
        let mut out = create_physics_3d_ray_result();
        query_physics_3d_ray(
            &mut out, &mut world, -10.0, 0.0, 0.0, 2.0, 0.0, 0.0, None, None,
        );
        let hit = &out.hits[0];
        assert!((hit.x - (-10.0 + 2.0 * hit.fraction)).abs() < 1e-6);
        assert!((hit.normal_x + 1.0).abs() < 1e-6);
    }

    #[test]
    fn bounds_the_ray_with_max_fraction() {
        let mut world = world();
        add_box_body(&mut world, 5.0, 0.0, 0.0, Physics3DBodyType::Dynamic, false);
        let mut out = create_physics_3d_ray_result();
        query_physics_3d_ray(
            &mut out,
            &mut world,
            0.0,
            0.0,
            0.0,
            1.0,
            0.0,
            0.0,
            Some(4.0),
            None,
        );
        assert_eq!(out.hit_count, 0);
        query_physics_3d_ray(
            &mut out,
            &mut world,
            0.0,
            0.0,
            0.0,
            1.0,
            0.0,
            0.0,
            Some(5.0),
            None,
        );
        assert_eq!(out.hit_count, 1);
    }

    #[test]
    fn finds_nothing_when_the_ray_points_away() {
        let mut world = world();
        add_box_body(&mut world, 5.0, 0.0, 0.0, Physics3DBodyType::Dynamic, false);
        let mut out = create_physics_3d_ray_result();
        query_physics_3d_ray(
            &mut out, &mut world, 0.0, 0.0, 0.0, -1.0, 0.0, 0.0, None, None,
        );
        assert_eq!(out.hit_count, 0);
    }

    #[test]
    fn respects_the_filter() {
        let mut world = world();
        add_box_body(&mut world, 5.0, 0.0, 0.0, Physics3DBodyType::Static, false);
        let mut filter = create_physics_3d_query_filter();
        filter.include_static = false;
        let mut out = create_physics_3d_ray_result();
        query_physics_3d_ray(
            &mut out,
            &mut world,
            0.0,
            0.0,
            0.0,
            1.0,
            0.0,
            0.0,
            Some(f32::INFINITY),
            Some(&filter),
        );
        assert_eq!(out.hit_count, 0);
    }

    #[test]
    fn declines_a_non_finite_ray() {
        let mut world = world();
        add_box_body(&mut world, 5.0, 0.0, 0.0, Physics3DBodyType::Dynamic, false);
        let mut out = create_physics_3d_ray_result();
        query_physics_3d_ray(
            &mut out,
            &mut world,
            0.0,
            0.0,
            0.0,
            f32::NAN,
            0.0,
            0.0,
            None,
            None,
        );
        assert_eq!(out.hit_count, 0);
    }

    #[test]
    fn sorts_only_the_live_prefix_leaving_stale_records_unpublished() {
        let mut world = world();
        add_box_body(&mut world, 5.0, 0.0, 0.0, Physics3DBodyType::Dynamic, false);
        add_box_body(
            &mut world,
            10.0,
            0.0,
            0.0,
            Physics3DBodyType::Dynamic,
            false,
        );
        let mut out = create_physics_3d_ray_result();
        query_physics_3d_ray(
            &mut out, &mut world, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, None, None,
        );
        assert_eq!(out.hit_count, 2);
        query_physics_3d_ray(
            &mut out,
            &mut world,
            0.0,
            0.0,
            0.0,
            1.0,
            0.0,
            0.0,
            Some(6.0),
            None,
        );
        assert_eq!(out.hit_count, 1);
        assert!((out.hits[0].fraction - 4.5).abs() < 1e-6);
        assert_eq!(out.hits.len(), 2);
    }
}

mod query_physics_3d_ray_closest {
    use super::*;

    #[test]
    fn writes_only_the_nearest_hit() {
        let mut world = world();
        add_box_body(
            &mut world,
            10.0,
            0.0,
            0.0,
            Physics3DBodyType::Dynamic,
            false,
        );
        let near = add_box_body(&mut world, 5.0, 0.0, 0.0, Physics3DBodyType::Dynamic, false);
        let mut out = create_physics_3d_ray_result();
        query_physics_3d_ray_closest(
            &mut out, &mut world, -10.0, 0.0, 0.0, 1.0, 0.0, 0.0, None, None,
        );
        assert_eq!(out.hit_count, 1);
        assert!(Arc::ptr_eq(&out.hits[0].body, &near));
    }

    #[test]
    fn breaks_an_exact_tie_by_body_index_not_by_traversal_order() {
        let mut world = world();
        let first = add_box_body(&mut world, 5.0, 0.0, 0.0, Physics3DBodyType::Dynamic, false);
        add_box_body(&mut world, 5.0, 0.0, 0.0, Physics3DBodyType::Dynamic, false);
        let mut out = create_physics_3d_ray_result();
        query_physics_3d_ray_closest(
            &mut out, &mut world, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, None, None,
        );
        assert_eq!(out.hit_count, 1);
        assert!(Arc::ptr_eq(&out.hits[0].body, &first));
    }

    #[test]
    fn finds_nothing_when_the_ray_misses_everything() {
        let mut world = world();
        add_box_body(&mut world, 5.0, 0.0, 0.0, Physics3DBodyType::Dynamic, false);
        let mut out = create_physics_3d_ray_result();
        query_physics_3d_ray_closest(
            &mut out, &mut world, 0.0, 50.0, 0.0, 1.0, 0.0, 0.0, None, None,
        );
        assert_eq!(out.hit_count, 0);
    }

    #[test]
    fn preserves_the_ray_origin_z_coordinate() {
        let mut world = world();
        add_box_body(&mut world, 0.0, 0.0, 0.0, Physics3DBodyType::Static, false);
        let mut out = create_physics_3d_ray_result();
        query_physics_3d_ray_closest(
            &mut out, &mut world, -2.0, 0.0, 4.0, 1.0, 0.0, 0.0, None, None,
        );
        assert_eq!(out.hit_count, 0);
    }
}

mod query_physics_3d_region {
    use super::*;

    #[test]
    fn finds_colliders_overlapping_the_region() {
        let mut world = world();
        let inside = add_box_body(&mut world, 0.0, 0.0, 0.0, Physics3DBodyType::Dynamic, false);
        add_box_body(
            &mut world,
            50.0,
            0.0,
            0.0,
            Physics3DBodyType::Dynamic,
            false,
        );
        let mut out = create_physics_3d_query_result();
        query_physics_3d_region(
            &mut out,
            &mut world,
            &region(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0),
            None,
        );
        assert_eq!(out.hit_count, 1);
        assert!(Arc::ptr_eq(&out.hits[0].body, &inside));
    }

    #[test]
    fn refines_a_compound_body_per_collider_not_by_its_aggregate_bounds() {
        let mut world = world();
        let body = add_body(&mut world, Physics3DBodyType::Dynamic);
        for (min_x, max_x) in [(-10.5, -9.5), (9.5, 10.5)] {
            let shape =
                CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(CollisionAabb3D {
                    min_x,
                    min_y: -0.5,
                    min_z: -0.5,
                    max_x,
                    max_y: 0.5,
                    max_z: 0.5,
                }));
            let collider = physics_3d_collider(&shape, None, None, None);
            add_physics_3d_collider(&mut world, &body, &collider);
        }
        let mut out = create_physics_3d_query_result();
        query_physics_3d_region(
            &mut out,
            &mut world,
            &region(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0),
            None,
        );
        assert_eq!(out.hit_count, 0);
    }

    #[test]
    fn finds_both_colliders_of_a_compound_body_when_the_region_covers_both() {
        let mut world = world();
        let body = add_body(&mut world, Physics3DBodyType::Dynamic);
        for (min_x, max_x) in [(-2.5, -1.5), (1.5, 2.5)] {
            let shape =
                CollisionColliderShape3D::BuiltIn(CollisionShape3D::Aabb(CollisionAabb3D {
                    min_x,
                    min_y: -0.5,
                    min_z: -0.5,
                    max_x,
                    max_y: 0.5,
                    max_z: 0.5,
                }));
            let collider = physics_3d_collider(&shape, None, None, None);
            add_physics_3d_collider(&mut world, &body, &collider);
        }
        let mut out = create_physics_3d_query_result();
        query_physics_3d_region(
            &mut out,
            &mut world,
            &region(-5.0, -5.0, -5.0, 5.0, 5.0, 5.0),
            None,
        );
        assert_eq!(out.hit_count, 2);
        assert_eq!(
            out.hits[..2]
                .iter()
                .map(|hit| hit.collider_index)
                .collect::<Vec<_>>(),
            vec![0, 1]
        );
    }

    #[test]
    fn declines_an_inverted_or_non_finite_region() {
        let mut world = world();
        add_box_body(&mut world, 0.0, 0.0, 0.0, Physics3DBodyType::Dynamic, false);
        let mut out = create_physics_3d_query_result();
        query_physics_3d_region(
            &mut out,
            &mut world,
            &region(1.0, -1.0, -1.0, -1.0, 1.0, 1.0),
            None,
        );
        assert_eq!(out.hit_count, 0);
        query_physics_3d_region(
            &mut out,
            &mut world,
            &region(f32::NAN, -1.0, -1.0, 1.0, 1.0, 1.0),
            None,
        );
        assert_eq!(out.hit_count, 0);
    }

    #[test]
    fn respects_the_filter() {
        let mut world = world();
        add_box_body(
            &mut world,
            0.0,
            0.0,
            0.0,
            Physics3DBodyType::Kinematic,
            false,
        );
        let mut filter = create_physics_3d_query_filter();
        filter.include_kinematic = false;
        let mut out = create_physics_3d_query_result();
        let bounds = region(-1.0, -1.0, -1.0, 1.0, 1.0, 1.0);
        query_physics_3d_region(&mut out, &mut world, &bounds, None);
        assert_eq!(out.hit_count, 1);
        query_physics_3d_region(&mut out, &mut world, &bounds, Some(&filter));
        assert_eq!(out.hit_count, 0);
    }
}

mod query_physics_3d_shape_cast {
    use super::*;

    #[test]
    fn casts_convex_shapes_against_static_triangle_mesh_surfaces() {
        let mut world = world();
        let terrain = add_body(&mut world, Physics3DBodyType::Static);
        let collider = triangle_mesh_collider();
        add_physics_3d_collider(&mut world, &terrain, &collider);
        let mut out = create_physics_3d_shape_cast_result();
        let sphere = CollisionShape3D::Sphere(CollisionSphere3D {
            x: 0.0,
            y: 2.0,
            z: 0.0,
            radius: 0.25,
        });
        query_physics_3d_shape_cast(
            &mut out,
            &mut world,
            &registered_registry(),
            &sphere,
            0.0,
            -4.0,
            0.0,
            None,
            None,
        );
        assert!(out.hit);
        assert!(Arc::ptr_eq(out.body.as_ref().unwrap(), &terrain));
        assert!(
            (out.fraction - 0.4375).abs() < 1e-5,
            "expected fraction 0.4375, got {} at ({}, {}, {}) with normal ({}, {}, {})",
            out.fraction,
            out.x,
            out.y,
            out.z,
            out.normal_x,
            out.normal_y,
            out.normal_z
        );
    }

    #[test]
    fn stops_a_swept_shape_at_the_first_collider_and_reports_where() {
        let mut world = world();
        add_box_body(&mut world, 10.0, 0.0, 0.0, Physics3DBodyType::Static, false);
        let mut out = create_physics_3d_shape_cast_result();
        query_physics_3d_shape_cast(
            &mut out,
            &mut world,
            &registered_registry(),
            &unit_box(),
            20.0,
            0.0,
            0.0,
            None,
            None,
        );
        assert!(out.hit);
        assert!((out.fraction - 9.0 / 20.0).abs() < 1e-4);
        assert_eq!(out.body.as_ref().unwrap().read().unwrap().x, 10.0);
    }

    #[test]
    fn reports_a_clean_miss_when_nothing_is_in_the_swept_path() {
        let mut world = world();
        add_box_body(&mut world, 0.0, 50.0, 0.0, Physics3DBodyType::Static, false);
        let mut out = create_physics_3d_shape_cast_result();
        query_physics_3d_shape_cast(
            &mut out,
            &mut world,
            &registered_registry(),
            &unit_box(),
            20.0,
            0.0,
            0.0,
            None,
            None,
        );
        assert!(!out.hit);
        assert!(out.body.is_none());
        assert_eq!(out.fraction, 0.0);
    }

    #[test]
    fn finds_a_collider_the_sweep_reaches_but_the_start_position_does_not_touch() {
        let mut world = world();
        add_box_body(&mut world, 30.0, 0.0, 0.0, Physics3DBodyType::Static, false);
        let mut out = create_physics_3d_shape_cast_result();
        query_physics_3d_shape_cast(
            &mut out,
            &mut world,
            &registered_registry(),
            &unit_box(),
            100.0,
            0.0,
            0.0,
            None,
            None,
        );
        assert!(out.hit);
        assert_eq!(out.body.as_ref().unwrap().read().unwrap().x, 30.0);
    }

    #[test]
    fn reports_the_nearest_of_several_colliders_along_the_sweep() {
        let mut world = world();
        add_box_body(&mut world, 30.0, 0.0, 0.0, Physics3DBodyType::Static, false);
        let near = add_box_body(&mut world, 10.0, 0.0, 0.0, Physics3DBodyType::Static, false);
        add_box_body(&mut world, 20.0, 0.0, 0.0, Physics3DBodyType::Static, false);
        let mut out = create_physics_3d_shape_cast_result();
        query_physics_3d_shape_cast(
            &mut out,
            &mut world,
            &registered_registry(),
            &unit_box(),
            100.0,
            0.0,
            0.0,
            None,
            None,
        );
        assert!(Arc::ptr_eq(out.body.as_ref().unwrap(), &near));
    }

    #[test]
    fn respects_max_fraction_stopping_short_of_a_collider_beyond_it() {
        let mut world = world();
        add_box_body(&mut world, 10.0, 0.0, 0.0, Physics3DBodyType::Static, false);
        let mut out = create_physics_3d_shape_cast_result();
        let registry = registered_registry();
        query_physics_3d_shape_cast(
            &mut out,
            &mut world,
            &registry,
            &unit_box(),
            20.0,
            0.0,
            0.0,
            Some(0.2),
            None,
        );
        assert!(!out.hit);
        query_physics_3d_shape_cast(
            &mut out,
            &mut world,
            &registry,
            &unit_box(),
            20.0,
            0.0,
            0.0,
            Some(0.5),
            None,
        );
        assert!(out.hit);
    }

    #[test]
    fn honours_the_query_filter() {
        let mut world = world();
        add_box_body(&mut world, 10.0, 0.0, 0.0, Physics3DBodyType::Static, false);
        let mut out = create_physics_3d_shape_cast_result();
        let mut filter = create_physics_3d_query_filter();
        filter.include_static = false;
        query_physics_3d_shape_cast(
            &mut out,
            &mut world,
            &registered_registry(),
            &unit_box(),
            20.0,
            0.0,
            0.0,
            Some(1.0),
            Some(&filter),
        );
        assert!(!out.hit);
    }

    #[test]
    fn returns_a_miss_for_a_non_finite_displacement_rather_than_throwing() {
        let mut world = world();
        add_box_body(&mut world, 10.0, 0.0, 0.0, Physics3DBodyType::Static, false);
        let mut out = create_physics_3d_shape_cast_result();
        let registry = registered_registry();
        query_physics_3d_shape_cast(
            &mut out,
            &mut world,
            &registry,
            &unit_box(),
            f32::NAN,
            0.0,
            0.0,
            None,
            None,
        );
        assert!(!out.hit);
        query_physics_3d_shape_cast(
            &mut out,
            &mut world,
            &registry,
            &unit_box(),
            20.0,
            0.0,
            0.0,
            Some(f32::INFINITY),
            None,
        );
        assert!(!out.hit);
    }

    #[test]
    fn finds_a_gap_a_raycast_would_pass_straight_through() {
        let mut world = world();
        add_box_body(
            &mut world,
            10.0,
            -0.9,
            0.0,
            Physics3DBodyType::Static,
            false,
        );
        add_box_body(&mut world, 10.0, 0.9, 0.0, Physics3DBodyType::Static, false);
        let mut ray_out = create_physics_3d_ray_result();
        query_physics_3d_ray(
            &mut ray_out,
            &mut world,
            0.0,
            0.0,
            0.0,
            20.0,
            0.0,
            0.0,
            None,
            None,
        );
        assert_eq!(ray_out.hit_count, 0);
        let mut out = create_physics_3d_shape_cast_result();
        query_physics_3d_shape_cast(
            &mut out,
            &mut world,
            &registered_registry(),
            &unit_box(),
            20.0,
            0.0,
            0.0,
            None,
            None,
        );
        assert!(out.hit);
    }
}
