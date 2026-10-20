use flight_collision::*;

/// A wide, shallow ground slab every resting-contact case sits on.
fn ground() -> CollisionAabb2D {
    CollisionAabb2D { min_x: -5.0, min_y: -1.0, max_x: 5.0, max_y: 0.0 }
}

/// A square collider as a flat convex polygon, corners CCW from the min corner.
fn square(min_x: f64, min_y: f64, size: f64) -> CollisionPolygon2D {
    CollisionPolygon2D {
        points: vec![
            min_x,
            min_y,
            min_x + size,
            min_y,
            min_x + size,
            min_y + size,
            min_x,
            min_y + size,
        ],
    }
}

/// The contact points that are actually valid this call, in order.
fn live_points(manifold: &CollisionContactManifold2D) -> &[CollisionContactPoint2D] {
    &manifold.points[..manifold.point_count]
}

mod collide_aabb_aabb_contact {
    use super::*;

    #[test]
    fn resolves_a_box_resting_on_the_ground_to_two_points_spanning_the_overlap() {
        let mut out = create_collision_contact_manifold2d();
        let bx = CollisionAabb2D { min_x: 0.0, min_y: -0.1, max_x: 2.0, max_y: 1.9 };
        assert!(collide_aabb_aabb_contact(&bx, &ground(), &mut out));
        assert!(out.overlapping);
        assert!((out.normal_x - 0.0).abs() < 1e-6);
        assert!((out.normal_y - (-1.0)).abs() < 1e-6);
        assert!((out.depth - 0.1).abs() < 1e-6);

        assert_eq!(out.point_count, 2);
        let mut xs: Vec<f64> = live_points(&out).iter().map(|p| p.x).collect();
        xs.sort_by(|a, b| a.partial_cmp(b).unwrap());
        assert!((xs[0] - 0.0).abs() < 1e-6);
        assert!((xs[1] - 2.0).abs() < 1e-6);
        for point in live_points(&out) {
            assert!((point.y - 0.0).abs() < 1e-6);
            assert!((point.depth - 0.1).abs() < 1e-6);
        }
    }

    #[test]
    fn gives_the_two_points_distinct_feature_ids_that_survive_the_box_sliding_along_the_ground() {
        let mut first = create_collision_contact_manifold2d();
        let mut second = create_collision_contact_manifold2d();
        assert!(collide_aabb_aabb_contact(
            &CollisionAabb2D { min_x: 0.0, min_y: -0.1, max_x: 2.0, max_y: 1.9 },
            &ground(),
            &mut first,
        ));
        assert!(collide_aabb_aabb_contact(
            &CollisionAabb2D { min_x: 0.3, min_y: -0.12, max_x: 2.3, max_y: 1.88 },
            &ground(),
            &mut second,
        ));

        assert_ne!(first.points[0].feature_id, first.points[1].feature_id);
        assert_eq!(second.points[0].feature_id, first.points[0].feature_id);
        assert_eq!(second.points[1].feature_id, first.points[1].feature_id);
    }

    #[test]
    fn agrees_with_the_lean_overlap_test_on_normal_and_depth() {
        let mut contact = create_collision_contact_manifold2d();
        let mut lean = create_collision_manifold2d();
        let a = CollisionAabb2D { min_x: 0.0, min_y: 0.0, max_x: 10.0, max_y: 10.0 };
        let b = CollisionAabb2D { min_x: 2.0, min_y: 8.0, max_x: 8.0, max_y: 20.0 };
        assert!(collide_aabb_aabb_contact(&a, &b, &mut contact));
        assert!(test_aabb_aabb_collision2d(&a, &b, &mut lean));
        // The convex contact normal points from A toward B (reference face outward), which
        // is the negation of the lean test's convention (from B toward A).
        assert!((contact.normal_x - (-lean.normal_x)).abs() < 1e-6);
        assert!((contact.normal_y - (-lean.normal_y)).abs() < 1e-6);
        assert!((contact.depth - lean.depth).abs() < 1e-6);
    }

    #[test]
    fn negates_the_normal_and_moves_the_points_when_the_arguments_are_reversed() {
        let mut forward = create_collision_contact_manifold2d();
        let mut reversed = create_collision_contact_manifold2d();
        let bx = CollisionAabb2D { min_x: 0.0, min_y: -0.1, max_x: 2.0, max_y: 1.9 };
        assert!(collide_aabb_aabb_contact(&bx, &ground(), &mut forward));
        assert!(collide_aabb_aabb_contact(&ground(), &bx, &mut reversed));

        assert!((reversed.normal_x - (-forward.normal_x)).abs() < 1e-6);
        assert!((reversed.normal_y - (-forward.normal_y)).abs() < 1e-6);
        assert!((reversed.depth - forward.depth).abs() < 1e-6);
        assert_eq!(reversed.point_count, forward.point_count);
        let mut forward_xs: Vec<f64> = live_points(&forward).iter().map(|p| p.x).collect();
        let mut reversed_xs: Vec<f64> = live_points(&reversed).iter().map(|p| p.x).collect();
        forward_xs.sort_by(|a, b| a.partial_cmp(b).unwrap());
        reversed_xs.sort_by(|a, b| a.partial_cmp(b).unwrap());
        assert!((reversed_xs[0] - forward_xs[0]).abs() < 1e-6);
        assert!((reversed_xs[1] - forward_xs[1]).abs() < 1e-6);
        for point in live_points(&forward) {
            assert!((point.y - 0.0).abs() < 1e-6);
        }
        for point in live_points(&reversed) {
            assert!((point.y - (-0.1)).abs() < 1e-6);
        }
    }

    #[test]
    fn clears_the_manifold_on_a_miss_so_no_stale_point_is_left_readable() {
        let mut out = create_collision_contact_manifold2d();
        assert!(collide_aabb_aabb_contact(
            &CollisionAabb2D { min_x: 0.0, min_y: -0.1, max_x: 2.0, max_y: 1.9 },
            &ground(),
            &mut out,
        ));
        assert_eq!(out.point_count, 2);

        assert!(!collide_aabb_aabb_contact(
            &CollisionAabb2D { min_x: 0.0, min_y: 5.0, max_x: 2.0, max_y: 7.0 },
            &ground(),
            &mut out,
        ));
        assert!(!out.overlapping);
        assert_eq!(out.point_count, 0);
        assert_eq!(out.depth, 0.0);
    }

    #[test]
    fn treats_exactly_touching_boxes_as_overlapping_with_zero_depth() {
        // The convex clipping path counts touching (sep == 0) as overlapping,
        // unlike the lean AABB-AABB test which uses a strict inequality.
        let mut out = create_collision_contact_manifold2d();
        assert!(collide_aabb_aabb_contact(
            &CollisionAabb2D { min_x: 0.0, min_y: 0.0, max_x: 2.0, max_y: 2.0 },
            &ground(),
            &mut out,
        ));
        assert!(out.overlapping);
        assert_eq!(out.depth, 0.0);
    }
}

mod collide_aabb_obb_contact {
    use super::*;

    #[test]
    fn resolves_a_flat_lying_oriented_box_under_a_box_to_a_two_point_face_contact() {
        let mut out = create_collision_contact_manifold2d();
        let bx = CollisionAabb2D { min_x: -1.0, min_y: -0.1, max_x: 1.0, max_y: 2.0 };
        let platform = CollisionObb2D { x: 0.0, y: -1.0, half_w: 3.0, half_h: 1.0, rotation: 0.0 };
        assert!(collide_aabb_obb_contact(&bx, &platform, &mut out));
        assert!((out.normal_y - (-1.0)).abs() < 1e-6);
        assert!((out.depth - 0.1).abs() < 1e-6);
        assert_eq!(out.point_count, 2);
        for point in live_points(&out) {
            assert!((point.y - 0.0).abs() < 1e-6);
        }
    }

    #[test]
    fn resolves_a_corner_first_oriented_box_to_a_single_deepest_point() {
        let mut out = create_collision_contact_manifold2d();
        let half = std::f64::consts::FRAC_1_SQRT_2;
        let diamond = CollisionObb2D {
            x: 0.0,
            y: 1.0 + half - 0.05,
            half_w: 0.5,
            half_h: 0.5,
            rotation: std::f64::consts::FRAC_PI_4,
        };
        let bx = CollisionAabb2D { min_x: -3.0, min_y: -1.0, max_x: 3.0, max_y: 1.0 };
        assert!(collide_aabb_obb_contact(&bx, &diamond, &mut out));
        assert_eq!(out.point_count, 1);
        assert!((out.points[0].x - 0.0).abs() < 1e-6);
        assert!((out.points[0].y - (1.0 - 0.05)).abs() < 1e-6);
        assert!((out.points[0].depth - 0.05).abs() < 1e-6);
    }

    #[test]
    fn is_separated_when_the_boxes_are_disjoint() {
        let mut out = create_collision_contact_manifold2d();
        assert!(!collide_aabb_obb_contact(
            &CollisionAabb2D { min_x: 0.0, min_y: 0.0, max_x: 1.0, max_y: 1.0 },
            &CollisionObb2D { x: 9.0, y: 9.0, half_w: 1.0, half_h: 1.0, rotation: 0.3 },
            &mut out,
        ));
        assert_eq!(out.point_count, 0);
    }
}

mod collide_aabb_polygon_contact {
    use super::*;

    #[test]
    fn matches_the_all_polygon_result_for_the_same_geometry() {
        let mut via_aabb = create_collision_contact_manifold2d();
        let mut via_polygon = create_collision_contact_manifold2d();
        let bx = CollisionAabb2D { min_x: 0.0, min_y: -0.1, max_x: 2.0, max_y: 1.9 };
        let slab = CollisionPolygon2D {
            points: vec![-5.0, -1.0, 5.0, -1.0, 5.0, 0.0, -5.0, 0.0],
        };
        assert!(collide_aabb_polygon_contact(&bx, &slab, &mut via_aabb));
        assert!(collide_polygon_polygon_contact(
            &square(0.0, -0.1, 2.0),
            &slab,
            &mut via_polygon,
        ));

        assert!((via_aabb.normal_x - via_polygon.normal_x).abs() < 1e-6);
        assert!((via_aabb.normal_y - via_polygon.normal_y).abs() < 1e-6);
        assert!((via_aabb.depth - via_polygon.depth).abs() < 1e-6);
        assert_eq!(via_aabb.point_count, via_polygon.point_count);
    }

    #[test]
    fn reports_a_clean_miss_rather_than_nan_for_a_degenerate_polygon() {
        let mut out = create_collision_contact_manifold2d();
        let degenerate = CollisionPolygon2D { points: vec![0.0, 0.0, 1.0, 1.0] };
        assert!(!collide_aabb_polygon_contact(
            &CollisionAabb2D { min_x: -1.0, min_y: -1.0, max_x: 2.0, max_y: 2.0 },
            &degenerate,
            &mut out,
        ));
        assert!(!out.overlapping);
        assert_eq!(out.point_count, 0);
        assert!(!out.depth.is_nan());
        assert!(!out.normal_x.is_nan());
    }
}

mod collide_circle_aabb_contact {
    use super::*;

    #[test]
    fn places_the_single_point_on_the_circle_surface_at_its_deepest_penetration() {
        let mut out = create_collision_contact_manifold2d();
        let circle = CollisionCircle2D { x: 0.0, y: 0.9, radius: 1.0 };
        assert!(collide_circle_aabb_contact(&circle, &ground(), &mut out));
        assert!((out.normal_y - 1.0).abs() < 1e-6);
        assert!((out.depth - 0.1).abs() < 1e-6);
        assert_eq!(out.point_count, 1);
        assert!((out.points[0].x - 0.0).abs() < 1e-6);
        assert!((out.points[0].y - (-0.1)).abs() < 1e-6);
        assert!((out.points[0].depth - 0.1).abs() < 1e-6);
    }

    #[test]
    fn is_separated_when_the_circle_clears_the_box() {
        let mut out = create_collision_contact_manifold2d();
        assert!(!collide_circle_aabb_contact(
            &CollisionCircle2D { x: 0.0, y: 4.0, radius: 1.0 },
            &ground(),
            &mut out,
        ));
        assert_eq!(out.point_count, 0);
    }
}

mod collide_circle_circle_contact {
    use super::*;

    #[test]
    fn places_the_point_on_a_surface_along_the_contact_normal() {
        let mut out = create_collision_contact_manifold2d();
        let a = CollisionCircle2D { x: 0.0, y: 0.0, radius: 1.0 };
        let b = CollisionCircle2D { x: 1.5, y: 0.0, radius: 1.0 };
        assert!(collide_circle_circle_contact(&a, &b, &mut out));
        assert!((out.normal_x - (-1.0)).abs() < 1e-6);
        assert!((out.depth - 0.5).abs() < 1e-6);
        assert_eq!(out.point_count, 1);
        assert!((out.points[0].x - 1.0).abs() < 1e-6);
        assert!((out.points[0].y - 0.0).abs() < 1e-6);
        assert!((out.points[0].depth - 0.5).abs() < 1e-6);
    }

    #[test]
    fn agrees_with_the_lean_overlap_test_on_normal_and_depth() {
        let mut contact = create_collision_contact_manifold2d();
        let mut lean = create_collision_manifold2d();
        let a = CollisionCircle2D { x: 1.0, y: 2.0, radius: 3.0 };
        let b = CollisionCircle2D { x: 4.0, y: 6.0, radius: 4.0 };
        assert!(collide_circle_circle_contact(&a, &b, &mut contact));
        assert!(test_circle_circle_collision2d(&a, &b, &mut lean));
        assert!((contact.normal_x - lean.normal_x).abs() < 1e-6);
        assert!((contact.normal_y - lean.normal_y).abs() < 1e-6);
        assert!((contact.depth - lean.depth).abs() < 1e-6);
    }

    #[test]
    fn clears_a_previously_populated_manifold_on_a_miss() {
        let mut out = create_collision_contact_manifold2d();
        assert!(collide_circle_circle_contact(
            &CollisionCircle2D { x: 0.0, y: 0.0, radius: 1.0 },
            &CollisionCircle2D { x: 1.5, y: 0.0, radius: 1.0 },
            &mut out,
        ));
        assert!(collide_circle_circle_contact(
            &CollisionCircle2D { x: 0.0, y: 0.0, radius: 1.0 },
            &CollisionCircle2D { x: 9.0, y: 0.0, radius: 1.0 },
            &mut out,
        ) == false);
        assert_eq!(out.point_count, 0);
        assert!(!out.overlapping);
    }
}

mod collide_circle_obb_contact {
    use super::*;

    #[test]
    fn places_the_point_on_the_circle_surface_in_the_rotated_box_frame() {
        let mut out = create_collision_contact_manifold2d();
        let bx = CollisionObb2D {
            x: 0.0,
            y: 0.0,
            half_w: 1.0,
            half_h: 4.0,
            rotation: std::f64::consts::FRAC_PI_2,
        };
        let circle = CollisionCircle2D { x: 0.0, y: 1.9, radius: 1.0 };
        assert!(collide_circle_obb_contact(&circle, &bx, &mut out));
        assert!((out.normal_y - 1.0).abs() < 1e-6);
        assert!((out.depth - 0.1).abs() < 1e-6);
        assert_eq!(out.point_count, 1);
        assert!((out.points[0].y - 0.9).abs() < 1e-6);
    }

    #[test]
    fn is_separated_when_the_circle_clears_the_rotated_box() {
        let mut out = create_collision_contact_manifold2d();
        assert!(!collide_circle_obb_contact(
            &CollisionCircle2D { x: 0.0, y: 20.0, radius: 1.0 },
            &CollisionObb2D { x: 0.0, y: 0.0, half_w: 1.0, half_h: 4.0, rotation: 0.7 },
            &mut out,
        ));
        assert_eq!(out.point_count, 0);
    }
}

mod collide_circle_polygon_contact {
    use super::*;

    #[test]
    fn places_the_point_on_the_circle_surface_below_the_polygon_face() {
        let mut out = create_collision_contact_manifold2d();
        let circle = CollisionCircle2D { x: 2.5, y: 5.9, radius: 1.0 };
        assert!(collide_circle_polygon_contact(&circle, &square(0.0, 0.0, 5.0), &mut out));
        assert!((out.normal_y - 1.0).abs() < 1e-6);
        assert!((out.depth - 0.1).abs() < 1e-6);
        assert_eq!(out.point_count, 1);
        assert!((out.points[0].x - 2.5).abs() < 1e-6);
        assert!((out.points[0].y - 4.9).abs() < 1e-6);
    }

    #[test]
    fn resolves_a_corner_contact_to_one_point_without_reporting_a_face() {
        let mut out = create_collision_contact_manifold2d();
        let circle = CollisionCircle2D { x: 5.6, y: 5.6, radius: 1.0 };
        assert!(collide_circle_polygon_contact(&circle, &square(0.0, 0.0, 5.0), &mut out));
        assert_eq!(out.point_count, 1);
        assert!((out.normal_x - std::f64::consts::FRAC_1_SQRT_2).abs() < 1e-6);
        assert!((out.normal_y - std::f64::consts::FRAC_1_SQRT_2).abs() < 1e-6);
    }
}

mod collide_obb_obb_contact {
    use super::*;

    #[test]
    fn resolves_two_aligned_oriented_boxes_to_a_two_point_face_contact() {
        let mut out = create_collision_contact_manifold2d();
        let upper = CollisionObb2D { x: 0.0, y: 0.9, half_w: 1.0, half_h: 1.0, rotation: 0.0 };
        let lower = CollisionObb2D { x: 0.0, y: -1.0, half_w: 1.0, half_h: 1.0, rotation: 0.0 };
        assert!(collide_obb_obb_contact(&upper, &lower, &mut out));
        assert!((out.normal_y - (-1.0)).abs() < 1e-6);
        assert!((out.depth - 0.1).abs() < 1e-6);
        assert_eq!(out.point_count, 2);
        let mut xs: Vec<f64> = live_points(&out).iter().map(|p| p.x).collect();
        xs.sort_by(|a, b| a.partial_cmp(b).unwrap());
        assert!((xs[0] - (-1.0)).abs() < 1e-6);
        assert!((xs[1] - 1.0).abs() < 1e-6);
    }

    #[test]
    fn agrees_with_the_lean_overlap_test_on_normal_and_depth_for_a_rotated_pair() {
        let mut contact = create_collision_contact_manifold2d();
        let mut lean = create_collision_manifold2d();
        let a = CollisionObb2D { x: 0.0, y: 0.0, half_w: 2.0, half_h: 1.0, rotation: 0.4 };
        let b = CollisionObb2D { x: 2.5, y: 0.5, half_w: 1.0, half_h: 1.5, rotation: -0.2 };
        assert!(collide_obb_obb_contact(&a, &b, &mut contact));
        assert!(test_obb_obb_collision2d(&a, &b, &mut lean));
        assert!((contact.normal_x - (-lean.normal_x)).abs() < 1e-6);
        assert!((contact.normal_y - (-lean.normal_y)).abs() < 1e-6);
        assert!((contact.depth - lean.depth).abs() < 1e-6);
    }

    #[test]
    fn keeps_every_contact_point_at_or_behind_the_contact_plane() {
        let mut out = create_collision_contact_manifold2d();
        let a = CollisionObb2D { x: 0.0, y: 0.0, half_w: 2.0, half_h: 1.0, rotation: 0.4 };
        let b = CollisionObb2D { x: 2.5, y: 0.5, half_w: 1.0, half_h: 1.5, rotation: -0.2 };
        assert!(collide_obb_obb_contact(&a, &b, &mut out));
        assert!(out.point_count > 0);
        for point in live_points(&out) {
            assert!(point.depth > 0.0);
            assert!(point.depth <= out.depth + 1e-9);
        }
    }
}

mod collide_obb_polygon_contact {
    use super::*;

    #[test]
    fn resolves_an_oriented_box_resting_on_a_polygon_slab_to_two_points() {
        let mut out = create_collision_contact_manifold2d();
        let bx = CollisionObb2D { x: 2.5, y: 5.9, half_w: 1.0, half_h: 1.0, rotation: 0.0 };
        assert!(collide_obb_polygon_contact(&bx, &square(0.0, 0.0, 5.0), &mut out));
        assert!((out.normal_y - (-1.0)).abs() < 1e-6);
        assert!((out.depth - 0.1).abs() < 1e-6);
        assert_eq!(out.point_count, 2);
    }

    #[test]
    fn is_separated_when_the_box_clears_the_polygon() {
        let mut out = create_collision_contact_manifold2d();
        assert!(!collide_obb_polygon_contact(
            &CollisionObb2D { x: 50.0, y: 50.0, half_w: 1.0, half_h: 1.0, rotation: 0.0 },
            &square(0.0, 0.0, 5.0),
            &mut out,
        ));
        assert_eq!(out.point_count, 0);
    }
}

mod collide_polygon_polygon_contact {
    use super::*;

    #[test]
    fn resolves_a_square_resting_on_a_slab_to_two_points_spanning_the_overlap() {
        let mut out = create_collision_contact_manifold2d();
        assert!(collide_polygon_polygon_contact(
            &square(0.0, 4.9, 2.0),
            &square(0.0, 0.0, 5.0),
            &mut out,
        ));
        assert!((out.normal_y - (-1.0)).abs() < 1e-6);
        assert!((out.depth - 0.1).abs() < 1e-6);
        assert_eq!(out.point_count, 2);
        let mut xs: Vec<f64> = live_points(&out).iter().map(|p| p.x).collect();
        xs.sort_by(|a, b| a.partial_cmp(b).unwrap());
        assert!((xs[0] - 0.0).abs() < 1e-6);
        assert!((xs[1] - 2.0).abs() < 1e-6);
    }

    #[test]
    fn agrees_with_the_lean_overlap_test_on_normal_and_depth() {
        let mut contact = create_collision_contact_manifold2d();
        let mut lean = create_collision_manifold2d();
        let a = square(0.0, 4.9, 2.0);
        let b = square(0.0, 0.0, 5.0);
        assert!(collide_polygon_polygon_contact(&a, &b, &mut contact));
        assert!(test_polygon_polygon_collision2d(&a, &b, &mut lean));
        assert!((contact.normal_x - (-lean.normal_x)).abs() < 1e-6);
        assert!((contact.normal_y - (-lean.normal_y)).abs() < 1e-6);
        assert!((contact.depth - lean.depth).abs() < 1e-6);
    }

    #[test]
    fn resolves_a_triangle_tip_pressed_into_a_face_to_a_single_point() {
        let mut out = create_collision_contact_manifold2d();
        let triangle = CollisionPolygon2D { points: vec![2.0, 4.9, 3.0, 7.0, 1.0, 7.0] };
        assert!(collide_polygon_polygon_contact(
            &triangle,
            &square(0.0, 0.0, 5.0),
            &mut out,
        ));
        assert_eq!(out.point_count, 1);
        assert!((out.points[0].x - 2.0).abs() < 1e-6);
        assert!((out.points[0].y - 4.9).abs() < 1e-6);
        assert!((out.points[0].depth - 0.1).abs() < 1e-6);
    }

    #[test]
    fn resolves_the_same_contact_regardless_of_ccw_starting_vertex() {
        // The convex clipping path assumes CCW winding, so we test that the
        // same polygon starting from a different vertex produces identical results.
        let mut first = create_collision_contact_manifold2d();
        let mut rotated = create_collision_contact_manifold2d();
        let slab = square(0.0, 0.0, 5.0);
        // Same CCW square but starting from (5,0) instead of (0,0).
        let rotated_slab = CollisionPolygon2D {
            points: vec![5.0, 0.0, 5.0, 5.0, 0.0, 5.0, 0.0, 0.0],
        };
        assert!(collide_polygon_polygon_contact(
            &square(0.0, 4.9, 2.0),
            &slab,
            &mut first,
        ));
        assert!(collide_polygon_polygon_contact(
            &square(0.0, 4.9, 2.0),
            &rotated_slab,
            &mut rotated,
        ));

        assert!((rotated.normal_y - first.normal_y).abs() < 1e-6);
        assert!((rotated.depth - first.depth).abs() < 1e-6);
        assert_eq!(rotated.point_count, first.point_count);
    }

    #[test]
    fn reports_a_clean_miss_rather_than_nan_for_a_polygon_with_too_few_vertices() {
        let mut out = create_collision_contact_manifold2d();
        assert!(!collide_polygon_polygon_contact(
            &CollisionPolygon2D { points: vec![0.0, 0.0] },
            &square(0.0, 0.0, 5.0),
            &mut out,
        ));
        assert_eq!(out.point_count, 0);
        assert!(!out.depth.is_nan());
    }
}
