use std::f32::consts::PI;

use flight_collision::*;
use flight_entity::Ref;
use flight_physics2d::contract::*;
use flight_spatial::SpatialAabb2D;

const STONE: Physics2DMaterial = Physics2DMaterial {
    density: 1.0,
    friction: 0.3,
    restitution: 0.0,
};

fn bounds() -> SpatialAabb2D {
    return SpatialAabb2D {
        min_x: 0.0,
        min_y: 0.0,
        max_x: 0.0,
        max_y: 0.0,
    };
}

// vitest `toBeCloseTo(expected, digits)`: |actual - expected| < 10^-digits / 2.
fn close(actual: f32, expected: f32, digits: i32) -> bool {
    return (actual - expected).abs() < 10f32.powi(-digits) / 2.0;
}

fn collider(local: CollisionShape2D) -> Ref<Physics2DCollider> {
    return create_physics2d_collider(&local, &STONE, None, None);
}

fn update(collider: &Ref<Physics2DCollider>, body: &Ref<RigidBody2D>) {
    update_physics2d_collider_world_shape(&mut collider.write().unwrap(), &body.read().unwrap());
}

fn write_bounds(out: &mut SpatialAabb2D, collider: &Ref<Physics2DCollider>) {
    write_physics2d_collider_bounds(out, &collider.read().unwrap());
}

mod create_physics2d_collider_world_shape {
    use super::*;

    #[test]
    fn gives_a_polygon_its_own_points_array_so_the_per_step_transform_cannot_write_through_to_the_local_shape()
     {
        let local = CollisionShape2D::Polygon(CollisionPolygon2D {
            points: vec![0.0, 0.0, 1.0, 0.0, 0.0, 1.0],
        });
        let world = create_physics2d_collider_world_shape(&local);
        let (CollisionShape2D::Polygon(local), CollisionShape2D::Polygon(world)) = (&local, &world)
        else {
            panic!("expected polygons");
        };
        assert!(!std::ptr::eq(world.points.as_ptr(), local.points.as_ptr()));
        assert_eq!(world.points, local.points);
        // TS also checks `EntityRuntimeKey in world`: Rust world shapes are plain collision shapes (D12),
        // which carry no entity runtime, so that half is not representable.
    }

    #[test]
    fn keeps_the_kind_for_shapes_a_rigid_transform_preserves() {
        let circle = CollisionShape2D::Circle(CollisionCircle2D {
            x: 0.0,
            y: 0.0,
            radius: 1.0,
        });
        assert!(matches!(
            create_physics2d_collider_world_shape(&circle),
            CollisionShape2D::Circle(_)
        ));
        let polygon = CollisionShape2D::Polygon(CollisionPolygon2D {
            points: vec![0.0, 0.0, 1.0, 0.0, 0.0, 1.0],
        });
        assert!(matches!(
            create_physics2d_collider_world_shape(&polygon),
            CollisionShape2D::Polygon(_)
        ));
        let segment = CollisionShape2D::Segment(CollisionSegment2D {
            x0: 0.0,
            y0: 0.0,
            x1: 1.0,
            y1: 0.0,
        });
        assert!(matches!(
            create_physics2d_collider_world_shape(&segment),
            CollisionShape2D::Segment(_)
        ));
        let point = CollisionShape2D::Point(CollisionPoint2D { x: 0.0, y: 0.0 });
        assert!(matches!(
            create_physics2d_collider_world_shape(&point),
            CollisionShape2D::Point(_)
        ));
    }

    #[test]
    fn promotes_an_axis_aligned_box_to_an_oriented_box_since_a_rotated_box_is_not_axis_aligned() {
        let aabb = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: 0.0,
            min_y: 0.0,
            max_x: 1.0,
            max_y: 1.0,
        });
        assert!(matches!(
            create_physics2d_collider_world_shape(&aabb),
            CollisionShape2D::Obb(_)
        ));
    }
}

mod initialize_collision_capsule2d {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_collision_capsule2d() {
        let make: fn() -> CollisionCapsule2D = CollisionCapsule2D::default;
        let mut out = make();
        initialize_collision_capsule2d(&mut out, 0.5, 1.0, 2.0, 3.0, 4.0);
        assert_eq!(
            (out.radius, out.x0, out.x1, out.y0, out.y1),
            (0.5, 1.0, 2.0, 3.0, 4.0)
        );
    }
}

mod initialize_collision_circle2d {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_collision_circle2d() {
        let make: fn() -> CollisionCircle2D = CollisionCircle2D::default;
        let mut out = make();
        initialize_collision_circle2d(&mut out, 0.5, 1.0, 2.0);
        assert_eq!((out.radius, out.x, out.y), (0.5, 1.0, 2.0));
    }
}

mod initialize_collision_obb2d {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_collision_obb2d() {
        let make: fn() -> CollisionObb2D = CollisionObb2D::default;
        let mut out = make();
        initialize_collision_obb2d(&mut out, 0.5, 1.0, 0.25, 2.0, 3.0);
        assert_eq!(
            (out.half_h, out.half_w, out.rotation, out.x, out.y),
            (0.5, 1.0, 0.25, 2.0, 3.0)
        );
    }
}

mod initialize_collision_point2d {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_collision_point2d() {
        let make: fn() -> CollisionPoint2D = CollisionPoint2D::default;
        let mut out = make();
        initialize_collision_point2d(&mut out, 1.0, 2.0);
        assert_eq!((out.x, out.y), (1.0, 2.0));
    }
}

mod initialize_collision_polygon2d {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_collision_polygon2d() {
        let make: fn() -> CollisionPolygon2D = CollisionPolygon2D::default;
        let mut out = make();
        initialize_collision_polygon2d(&mut out, vec![0.0, 0.0, 1.0, 0.0, 0.0, 1.0]);
        assert_eq!(out.points, vec![0.0, 0.0, 1.0, 0.0, 0.0, 1.0]);
    }
}

mod initialize_collision_segment2d {
    use super::*;

    #[test]
    fn is_the_construction_initializer_of_create_collision_segment2d() {
        let make: fn() -> CollisionSegment2D = CollisionSegment2D::default;
        let mut out = make();
        initialize_collision_segment2d(&mut out, 1.0, 2.0, 3.0, 4.0);
        assert_eq!((out.x0, out.x1, out.y0, out.y1), (1.0, 2.0, 3.0, 4.0));
    }
}

mod update_physics2d_collider_world_shape {
    use super::*;

    #[test]
    fn carries_a_capsule_by_its_endpoints_and_leaves_its_radius_alone() {
        // Unlike an axis-aligned box, a capsule does not promote to another kind under rotation: a
        // rotation cannot change a distance, so the radius is invariant and the two endpoints carry the
        // whole pose.
        let collider = collider(CollisionShape2D::Capsule(CollisionCapsule2D {
            x0: 1.0,
            y0: 0.0,
            x1: 3.0,
            y1: 0.0,
            radius: 0.5,
        }));
        let body = create_rigid_body2d(Physics2DBodyType::Dynamic, 10.0, -4.0, None);
        body.write().unwrap().angle = PI / 2.0;
        update(&collider, &body);

        let guard = collider.read().unwrap();
        let CollisionShape2D::Capsule(world) = &guard.world else {
            panic!("expected a capsule");
        };
        assert!(close(world.x0, 10.0, 9));
        assert!(close(world.y0, -3.0, 9));
        assert!(close(world.x1, 10.0, 9));
        assert!(close(world.y1, -1.0, 9));
        assert_eq!(world.radius, 0.5);
    }

    #[test]
    fn carries_the_body_angle_onto_the_promoted_oriented_box_rather_than_growing_its_extents() {
        let collider = collider(CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: -1.0,
            min_y: -0.5,
            max_x: 1.0,
            max_y: 0.5,
        }));
        let body = create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, Some(0.7));
        update(&collider, &body);
        let guard = collider.read().unwrap();
        let CollisionShape2D::Obb(world) = &guard.world else {
            panic!("expected an obb");
        };
        assert!(close(world.rotation, 0.7, 2));
        assert!(close(world.half_w, 1.0, 2));
        assert!(close(world.half_h, 0.5, 2));
    }

    #[test]
    fn composes_the_body_angle_with_an_oriented_box_collider_own_rotation() {
        let collider = collider(CollisionShape2D::Obb(CollisionObb2D {
            x: 0.0,
            y: 0.0,
            half_w: 1.0,
            half_h: 1.0,
            rotation: 0.2,
        }));
        let body = create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, Some(0.5));
        update(&collider, &body);
        let guard = collider.read().unwrap();
        if let CollisionShape2D::Obb(world) = &guard.world {
            assert!(close(world.rotation, 0.7, 2));
        }
    }

    #[test]
    fn rotates_and_translates_a_circle_offset_from_the_body_origin() {
        let collider = collider(CollisionShape2D::Circle(CollisionCircle2D {
            x: 1.0,
            y: 0.0,
            radius: 0.5,
        }));
        let body = create_rigid_body2d(Physics2DBodyType::Dynamic, 10.0, 5.0, Some(PI / 2.0));
        update(&collider, &body);
        let guard = collider.read().unwrap();
        let CollisionShape2D::Circle(world) = &guard.world else {
            panic!("expected a circle");
        };
        assert!(close(world.x as f32, 10.0, 2));
        assert!(close(world.y as f32, 6.0, 2));
        assert_eq!(world.radius, 0.5);
    }

    #[test]
    fn rotates_and_translates_points() {
        let collider = collider(CollisionShape2D::Point(CollisionPoint2D { x: 2.0, y: 0.0 }));
        update(
            &collider,
            &create_rigid_body2d(Physics2DBodyType::Dynamic, 3.0, 4.0, Some(PI / 2.0)),
        );
        let guard = collider.read().unwrap();
        let CollisionShape2D::Point(world) = &guard.world else {
            panic!("expected a point");
        };
        assert!(close(world.x, 3.0, 2));
        assert!(close(world.y, 6.0, 2));
    }

    #[test]
    fn rotates_and_translates_segment_endpoints() {
        let collider = collider(CollisionShape2D::Segment(CollisionSegment2D {
            x0: 0.0,
            y0: 0.0,
            x1: 2.0,
            y1: 0.0,
        }));
        update(
            &collider,
            &create_rigid_body2d(Physics2DBodyType::Dynamic, 3.0, 4.0, Some(PI / 2.0)),
        );
        let guard = collider.read().unwrap();
        let CollisionShape2D::Segment(world) = &guard.world else {
            panic!("expected a segment");
        };
        assert!(close(world.x0, 3.0, 2));
        assert!(close(world.y0, 4.0, 2));
        assert!(close(world.x1, 3.0, 2));
        assert!(close(world.y1, 6.0, 2));
    }

    #[test]
    fn transforms_every_polygon_vertex_in_place() {
        let collider = collider(CollisionShape2D::Polygon(CollisionPolygon2D {
            points: vec![0.0, 0.0, 1.0, 0.0, 0.0, 1.0],
        }));
        let body = create_rigid_body2d(Physics2DBodyType::Dynamic, 3.0, 4.0, Some(0.0));
        update(&collider, &body);
        let guard = collider.read().unwrap();
        if let CollisionShape2D::Polygon(world) = &guard.world {
            assert_eq!(world.points, vec![3.0, 4.0, 4.0, 4.0, 3.0, 5.0]);
        }
    }
}

mod write_physics2d_collider_bounds {
    use super::*;

    #[test]
    fn bounds_a_circle_by_its_radius() {
        let collider = collider(CollisionShape2D::Circle(CollisionCircle2D {
            x: 0.0,
            y: 0.0,
            radius: 2.0,
        }));
        update(
            &collider,
            &create_rigid_body2d(Physics2DBodyType::Dynamic, 1.0, 1.0, None),
        );
        let mut out = bounds();
        write_bounds(&mut out, &collider);
        assert_eq!(
            out,
            SpatialAabb2D {
                min_x: -1.0,
                min_y: -1.0,
                max_x: 3.0,
                max_y: 3.0
            }
        );
    }

    #[test]
    fn bounds_a_polygon_by_its_extreme_vertices() {
        let collider = collider(CollisionShape2D::Polygon(CollisionPolygon2D {
            points: vec![0.0, 0.0, 4.0, 1.0, 2.0, 5.0],
        }));
        update(
            &collider,
            &create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, None),
        );
        let mut out = bounds();
        write_bounds(&mut out, &collider);
        assert_eq!(
            out,
            SpatialAabb2D {
                min_x: 0.0,
                min_y: 0.0,
                max_x: 4.0,
                max_y: 5.0
            }
        );
    }

    #[test]
    fn bounds_a_segment_by_its_transformed_endpoints() {
        let collider = collider(CollisionShape2D::Segment(CollisionSegment2D {
            x0: -2.0,
            y0: 3.0,
            x1: 4.0,
            y1: -1.0,
        }));
        let mut out = bounds();
        write_bounds(&mut out, &collider);
        assert_eq!(
            out,
            SpatialAabb2D {
                min_x: -2.0,
                min_y: -1.0,
                max_x: 4.0,
                max_y: 3.0
            }
        );
    }

    #[test]
    fn gives_a_point_its_exact_zero_area_bounds() {
        let collider = collider(CollisionShape2D::Point(CollisionPoint2D { x: 1.0, y: 2.0 }));
        let mut out = bounds();
        write_bounds(&mut out, &collider);
        assert_eq!(
            out,
            SpatialAabb2D {
                min_x: 1.0,
                min_y: 2.0,
                max_x: 1.0,
                max_y: 2.0
            }
        );
    }

    #[test]
    fn grows_a_capsule_bound_by_its_radius_on_every_side() {
        let collider = collider(CollisionShape2D::Capsule(CollisionCapsule2D {
            x0: -2.0,
            y0: 1.0,
            x1: 4.0,
            y1: -3.0,
            radius: 0.5,
        }));
        update(
            &collider,
            &create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, None),
        );
        let mut out = bounds();
        write_bounds(&mut out, &collider);
        assert_eq!(
            out,
            SpatialAabb2D {
                min_x: -2.5,
                min_y: -3.5,
                max_x: 4.5,
                max_y: 1.5
            }
        );
    }

    #[test]
    fn grows_an_oriented_box_bound_as_it_turns_and_returns_to_its_extents_at_a_quarter_turn() {
        // The bound of a rotated box is larger than the box; at 45 degrees it is largest, and at 90 it
        // is the original extents with width and height exchanged. Pinned because a bound that did not
        // grow would let the broadphase miss a genuine overlap.
        let collider = collider(CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: -1.0,
            min_y: -0.5,
            max_x: 1.0,
            max_y: 0.5,
        }));
        let mut out = bounds();

        update(
            &collider,
            &create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, Some(PI / 4.0)),
        );
        write_bounds(&mut out, &collider);
        assert!(out.max_x > 1.0);

        update(
            &collider,
            &create_rigid_body2d(Physics2DBodyType::Dynamic, 0.0, 0.0, Some(PI / 2.0)),
        );
        write_bounds(&mut out, &collider);
        assert!(close(out.max_x, 0.5, 2));
        assert!(close(out.max_y, 1.0, 2));
    }
}
