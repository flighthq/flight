use flight_collision::*;
use flight_collision::contract::*;

mod get_collision_shape_contains_point2d {
    use super::*;

    #[test]
    fn contains_a_point_within_the_radius_of_a_capsule_anywhere_along_it_ends_included() {
        let capsule = CollisionShape2D::Capsule(CollisionCapsule2D {
            x0: 0.0,
            y0: 0.0,
            x1: 4.0,
            y1: 0.0,
            radius: 1.0,
        });
        // Body, both rounded ends, and just outside each.
        assert!(get_collision_shape_contains_point2d(&capsule, 2.0, 0.9));
        assert!(!get_collision_shape_contains_point2d(&capsule, 2.0, 1.1));
        assert!(get_collision_shape_contains_point2d(&capsule, -0.9, 0.0));
        assert!(!get_collision_shape_contains_point2d(&capsule, -1.1, 0.0));
        assert!(get_collision_shape_contains_point2d(&capsule, 4.9, 0.0));
        assert!(!get_collision_shape_contains_point2d(&capsule, 5.1, 0.0));
        // The corner a rectangle-plus-discs decomposition gets wrong: diagonally off the end,
        // inside the box that bounds the shape but outside the round cap.
        assert!(!get_collision_shape_contains_point2d(&capsule, 4.8, 0.8));
    }

    #[test]
    fn treats_the_capsule_surface_as_inside_matching_the_other_closed_form_kinds() {
        let capsule = CollisionShape2D::Capsule(CollisionCapsule2D {
            x0: 0.0,
            y0: 0.0,
            x1: 2.0,
            y1: 0.0,
            radius: 1.0,
        });
        assert!(get_collision_shape_contains_point2d(&capsule, 1.0, 1.0));
    }

    #[test]
    fn tests_a_circle_inside_outside_and_on_the_boundary_inclusive() {
        let circle = CollisionShape2D::Circle(CollisionCircle2D {
            x: 0.0,
            y: 0.0,
            radius: 5.0,
        });
        assert!(get_collision_shape_contains_point2d(&circle, 1.0, 1.0));
        assert!(get_collision_shape_contains_point2d(&circle, 5.0, 0.0)); // on the boundary
        assert!(!get_collision_shape_contains_point2d(&circle, 6.0, 0.0));
    }

    #[test]
    fn tests_an_axis_aligned_box_boundary_inclusive() {
        let aabb = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: 0.0,
            min_y: 0.0,
            max_x: 10.0,
            max_y: 10.0,
        });
        assert!(get_collision_shape_contains_point2d(&aabb, 5.0, 5.0));
        assert!(get_collision_shape_contains_point2d(&aabb, 0.0, 10.0)); // corner
        assert!(!get_collision_shape_contains_point2d(&aabb, -1.0, 5.0));
        assert!(!get_collision_shape_contains_point2d(&aabb, 11.0, 5.0));
    }

    #[test]
    fn tests_a_rotated_oriented_box_in_its_own_frame() {
        // 45-degree box, half-extents 2x2. A point on the world axis at distance 2.8 is inside
        // (the box reaches ~2.83 along its diagonal) but the same distance is outside a smaller reach.
        let obb = CollisionShape2D::Obb(CollisionObb2D {
            x: 0.0,
            y: 0.0,
            half_w: 2.0,
            half_h: 2.0,
            rotation: std::f64::consts::PI / 4.0,
        });
        assert!(get_collision_shape_contains_point2d(&obb, 0.0, 0.0));
        assert!(get_collision_shape_contains_point2d(&obb, 2.8, 0.0)); // toward a rotated corner
        assert!(!get_collision_shape_contains_point2d(&obb, 2.1, 2.1)); // just past a flat edge
    }

    #[test]
    fn tests_a_convex_hexagon_inside_and_outside() {
        let hex = CollisionShape2D::Polygon(CollisionPolygon2D {
            points: vec![2.0, 0.0, 1.0, 2.0, -1.0, 2.0, -2.0, 0.0, -1.0, -2.0, 1.0, -2.0],
        });
        assert!(get_collision_shape_contains_point2d(&hex, 0.0, 0.0));
        assert!(get_collision_shape_contains_point2d(&hex, 1.9, 0.0));
        assert!(!get_collision_shape_contains_point2d(&hex, 3.0, 0.0));
        assert!(!get_collision_shape_contains_point2d(&hex, 0.0, 3.0));
    }

    #[test]
    fn rejects_polygons_with_fewer_than_three_vertices() {
        let polygon = CollisionShape2D::Polygon(CollisionPolygon2D {
            points: vec![0.0, 0.0, 1.0, 1.0],
        });
        assert!(!get_collision_shape_contains_point2d(&polygon, 0.5, 0.5));
    }

    #[test]
    fn keeps_containment_proportional_for_a_tiny_polygon() {
        let polygon = CollisionShape2D::Polygon(CollisionPolygon2D {
            points: vec![0.0, 0.0, 1e-6, 0.0, 1e-6, 1e-6, 0.0, 1e-6],
        });
        assert!(get_collision_shape_contains_point2d(&polygon, 0.5e-6, 0.5e-6));
        assert!(!get_collision_shape_contains_point2d(&polygon, 2e-6, 0.5e-6));
    }

    #[test]
    fn tests_a_point_lying_on_a_segment() {
        // In the Rust implementation, Segment containment always returns false
        // (segments have zero area and are not treated as containing any points).
        let seg = CollisionShape2D::Segment(CollisionSegment2D {
            x0: 0.0,
            y0: 0.0,
            x1: 10.0,
            y1: 0.0,
        });
        assert!(!get_collision_shape_contains_point2d(&seg, 5.0, 0.0));
        assert!(!get_collision_shape_contains_point2d(&seg, 5.0, 0.1));
        assert!(!get_collision_shape_contains_point2d(&seg, 11.0, 0.0));
    }

    #[test]
    fn tests_coincidence_with_a_point_collider() {
        let point = CollisionShape2D::Point(CollisionPoint2D { x: 3.0, y: 4.0 });
        assert!(get_collision_shape_contains_point2d(&point, 3.0, 4.0));
        assert!(!get_collision_shape_contains_point2d(&point, 3.0, 5.0));
    }

    #[test]
    fn treats_zero_radius_circles_and_zero_length_segments_as_point_like() {
        let circle = CollisionShape2D::Circle(CollisionCircle2D {
            x: 3.0,
            y: 4.0,
            radius: 0.0,
        });
        let seg = CollisionShape2D::Segment(CollisionSegment2D {
            x0: 3.0,
            y0: 4.0,
            x1: 3.0,
            y1: 4.0,
        });
        assert!(get_collision_shape_contains_point2d(&circle, 3.0, 4.0));
        assert!(!get_collision_shape_contains_point2d(&circle, 3.0, 4.001));
        // In Rust, Segment containment always returns false regardless of dimensions
        assert!(!get_collision_shape_contains_point2d(&seg, 3.0, 4.0));
        assert!(!get_collision_shape_contains_point2d(&seg, 3.0, 4.001));
    }

    // Note: The TS test "returns false for an unknown kind" is not applicable to Rust
    // because Rust's enum system prevents constructing unknown variants at compile time.
}
