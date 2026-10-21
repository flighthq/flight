use flight_collision::*;
use flight_collision::contract::*;

mod set_collision_test_guard2d {
    use super::*;

    #[test]
    fn installs_and_removes_the_guard_without_panic() {
        // In Rust, the guard is a no-op. This verifies the function exists and is callable.
        set_collision_test_guard2d(None);
        set_collision_test_guard2d(Some(|_a: &CollisionShape2D, _b: &CollisionShape2D| {}));
        set_collision_test_guard2d(None);
    }
}

mod test_collision2d {
    use super::*;

    #[test]
    fn dispatches_a_circle_circle_pair_to_the_same_result_as_the_direct_test() {
        let mut out = create_collision_manifold2d();
        let a = CollisionShape2D::Circle(CollisionCircle2D { x: 0.0, y: 0.0, radius: 1.0 });
        let b = CollisionShape2D::Circle(CollisionCircle2D { x: 1.0, y: 0.0, radius: 1.0 });
        assert!(test_collision2d(&a, &b, &mut out));
        assert!((out.normal_x - (-1.0)).abs() < 1e-5);
        assert!((out.depth - 1.0).abs() < 1e-5);
    }

    #[test]
    fn dispatches_an_aabb_circle_pair_in_either_argument_order_with_a_sign_consistent_normal() {
        let mut forward = create_collision_manifold2d();
        let mut reversed = create_collision_manifold2d();
        let circle = CollisionShape2D::Circle(CollisionCircle2D { x: 15.0, y: 5.0, radius: 7.0 });
        let bbox = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: 0.0,
            min_y: 0.0,
            max_x: 10.0,
            max_y: 10.0,
        });

        // circle vs box: pushes the circle (A) off the box -> +X.
        assert!(test_collision2d(&circle, &bbox, &mut forward));
        assert!((forward.normal_x - 1.0).abs() < 1e-5);
        assert!((forward.depth - 2.0).abs() < 1e-5);

        // box vs circle: pushes the box (A) off the circle -> the opposite direction, -X.
        assert!(test_collision2d(&bbox, &circle, &mut reversed));
        assert!((reversed.normal_x - (-1.0)).abs() < 1e-5);
        assert!((reversed.depth - 2.0).abs() < 1e-5);
    }

    #[test]
    fn dispatches_an_obb_polygon_pair() {
        let mut out = create_collision_manifold2d();
        let obb = CollisionShape2D::Obb(CollisionObb2D {
            x: 0.0,
            y: 0.0,
            half_w: 3.0,
            half_h: 3.0,
            rotation: 0.0,
        });
        let polygon = CollisionShape2D::Polygon(CollisionPolygon2D {
            points: vec![2.0, -1.0, 6.0, -1.0, 6.0, 3.0, 2.0, 3.0],
        });
        assert!(test_collision2d(&obb, &polygon, &mut out));
        assert!((out.normal_x - (-1.0)).abs() < 1e-5);
        assert!((out.depth - 1.0).abs() < 1e-5);
    }

    #[test]
    fn reports_no_overlap_for_disjoint_shapes() {
        let mut out = create_collision_manifold2d();
        let a = CollisionShape2D::Circle(CollisionCircle2D { x: 0.0, y: 0.0, radius: 1.0 });
        let b = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: 10.0,
            min_y: 10.0,
            max_x: 12.0,
            max_y: 12.0,
        });
        assert!(!test_collision2d(&a, &b, &mut out));
        assert!(!out.overlapping);
    }

    #[test]
    fn reports_no_manifold_for_the_area_less_segment_and_point_kinds() {
        let mut out = create_collision_manifold2d();
        let segment = CollisionShape2D::Segment(CollisionSegment2D {
            x0: 0.0,
            y0: 0.0,
            x1: 1.0,
            y1: 1.0,
        });
        let point = CollisionShape2D::Point(CollisionPoint2D { x: 0.0, y: 0.0 });
        let circle = CollisionShape2D::Circle(CollisionCircle2D { x: 0.0, y: 0.0, radius: 1.0 });
        assert!(!test_collision2d(&segment, &circle, &mut out));
        assert!(!test_collision2d(&circle, &point, &mut out));
        assert!(!out.overlapping);
    }

    #[test]
    fn fully_clears_one_reused_manifold_across_hit_miss_unsupported_and_hit_calls() {
        let mut out = create_collision_manifold2d();
        let circle = CollisionShape2D::Circle(CollisionCircle2D { x: 0.0, y: 0.0, radius: 2.0 });

        assert!(test_collision2d(
            &circle,
            &CollisionShape2D::Circle(CollisionCircle2D { x: 1.0, y: 0.0, radius: 2.0 }),
            &mut out,
        ));
        assert_eq!(out.depth, 3.0);
        assert_eq!(out.normal_x, -1.0);
        assert_eq!(out.normal_y, 0.0);
        assert!(out.overlapping);

        assert!(!test_collision2d(
            &circle,
            &CollisionShape2D::Circle(CollisionCircle2D { x: 10.0, y: 0.0, radius: 2.0 }),
            &mut out,
        ));
        assert_eq!(out.depth, 0.0);
        assert_eq!(out.normal_x, 0.0);
        assert_eq!(out.normal_y, 0.0);
        assert!(!out.overlapping);

        assert!(!test_collision2d(
            &CollisionShape2D::Point(CollisionPoint2D { x: 0.0, y: 0.0 }),
            &circle,
            &mut out,
        ));
        assert_eq!(out.depth, 0.0);
        assert_eq!(out.normal_x, 0.0);
        assert_eq!(out.normal_y, 0.0);
        assert!(!out.overlapping);

        assert!(test_collision2d(
            &circle,
            &CollisionShape2D::Aabb(CollisionAabb2D {
                min_x: -1.0,
                min_y: -1.0,
                max_x: 1.0,
                max_y: 1.0,
            }),
            &mut out,
        ));
        assert!(out.overlapping);
        assert!(out.depth > 0.0);
    }
}
