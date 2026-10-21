use flight_collision::*;
use flight_collision::contract::*;

mod collide_contact_manifold2d {
    use super::*;

    #[test]
    fn dispatches_a_box_box_pair_to_the_same_contact_as_the_direct_function() {
        let mut dispatched = create_collision_contact_manifold2d();
        let mut direct = create_collision_contact_manifold2d();
        let boxx = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: 0.0, min_y: -0.1, max_x: 2.0, max_y: 1.9,
        });
        let ground = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: -5.0, min_y: -1.0, max_x: 5.0, max_y: 0.0,
        });

        assert_eq!(collide_contact_manifold2d(&boxx, &ground, &mut dispatched), true);
        if let (CollisionShape2D::Aabb(ba), CollisionShape2D::Aabb(ga)) = (&boxx, &ground) {
            assert_eq!(collide_aabb_aabb_contact_manifold2d(ba, ga, &mut direct), true);
        }
        assert!((dispatched.normal_y - direct.normal_y).abs() < 1e-6,
            "normal_y: {} vs {}", dispatched.normal_y, direct.normal_y);
        assert!((dispatched.depth - direct.depth).abs() < 1e-6,
            "depth: {} vs {}", dispatched.depth, direct.depth);
        assert_eq!(dispatched.point_count, direct.point_count);
        for i in 0..direct.point_count {
            assert!((dispatched.points[i].x - direct.points[i].x).abs() < 1e-6,
                "point[{}].x: {} vs {}", i, dispatched.points[i].x, direct.points[i].x);
            assert!((dispatched.points[i].y - direct.points[i].y).abs() < 1e-6,
                "point[{}].y: {} vs {}", i, dispatched.points[i].y, direct.points[i].y);
        }
    }

    #[test]
    fn dispatches_a_circle_box_pair_given_in_either_kind_order() {
        let mut dispatched = create_collision_contact_manifold2d();
        let mut direct = create_collision_contact_manifold2d();
        let circle = CollisionShape2D::Circle(CollisionCircle2D {
            x: 0.0, y: 0.9, radius: 1.0,
        });
        let ground = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: -5.0, min_y: -1.0, max_x: 5.0, max_y: 0.0,
        });

        assert_eq!(collide_contact_manifold2d(&circle, &ground, &mut dispatched), true);
        if let (CollisionShape2D::Circle(ca), CollisionShape2D::Aabb(ga)) = (&circle, &ground) {
            assert_eq!(collide_circle_aabb_contact_manifold2d(ca, ga, &mut direct), true);
        }
        assert!((dispatched.normal_y - direct.normal_y).abs() < 1e-6,
            "normal_y: {} vs {}", dispatched.normal_y, direct.normal_y);
        assert!((dispatched.points[0].y - direct.points[0].y).abs() < 1e-6,
            "point[0].y: {} vs {}", dispatched.points[0].y, direct.points[0].y);
    }

    #[test]
    fn negates_the_normal_but_keeps_the_world_space_points_when_the_pair_arrives_reversed() {
        let mut forward = create_collision_contact_manifold2d();
        let mut reversed = create_collision_contact_manifold2d();
        let circle = CollisionShape2D::Circle(CollisionCircle2D {
            x: 0.0, y: 0.9, radius: 1.0,
        });
        let ground = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: -5.0, min_y: -1.0, max_x: 5.0, max_y: 0.0,
        });

        assert_eq!(collide_contact_manifold2d(&circle, &ground, &mut forward), true);
        assert_eq!(collide_contact_manifold2d(&ground, &circle, &mut reversed), true);
        assert!((reversed.normal_x - (-forward.normal_x)).abs() < 1e-6,
            "normal_x: {} vs {}", reversed.normal_x, -forward.normal_x);
        assert!((reversed.normal_y - (-forward.normal_y)).abs() < 1e-6,
            "normal_y: {} vs {}", reversed.normal_y, -forward.normal_y);
        assert!((reversed.depth - forward.depth).abs() < 1e-6,
            "depth: {} vs {}", reversed.depth, forward.depth);
        assert!((reversed.points[0].x - forward.points[0].x).abs() < 1e-6,
            "point[0].x: {} vs {}", reversed.points[0].x, forward.points[0].x);
        assert!((reversed.points[0].y - forward.points[0].y).abs() < 1e-6,
            "point[0].y: {} vs {}", reversed.points[0].y, forward.points[0].y);
    }

    #[test]
    fn assigns_identical_feature_ids_to_a_mixed_kind_pair_given_in_either_order() {
        let mut forward = create_collision_contact_manifold2d();
        let mut reversed = create_collision_contact_manifold2d();
        let boxx = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: 0.0, min_y: -0.1, max_x: 2.0, max_y: 1.9,
        });
        let ground = CollisionShape2D::Polygon(CollisionPolygon2D {
            points: vec![-5.0, -1.0, 5.0, -1.0, 5.0, 0.0, -5.0, 0.0],
        });

        assert_eq!(collide_contact_manifold2d(&boxx, &ground, &mut forward), true);
        assert_eq!(collide_contact_manifold2d(&ground, &boxx, &mut reversed), true);
        assert_eq!(reversed.point_count, forward.point_count);
        for i in 0..forward.point_count {
            assert_eq!(reversed.points[i].feature_id, forward.points[i].feature_id,
                "feature_id mismatch at point {}", i);
            assert!((reversed.points[i].x - forward.points[i].x).abs() < 1e-6,
                "point[{}].x: {} vs {}", i, reversed.points[i].x, forward.points[i].x);
            assert!((reversed.points[i].y - forward.points[i].y).abs() < 1e-6,
                "point[{}].y: {} vs {}", i, reversed.points[i].y, forward.points[i].y);
        }
    }

    #[test]
    fn keeps_overlap_normal_and_depth_order_invariant_for_a_same_kind_pair() {
        let mut forward = create_collision_contact_manifold2d();
        let mut reversed = create_collision_contact_manifold2d();
        let boxx = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: 0.0, min_y: -0.1, max_x: 2.0, max_y: 1.9,
        });
        let ground = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: -5.0, min_y: -1.0, max_x: 5.0, max_y: 0.0,
        });

        assert_eq!(collide_contact_manifold2d(&boxx, &ground, &mut forward), true);
        assert_eq!(collide_contact_manifold2d(&ground, &boxx, &mut reversed), true);
        assert!((reversed.normal_x - (-forward.normal_x)).abs() < 1e-6,
            "normal_x: {} vs {}", reversed.normal_x, -forward.normal_x);
        assert!((reversed.normal_y - (-forward.normal_y)).abs() < 1e-6,
            "normal_y: {} vs {}", reversed.normal_y, -forward.normal_y);
        assert!((reversed.depth - forward.depth).abs() < 1e-6,
            "depth: {} vs {}", reversed.depth, forward.depth);
        assert_eq!(reversed.point_count, forward.point_count);
        // Points sit one penetration depth apart and carry different ids
        assert!((reversed.points[0].y - (forward.points[0].y - forward.depth)).abs() < 1e-6,
            "reversed point y: {} vs forward point y - depth: {}",
            reversed.points[0].y, forward.points[0].y - forward.depth);
        assert_ne!(reversed.points[0].feature_id, forward.points[0].feature_id);
    }

    #[test]
    fn is_bit_for_bit_repeatable_for_a_fixed_argument_order() {
        let mut first = create_collision_contact_manifold2d();
        let mut second = create_collision_contact_manifold2d();
        let boxx = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: 0.0, min_y: -0.1, max_x: 2.0, max_y: 1.9,
        });
        let ground = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: -5.0, min_y: -1.0, max_x: 5.0, max_y: 0.0,
        });

        assert_eq!(collide_contact_manifold2d(&boxx, &ground, &mut first), true);
        assert_eq!(collide_contact_manifold2d(&boxx, &ground, &mut second), true);
        assert_eq!(second.point_count, first.point_count);
        for i in 0..first.point_count {
            assert_eq!(second.points[i].feature_id, first.points[i].feature_id,
                "feature_id mismatch at point {}", i);
            assert_eq!(second.points[i].x, first.points[i].x,
                "point[{}].x: {} vs {}", i, second.points[i].x, first.points[i].x);
            assert_eq!(second.points[i].y, first.points[i].y,
                "point[{}].y: {} vs {}", i, second.points[i].y, first.points[i].y);
            assert_eq!(second.points[i].depth, first.points[i].depth,
                "point[{}].depth: {} vs {}", i, second.points[i].depth, first.points[i].depth);
        }
    }

    #[test]
    fn reports_area_less_kinds_as_non_overlapping_and_carrying_no_contact() {
        let mut out = create_collision_contact_manifold2d();
        let segment = CollisionShape2D::Segment(CollisionSegment2D {
            x0: 0.0, y0: 0.0, x1: 5.0, y1: 5.0,
        });
        let boxx = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: 0.0, min_y: 0.0, max_x: 10.0, max_y: 10.0,
        });
        assert_eq!(collide_contact_manifold2d(&segment, &boxx, &mut out), false);
        assert_eq!(out.overlapping, false);
        assert_eq!(out.point_count, 0);

        let point = CollisionShape2D::Point(CollisionPoint2D { x: 1.0, y: 1.0 });
        assert_eq!(collide_contact_manifold2d(&point, &boxx, &mut out), false);
        assert_eq!(out.point_count, 0);
    }

    #[test]
    fn clears_a_previously_populated_manifold_when_the_pair_separates() {
        let mut out = create_collision_contact_manifold2d();
        let ground = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: -5.0, min_y: -1.0, max_x: 5.0, max_y: 0.0,
        });
        let overlapping_box = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: 0.0, min_y: -0.1, max_x: 2.0, max_y: 1.9,
        });
        assert_eq!(collide_contact_manifold2d(&overlapping_box, &ground, &mut out), true);
        assert_eq!(out.point_count, 2);

        let separated_box = CollisionShape2D::Aabb(CollisionAabb2D {
            min_x: 0.0, min_y: 9.0, max_x: 2.0, max_y: 11.0,
        });
        assert_eq!(collide_contact_manifold2d(&separated_box, &ground, &mut out), false);
        assert_eq!(out.point_count, 0);
        assert_eq!(out.depth, 0.0);
        assert_eq!(out.overlapping, false);
        assert_eq!(out.normal_x, 0.0);
        assert_eq!(out.normal_y, 0.0);
    }

    #[test]
    fn clears_the_same_manifold_when_the_following_pair_is_a_different_kind_that_misses() {
        let mut out = create_collision_contact_manifold2d();
        let obb_a = CollisionShape2D::Obb(CollisionObb2D {
            half_h: 2.0, half_w: 2.0, rotation: 0.3, x: 0.0, y: 0.0,
        });
        let obb_b = CollisionShape2D::Obb(CollisionObb2D {
            half_h: 2.0, half_w: 2.0, rotation: -0.2, x: 1.0, y: 1.0,
        });
        assert_eq!(collide_contact_manifold2d(&obb_a, &obb_b, &mut out), true);
        assert!(out.point_count > 0);
        assert!(out.normal_x.abs() + out.normal_y.abs() > 0.0);

        let circle_a = CollisionShape2D::Circle(CollisionCircle2D {
            radius: 1.0, x: 0.0, y: 0.0,
        });
        let circle_b = CollisionShape2D::Circle(CollisionCircle2D {
            radius: 1.0, x: 50.0, y: 0.0,
        });
        assert_eq!(collide_contact_manifold2d(&circle_a, &circle_b, &mut out), false);
        assert_eq!(out.depth, 0.0);
        assert_eq!(out.normal_x, 0.0);
        assert_eq!(out.normal_y, 0.0);
        assert_eq!(out.overlapping, false);
        assert_eq!(out.point_count, 0);
    }

    #[test]
    fn leaves_the_point_array_untouched_behind_point_count() {
        let mut out = create_collision_contact_manifold2d();
        let a = CollisionShape2D::Aabb(CollisionAabb2D {
            max_x: 2.0, max_y: 2.0, min_x: 0.0, min_y: 0.0,
        });
        let b = CollisionShape2D::Aabb(CollisionAabb2D {
            max_x: 3.0, max_y: 3.0, min_x: 1.0, min_y: 1.0,
        });
        assert_eq!(collide_contact_manifold2d(&a, &b, &mut out), true);
        let populated: Vec<(f64, f64)> = out.points.iter()
            .map(|p| (p.x, p.y))
            .collect();

        let c = CollisionShape2D::Aabb(CollisionAabb2D {
            max_x: 1.0, max_y: 1.0, min_x: 0.0, min_y: 0.0,
        });
        let d = CollisionShape2D::Aabb(CollisionAabb2D {
            max_x: 41.0, max_y: 41.0, min_x: 40.0, min_y: 40.0,
        });
        assert_eq!(collide_contact_manifold2d(&c, &d, &mut out), false);

        assert_eq!(out.point_count, 0);
        let after: Vec<(f64, f64)> = out.points.iter()
            .map(|p| (p.x, p.y))
            .collect();
        assert_eq!(after, populated);
    }
}