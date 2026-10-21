use flight_collision::*;
use flight_collision::contract::*;
use std::sync::Arc;

mod set_collision_test_guard2d {
    use super::*;

    #[test]
    fn installs_invokes_and_removes_the_caller_owned_guard() {
        let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let captured = calls.clone();
        let mut registry = crate::collision_registry2d_with_built_ins();
        set_collision_test_guard2d(&mut registry, Some(Arc::new(move |_a, _b| {
            captured.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        })));
        let circle = CollisionShape2D::Circle(CollisionCircle2D { x: 0.0, y: 0.0, radius: 1.0 });
        let mut out = create_collision_manifold2d();
        test_collision2d(&registry, &circle, &circle, &mut out);
        set_collision_test_guard2d(&mut registry, None);
        test_collision2d(&registry, &circle, &circle, &mut out);
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 1);
    }
}

mod test_collision2d {
    use super::*;

    #[test]
    fn dispatches_the_actual_callback_registered_by_the_caller() {
        let mut registry = crate::collision_registry2d();
        register_collision_pair_test2d(
            &mut registry,
            "circle",
            "point",
            Arc::new(|_, _, out| {
                out.overlapping = true;
                out.normal_x = 0.25;
                out.depth = 7.0;
                true
            }),
        );
        let circle = CollisionShape2D::Circle(CollisionCircle2D {
            x: 0.0,
            y: 0.0,
            radius: 1.0,
        });
        let point = CollisionShape2D::Point(CollisionPoint2D { x: 0.0, y: 0.0 });
        let mut out = create_collision_manifold2d();
        assert!(test_collision2d(&registry, &circle, &point, &mut out));
        assert_eq!(out.normal_x, 0.25);
        assert_eq!(out.depth, 7.0);
    }

    #[test]
    fn returns_false_when_the_caller_registered_nothing() {
        let registry = crate::collision_registry2d();
        let circle = CollisionShape2D::Circle(CollisionCircle2D {
            x: 0.0,
            y: 0.0,
            radius: 1.0,
        });
        let mut out = create_collision_manifold2d();
        assert!(!test_collision2d(&registry, &circle, &circle, &mut out));
    }

    #[test]
    fn dispatches_a_circle_circle_pair_to_the_same_result_as_the_direct_test() {
        let mut out = create_collision_manifold2d();
        let a = CollisionShape2D::Circle(CollisionCircle2D { x: 0.0, y: 0.0, radius: 1.0 });
        let b = CollisionShape2D::Circle(CollisionCircle2D { x: 1.0, y: 0.0, radius: 1.0 });
        assert!(test_collision2d(&crate::collision_registry2d_with_built_ins(), &a, &b, &mut out));
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
        assert!(test_collision2d(&crate::collision_registry2d_with_built_ins(), &circle, &bbox, &mut forward));
        assert!((forward.normal_x - 1.0).abs() < 1e-5);
        assert!((forward.depth - 2.0).abs() < 1e-5);

        // box vs circle: pushes the box (A) off the circle -> the opposite direction, -X.
        assert!(test_collision2d(&crate::collision_registry2d_with_built_ins(), &bbox, &circle, &mut reversed));
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
        assert!(test_collision2d(&crate::collision_registry2d_with_built_ins(), &obb, &polygon, &mut out));
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
        assert!(!test_collision2d(&crate::collision_registry2d_with_built_ins(), &a, &b, &mut out));
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
        assert!(!test_collision2d(&crate::collision_registry2d_with_built_ins(), &segment, &circle, &mut out));
        assert!(!test_collision2d(&crate::collision_registry2d_with_built_ins(), &circle, &point, &mut out));
        assert!(!out.overlapping);
    }

    #[test]
    fn fully_clears_one_reused_manifold_across_hit_miss_unsupported_and_hit_calls() {
        let mut out = create_collision_manifold2d();
        let circle = CollisionShape2D::Circle(CollisionCircle2D { x: 0.0, y: 0.0, radius: 2.0 });

        assert!(test_collision2d(&crate::collision_registry2d_with_built_ins(),
            &circle,
            &CollisionShape2D::Circle(CollisionCircle2D { x: 1.0, y: 0.0, radius: 2.0 }),
            &mut out,
        ));
        assert_eq!(out.depth, 3.0);
        assert_eq!(out.normal_x, -1.0);
        assert_eq!(out.normal_y, 0.0);
        assert!(out.overlapping);

        assert!(!test_collision2d(&crate::collision_registry2d_with_built_ins(),
            &circle,
            &CollisionShape2D::Circle(CollisionCircle2D { x: 10.0, y: 0.0, radius: 2.0 }),
            &mut out,
        ));
        assert_eq!(out.depth, 0.0);
        assert_eq!(out.normal_x, 0.0);
        assert_eq!(out.normal_y, 0.0);
        assert!(!out.overlapping);

        assert!(!test_collision2d(&crate::collision_registry2d_with_built_ins(),
            &CollisionShape2D::Point(CollisionPoint2D { x: 0.0, y: 0.0 }),
            &circle,
            &mut out,
        ));
        assert_eq!(out.depth, 0.0);
        assert_eq!(out.normal_x, 0.0);
        assert_eq!(out.normal_y, 0.0);
        assert!(!out.overlapping);

        assert!(test_collision2d(&crate::collision_registry2d_with_built_ins(),
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
