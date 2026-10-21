use flight_collision::contract::*;
use flight_collision::*;

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

mod test_aabb_aabb_collision2d {
    use super::*;

    #[test]
    fn reports_the_least_penetration_axis_boxes_overlapping_more_on_x_separate_along_y() {
        let mut out = create_collision_manifold2d();
        // A = 0..10 square; B spans x[2,8] (deep X overlap) but only y[8,10] of A (shallow Y overlap).
        let a = CollisionAabb2D {
            min_x: 0.0,
            min_y: 0.0,
            max_x: 10.0,
            max_y: 10.0,
        };
        let b = CollisionAabb2D {
            min_x: 2.0,
            min_y: 8.0,
            max_x: 8.0,
            max_y: 20.0,
        };
        assert!(test_aabb_aabb_collision2d(&a, &b, &mut out));
        assert!(out.overlapping);
        assert!((out.normal_x - 0.0).abs() < 1e-5);
        assert!((out.normal_y - (-1.0)).abs() < 1e-5);
        assert!((out.depth - 2.0).abs() < 1e-5);
    }

    #[test]
    fn is_separated_when_the_boxes_are_disjoint() {
        let mut out = create_collision_manifold2d();
        let a = CollisionAabb2D {
            min_x: 0.0,
            min_y: 0.0,
            max_x: 1.0,
            max_y: 1.0,
        };
        let b = CollisionAabb2D {
            min_x: 2.0,
            min_y: 2.0,
            max_x: 3.0,
            max_y: 3.0,
        };
        assert!(!test_aabb_aabb_collision2d(&a, &b, &mut out));
        assert!(!out.overlapping);
        assert_eq!(out.normal_x, 0.0);
        assert_eq!(out.normal_y, 0.0);
        assert_eq!(out.depth, 0.0);
    }

    #[test]
    fn treats_edge_touching_as_not_overlapping_exclusive() {
        let mut out = create_collision_manifold2d();
        let a = CollisionAabb2D {
            min_x: 0.0,
            min_y: 0.0,
            max_x: 1.0,
            max_y: 1.0,
        };
        let b = CollisionAabb2D {
            min_x: 1.0,
            min_y: 0.0,
            max_x: 2.0,
            max_y: 1.0,
        };
        assert!(!test_aabb_aabb_collision2d(&a, &b, &mut out));
    }

    #[test]
    fn resolves_containment_with_the_exit_distance_depth_not_the_intersection_length() {
        let mut out = create_collision_manifold2d();
        // B fully inside A, closer to A's top face -- MTV pushes A up through the nearest face by 5.
        let a = CollisionAabb2D {
            min_x: 0.0,
            min_y: 0.0,
            max_x: 10.0,
            max_y: 10.0,
        };
        let b = CollisionAabb2D {
            min_x: 3.0,
            min_y: 3.0,
            max_x: 6.0,
            max_y: 5.0,
        };
        assert!(test_aabb_aabb_collision2d(&a, &b, &mut out));
        assert!((out.normal_x - 0.0).abs() < 1e-5);
        assert!((out.normal_y - 1.0).abs() < 1e-5);
        assert!((out.depth - 5.0).abs() < 1e-5);
    }

    #[test]
    fn clears_a_reused_manifold_when_a_following_pair_misses() {
        let mut out = create_collision_manifold2d();
        test_aabb_aabb_collision2d(
            &CollisionAabb2D {
                min_x: 0.0,
                min_y: 0.0,
                max_x: 2.0,
                max_y: 2.0,
            },
            &CollisionAabb2D {
                min_x: 1.0,
                min_y: 1.0,
                max_x: 3.0,
                max_y: 3.0,
            },
            &mut out,
        );
        assert!(out.overlapping);
        test_aabb_aabb_collision2d(
            &CollisionAabb2D {
                min_x: 0.0,
                min_y: 0.0,
                max_x: 1.0,
                max_y: 1.0,
            },
            &CollisionAabb2D {
                min_x: 5.0,
                min_y: 5.0,
                max_x: 6.0,
                max_y: 6.0,
            },
            &mut out,
        );
        assert!(!out.overlapping);
        assert_eq!(out.normal_x, 0.0);
        assert_eq!(out.normal_y, 0.0);
        assert_eq!(out.depth, 0.0);
    }

    #[test]
    fn rejects_boxes_with_a_zero_width_or_zero_height_extent() {
        let mut out = create_collision_manifold2d();
        out.overlapping = true;
        out.normal_x = 1.0;
        out.depth = 4.0;
        assert!(!test_aabb_aabb_collision2d(
            &CollisionAabb2D {
                min_x: 1.0,
                min_y: 0.0,
                max_x: 1.0,
                max_y: 2.0
            },
            &CollisionAabb2D {
                min_x: 0.0,
                min_y: 0.0,
                max_x: 2.0,
                max_y: 2.0
            },
            &mut out,
        ));
        assert_eq!(out.depth, 0.0);
        assert_eq!(out.normal_x, 0.0);
        assert_eq!(out.normal_y, 0.0);
        assert!(!out.overlapping);
    }

    #[test]
    fn prefers_plus_x_when_both_separation_axes_and_directions_tie() {
        let mut out = create_collision_manifold2d();
        let b = CollisionAabb2D {
            min_x: -1.0,
            min_y: -1.0,
            max_x: 1.0,
            max_y: 1.0,
        };
        assert!(test_aabb_aabb_collision2d(&b, &b, &mut out));
        assert_eq!(out.normal_x, 1.0);
        assert_eq!(out.normal_y, 0.0);
    }
}

mod test_aabb_obb_collision2d {
    use super::*;

    // NOTE: The TS test "keeps SAT state isolated from a nested collision triggered by the output setter"
    // relies on JavaScript Object.defineProperty getter/setter behavior, which has no equivalent in Rust.
    // That test is omitted because it tests a JS-specific reentrancy scenario.

    #[test]
    fn rejects_an_obb_with_a_zero_half_width() {
        let mut out = create_collision_manifold2d();
        out.overlapping = true;
        out.normal_x = 1.0;
        out.depth = 4.0;
        assert!(!test_aabb_obb_collision2d(
            &CollisionAabb2D {
                min_x: 0.0,
                min_y: 0.0,
                max_x: 4.0,
                max_y: 10.0
            },
            &CollisionObb2D {
                x: 2.0,
                y: 5.0,
                half_w: 0.0,
                half_h: 3.0,
                rotation: 0.0
            },
            &mut out,
        ));
        assert_eq!(out.depth, 0.0);
        assert_eq!(out.normal_x, 0.0);
        assert_eq!(out.normal_y, 0.0);
        assert!(!out.overlapping);
    }

    #[test]
    fn rejects_an_obb_with_a_zero_half_height() {
        let mut out = create_collision_manifold2d();
        out.overlapping = true;
        out.normal_x = 1.0;
        out.depth = 4.0;
        assert!(!test_aabb_obb_collision2d(
            &CollisionAabb2D {
                min_x: 0.0,
                min_y: 0.0,
                max_x: 4.0,
                max_y: 10.0
            },
            &CollisionObb2D {
                x: 6.0,
                y: 5.0,
                half_w: 3.0,
                half_h: 0.0,
                rotation: 0.0
            },
            &mut out,
        ));
        assert_eq!(out.depth, 0.0);
        assert_eq!(out.normal_x, 0.0);
        assert_eq!(out.normal_y, 0.0);
        assert!(!out.overlapping);
    }

    #[test]
    fn rejects_an_obb_with_a_negative_half_width() {
        let mut out = create_collision_manifold2d();
        out.overlapping = true;
        out.normal_x = 1.0;
        out.depth = 4.0;
        assert!(!test_aabb_obb_collision2d(
            &CollisionAabb2D {
                min_x: 0.0,
                min_y: 0.0,
                max_x: 4.0,
                max_y: 10.0
            },
            &CollisionObb2D {
                x: 6.0,
                y: 5.0,
                half_w: -3.0,
                half_h: 3.0,
                rotation: 0.0
            },
            &mut out,
        ));
        assert_eq!(out.depth, 0.0);
        assert_eq!(out.normal_x, 0.0);
        assert_eq!(out.normal_y, 0.0);
        assert!(!out.overlapping);
    }

    #[test]
    fn rejects_an_obb_with_a_non_finite_half_width() {
        let mut out = create_collision_manifold2d();
        out.overlapping = true;
        out.normal_x = 1.0;
        out.depth = 4.0;
        assert!(!test_aabb_obb_collision2d(
            &CollisionAabb2D {
                min_x: 0.0,
                min_y: 0.0,
                max_x: 4.0,
                max_y: 10.0
            },
            &CollisionObb2D {
                x: 6.0,
                y: 5.0,
                half_w: f32::NAN,
                half_h: 3.0,
                rotation: 0.0
            },
            &mut out,
        ));
        assert_eq!(out.depth, 0.0);
        assert_eq!(out.normal_x, 0.0);
        assert_eq!(out.normal_y, 0.0);
        assert!(!out.overlapping);
    }

    #[test]
    fn rejects_an_obb_with_a_non_finite_half_height() {
        let mut out = create_collision_manifold2d();
        out.overlapping = true;
        out.normal_x = 1.0;
        out.depth = 4.0;
        assert!(!test_aabb_obb_collision2d(
            &CollisionAabb2D {
                min_x: 0.0,
                min_y: 0.0,
                max_x: 4.0,
                max_y: 10.0
            },
            &CollisionObb2D {
                x: 6.0,
                y: 5.0,
                half_w: 3.0,
                half_h: f32::INFINITY,
                rotation: 0.0
            },
            &mut out,
        ));
        assert_eq!(out.depth, 0.0);
        assert_eq!(out.normal_x, 0.0);
        assert_eq!(out.normal_y, 0.0);
        assert!(!out.overlapping);
    }

    #[test]
    fn rejects_an_obb_with_a_non_finite_rotation() {
        let mut out = create_collision_manifold2d();
        out.overlapping = true;
        out.normal_x = 1.0;
        out.depth = 4.0;
        assert!(!test_aabb_obb_collision2d(
            &CollisionAabb2D {
                min_x: 0.0,
                min_y: 0.0,
                max_x: 4.0,
                max_y: 10.0
            },
            &CollisionObb2D {
                x: 6.0,
                y: 5.0,
                half_w: 3.0,
                half_h: 3.0,
                rotation: f32::NAN
            },
            &mut out,
        ));
        assert_eq!(out.depth, 0.0);
        assert_eq!(out.normal_x, 0.0);
        assert_eq!(out.normal_y, 0.0);
        assert!(!out.overlapping);
    }

    #[test]
    fn rejects_an_obb_with_a_non_finite_center() {
        let mut out = create_collision_manifold2d();
        out.overlapping = true;
        out.normal_x = 1.0;
        out.depth = 4.0;
        assert!(!test_aabb_obb_collision2d(
            &CollisionAabb2D {
                min_x: 0.0,
                min_y: 0.0,
                max_x: 4.0,
                max_y: 10.0
            },
            &CollisionObb2D {
                x: f32::NAN,
                y: 5.0,
                half_w: 3.0,
                half_h: 3.0,
                rotation: 0.0
            },
            &mut out,
        ));
        assert_eq!(out.depth, 0.0);
        assert_eq!(out.normal_x, 0.0);
        assert_eq!(out.normal_y, 0.0);
        assert!(!out.overlapping);
    }

    #[test]
    fn overlaps_an_axis_aligned_obb_and_pushes_the_box_off_it() {
        let mut out = create_collision_manifold2d();
        let a = CollisionAabb2D {
            min_x: 0.0,
            min_y: 0.0,
            max_x: 4.0,
            max_y: 10.0,
        };
        let b = CollisionObb2D {
            x: 6.0,
            y: 5.0,
            half_w: 3.0,
            half_h: 3.0,
            rotation: 0.0,
        };
        assert!(test_aabb_obb_collision2d(&a, &b, &mut out));
        assert!((out.normal_x - (-1.0)).abs() < 1e-5);
        assert!((out.normal_y - 0.0).abs() < 1e-5);
        assert!((out.depth - 1.0).abs() < 1e-5); // A right edge x=4, OBB left edge x=3 -> penetration 1
    }

    #[test]
    fn is_separated_when_apart() {
        let mut out = create_collision_manifold2d();
        let a = CollisionAabb2D {
            min_x: 0.0,
            min_y: 0.0,
            max_x: 2.0,
            max_y: 2.0,
        };
        let b = CollisionObb2D {
            x: 10.0,
            y: 10.0,
            half_w: 1.0,
            half_h: 1.0,
            rotation: 0.5,
        };
        assert!(!test_aabb_obb_collision2d(&a, &b, &mut out));
        assert!(!out.overlapping);
    }
}

mod test_aabb_polygon_collision2d {
    use super::*;

    #[test]
    fn overlaps_a_convex_polygon() {
        let mut out = create_collision_manifold2d();
        let a = CollisionAabb2D {
            min_x: 0.0,
            min_y: 0.0,
            max_x: 6.0,
            max_y: 6.0,
        };
        assert!(test_aabb_polygon_collision2d(
            &a,
            &square(4.0, 0.0, 6.0),
            &mut out
        ));
        assert!((out.normal_x - (-1.0)).abs() < 1e-5);
        assert!((out.depth - 2.0).abs() < 1e-5); // A right x=6, polygon left x=4 -> penetration 2
    }

    #[test]
    fn is_separated_when_apart() {
        let mut out = create_collision_manifold2d();
        let a = CollisionAabb2D {
            min_x: 0.0,
            min_y: 0.0,
            max_x: 2.0,
            max_y: 2.0,
        };
        assert!(!test_aabb_polygon_collision2d(
            &a,
            &square(10.0, 10.0, 4.0),
            &mut out
        ));
    }
}

mod test_circle_aabb_collision2d {
    use super::*;

    #[test]
    fn overlaps_with_the_closest_point_normal_when_the_center_is_outside_the_box() {
        let mut out = create_collision_manifold2d();
        let a = CollisionCircle2D {
            x: 15.0,
            y: 5.0,
            radius: 7.0,
        };
        let b = CollisionAabb2D {
            min_x: 0.0,
            min_y: 0.0,
            max_x: 10.0,
            max_y: 10.0,
        };
        assert!(test_circle_aabb_collision2d(&a, &b, &mut out));
        assert!((out.normal_x - 1.0).abs() < 1e-5);
        assert!((out.normal_y - 0.0).abs() < 1e-5);
        assert!((out.depth - 2.0).abs() < 1e-5); // closest point (10,5), dist 5, radius 7 -> depth 2
    }

    #[test]
    fn is_separated_when_the_closest_point_is_beyond_the_radius() {
        let mut out = create_collision_manifold2d();
        let a = CollisionCircle2D {
            x: 20.0,
            y: 5.0,
            radius: 3.0,
        };
        let b = CollisionAabb2D {
            min_x: 0.0,
            min_y: 0.0,
            max_x: 10.0,
            max_y: 10.0,
        };
        assert!(!test_circle_aabb_collision2d(&a, &b, &mut out));
    }

    #[test]
    fn treats_exact_touching_as_not_overlapping_exclusive() {
        let mut out = create_collision_manifold2d();
        let a = CollisionCircle2D {
            x: 17.0,
            y: 5.0,
            radius: 7.0,
        }; // closest (10,5), dist 7 == radius
        let b = CollisionAabb2D {
            min_x: 0.0,
            min_y: 0.0,
            max_x: 10.0,
            max_y: 10.0,
        };
        assert!(!test_circle_aabb_collision2d(&a, &b, &mut out));
    }

    #[test]
    fn pushes_out_through_the_nearest_face_when_the_center_is_inside_the_box() {
        let mut out = create_collision_manifold2d();
        let a = CollisionCircle2D {
            x: 8.0,
            y: 5.0,
            radius: 1.0,
        }; // 2 from the right face
        let b = CollisionAabb2D {
            min_x: 0.0,
            min_y: 0.0,
            max_x: 10.0,
            max_y: 10.0,
        };
        assert!(test_circle_aabb_collision2d(&a, &b, &mut out));
        assert!((out.normal_x - 1.0).abs() < 1e-5);
        assert!((out.normal_y - 0.0).abs() < 1e-5);
        assert!((out.depth - 3.0).abs() < 1e-5); // 2 to the face + radius 1
    }
}

mod test_circle_circle_collision2d {
    use super::*;

    #[test]
    fn gives_depth_1_and_a_unit_normal_for_two_radius_1_circles_centered_1_apart() {
        let mut out = create_collision_manifold2d();
        let a = CollisionCircle2D {
            x: 0.0,
            y: 0.0,
            radius: 1.0,
        };
        let b = CollisionCircle2D {
            x: 1.0,
            y: 0.0,
            radius: 1.0,
        };
        assert!(test_circle_circle_collision2d(&a, &b, &mut out));
        assert!((out.normal_x - (-1.0)).abs() < 1e-5); // pushes A (left) off B (right)
        assert!((out.normal_y - 0.0).abs() < 1e-5);
        assert!((out.depth - 1.0).abs() < 1e-5);
    }

    #[test]
    fn is_separated_when_the_centers_are_farther_than_the_radius_sum() {
        let mut out = create_collision_manifold2d();
        let a = CollisionCircle2D {
            x: 0.0,
            y: 0.0,
            radius: 1.0,
        };
        let b = CollisionCircle2D {
            x: 3.0,
            y: 0.0,
            radius: 1.0,
        };
        assert!(!test_circle_circle_collision2d(&a, &b, &mut out));
        assert_eq!(out.depth, 0.0);
    }

    #[test]
    fn treats_exact_touching_distance_equals_radius_sum_as_not_overlapping() {
        let mut out = create_collision_manifold2d();
        let a = CollisionCircle2D {
            x: 0.0,
            y: 0.0,
            radius: 1.0,
        };
        let b = CollisionCircle2D {
            x: 2.0,
            y: 0.0,
            radius: 1.0,
        };
        assert!(!test_circle_circle_collision2d(&a, &b, &mut out));
    }

    #[test]
    fn handles_a_fully_contained_circle() {
        let mut out = create_collision_manifold2d();
        let a = CollisionCircle2D {
            x: 0.0,
            y: 0.0,
            radius: 5.0,
        };
        let b = CollisionCircle2D {
            x: 1.0,
            y: 0.0,
            radius: 1.0,
        };
        assert!(test_circle_circle_collision2d(&a, &b, &mut out));
        assert!((out.normal_x - (-1.0)).abs() < 1e-5);
        assert!((out.depth - 5.0).abs() < 1e-5); // radiusSum 6 - dist 1
    }

    #[test]
    fn falls_back_to_a_plus_x_normal_at_full_depth_for_concentric_circles() {
        let mut out = create_collision_manifold2d();
        let a = CollisionCircle2D {
            x: 2.0,
            y: 2.0,
            radius: 3.0,
        };
        let b = CollisionCircle2D {
            x: 2.0,
            y: 2.0,
            radius: 1.0,
        };
        assert!(test_circle_circle_collision2d(&a, &b, &mut out));
        assert_eq!(out.normal_x, 1.0);
        assert_eq!(out.normal_y, 0.0);
        assert!((out.depth - 4.0).abs() < 1e-5);
    }

    #[test]
    fn rejects_a_zero_radius_circle_and_clears_the_output() {
        let mut out = create_collision_manifold2d();
        out.overlapping = true;
        out.normal_x = -1.0;
        out.depth = 2.0;
        assert!(!test_circle_circle_collision2d(
            &CollisionCircle2D {
                x: 0.0,
                y: 0.0,
                radius: 0.0
            },
            &CollisionCircle2D {
                x: 0.0,
                y: 0.0,
                radius: 1.0
            },
            &mut out,
        ));
        assert_eq!(out.depth, 0.0);
        assert_eq!(out.normal_x, 0.0);
        assert_eq!(out.normal_y, 0.0);
        assert!(!out.overlapping);
    }

    #[test]
    fn keeps_a_directional_normal_for_proportionally_tiny_circles() {
        let mut out = create_collision_manifold2d();
        assert!(test_circle_circle_collision2d(
            &CollisionCircle2D {
                x: 0.0,
                y: 0.0,
                radius: 1e-12
            },
            &CollisionCircle2D {
                x: 1e-12,
                y: 0.0,
                radius: 1e-12
            },
            &mut out,
        ));
        assert_eq!(out.normal_x, -1.0);
        assert_eq!(out.normal_y, 0.0);
        assert!((out.depth - 1e-12).abs() < 1e-20);
    }
}

mod test_circle_obb_collision2d {
    use super::*;

    #[test]
    fn matches_circle_vs_aabb_for_a_zero_rotation_obb() {
        let mut out = create_collision_manifold2d();
        let a = CollisionCircle2D {
            x: 15.0,
            y: 5.0,
            radius: 7.0,
        };
        let b = CollisionObb2D {
            x: 5.0,
            y: 5.0,
            half_w: 5.0,
            half_h: 5.0,
            rotation: 0.0,
        };
        assert!(test_circle_obb_collision2d(&a, &b, &mut out));
        assert!((out.normal_x - 1.0).abs() < 1e-5);
        assert!((out.normal_y - 0.0).abs() < 1e-5);
        assert!((out.depth - 2.0).abs() < 1e-5);
    }

    #[test]
    fn rotates_the_manifold_normal_back_into_world_space_for_a_rotated_obb() {
        let mut out = create_collision_manifold2d();
        // OBB rotated 90 degrees: its half-width (5) lies along world Y, half-height (1) along world X.
        let a = CollisionCircle2D {
            x: 3.0,
            y: 0.0,
            radius: 2.5,
        };
        let b = CollisionObb2D {
            x: 0.0,
            y: 0.0,
            half_w: 5.0,
            half_h: 1.0,
            rotation: std::f32::consts::FRAC_PI_2,
        };
        assert!(test_circle_obb_collision2d(&a, &b, &mut out));
        assert!((out.normal_x - 1.0).abs() < 1e-5); // world +X face at x=1, circle center x=3 r=2.5
        assert!((out.normal_y - 0.0).abs() < 1e-5);
        assert!((out.depth - 0.5).abs() < 1e-5); // (1 + 2.5) - 3
    }

    #[test]
    fn is_separated_when_apart() {
        let mut out = create_collision_manifold2d();
        let a = CollisionCircle2D {
            x: 20.0,
            y: 0.0,
            radius: 1.0,
        };
        let b = CollisionObb2D {
            x: 0.0,
            y: 0.0,
            half_w: 2.0,
            half_h: 2.0,
            rotation: 0.7,
        };
        assert!(!test_circle_obb_collision2d(&a, &b, &mut out));
    }
}

mod test_circle_polygon_collision2d {
    use super::*;

    #[test]
    fn overlaps_a_square_polygon_on_the_edge_nearest_the_circle() {
        let mut out = create_collision_manifold2d();
        let a = CollisionCircle2D {
            x: 13.0,
            y: 5.0,
            radius: 5.0,
        };
        assert!(test_circle_polygon_collision2d(
            &a,
            &square(0.0, 0.0, 10.0),
            &mut out
        ));
        assert!((out.normal_x - 1.0).abs() < 1e-5);
        assert!((out.normal_y - 0.0).abs() < 1e-5);
        assert!((out.depth - 2.0).abs() < 1e-5); // polygon right x=10, circle left x=8 -> penetration 2
    }

    #[test]
    fn uses_the_vertex_axis_to_separate_a_circle_just_past_a_corner() {
        let mut out = create_collision_manifold2d();
        // Corner (10,10), circle center (13,13): corner distance sqrt(18) ~= 4.243 > radius 4.
        let a = CollisionCircle2D {
            x: 13.0,
            y: 13.0,
            radius: 4.0,
        };
        assert!(!test_circle_polygon_collision2d(
            &a,
            &square(0.0, 0.0, 10.0),
            &mut out
        ));
        assert!(!out.overlapping);
    }

    #[test]
    fn reports_overlap_when_the_circle_reaches_past_the_corner() {
        let mut out = create_collision_manifold2d();
        let a = CollisionCircle2D {
            x: 13.0,
            y: 13.0,
            radius: 5.0,
        }; // corner distance 4.243 < radius 5
        assert!(test_circle_polygon_collision2d(
            &a,
            &square(0.0, 0.0, 10.0),
            &mut out
        ));
    }

    #[test]
    fn handles_a_circle_fully_contained_in_the_polygon() {
        let mut out = create_collision_manifold2d();
        let a = CollisionCircle2D {
            x: 5.0,
            y: 5.0,
            radius: 1.0,
        };
        assert!(test_circle_polygon_collision2d(
            &a,
            &square(0.0, 0.0, 10.0),
            &mut out
        ));
        assert!(out.overlapping);
        assert!((out.depth - 6.0).abs() < 1e-5); // 5 to the nearest edge + radius 1
    }

    #[test]
    fn prefers_plus_x_for_a_centered_circle_whose_edge_axes_tie() {
        let mut out = create_collision_manifold2d();
        assert!(test_circle_polygon_collision2d(
            &CollisionCircle2D {
                x: 0.0,
                y: 0.0,
                radius: 1.0
            },
            &square(-5.0, -5.0, 10.0),
            &mut out,
        ));
        assert_eq!(out.normal_x, 1.0);
        assert_eq!(out.normal_y, 0.0);
    }

    #[test]
    fn is_separated_when_far_from_the_polygon() {
        let mut out = create_collision_manifold2d();
        let a = CollisionCircle2D {
            x: 30.0,
            y: 5.0,
            radius: 3.0,
        };
        assert!(!test_circle_polygon_collision2d(
            &a,
            &square(0.0, 0.0, 10.0),
            &mut out
        ));
    }
}

mod test_obb_obb_collision2d {
    use super::*;

    #[test]
    fn overlaps_an_axis_aligned_box_with_a_45_degree_diamond_and_separates_along_x() {
        let mut out = create_collision_manifold2d();
        let a = CollisionObb2D {
            x: 0.0,
            y: 0.0,
            half_w: 2.0,
            half_h: 2.0,
            rotation: 0.0,
        };
        let b = CollisionObb2D {
            x: 3.0,
            y: 0.0,
            half_w: 2.0,
            half_h: 2.0,
            rotation: std::f32::consts::FRAC_PI_4,
        };
        assert!(test_obb_obb_collision2d(&a, &b, &mut out));
        assert!((out.normal_x - (-1.0)).abs() < 1e-5); // pushes A (left) off the diamond
        assert!((out.normal_y - 0.0).abs() < 1e-5);
        assert!((out.depth - 1.8284).abs() < 1e-3); // A right x=2, diamond left vertex x=3-2.828
    }

    #[test]
    fn is_separated_when_apart() {
        let mut out = create_collision_manifold2d();
        let a = CollisionObb2D {
            x: 0.0,
            y: 0.0,
            half_w: 1.0,
            half_h: 1.0,
            rotation: 0.3,
        };
        let b = CollisionObb2D {
            x: 8.0,
            y: 0.0,
            half_w: 1.0,
            half_h: 1.0,
            rotation: 1.1,
        };
        assert!(!test_obb_obb_collision2d(&a, &b, &mut out));
    }
}

mod test_obb_polygon_collision2d {
    use super::*;

    #[test]
    fn overlaps_a_convex_polygon() {
        let mut out = create_collision_manifold2d();
        let a = CollisionObb2D {
            x: 0.0,
            y: 0.0,
            half_w: 3.0,
            half_h: 3.0,
            rotation: 0.0,
        };
        assert!(test_obb_polygon_collision2d(
            &a,
            &square(2.0, -1.0, 4.0),
            &mut out
        ));
        assert!((out.normal_x - (-1.0)).abs() < 1e-5);
        assert!((out.depth - 1.0).abs() < 1e-5); // OBB right x=3, polygon left x=2 -> penetration 1
    }

    #[test]
    fn is_separated_when_apart() {
        let mut out = create_collision_manifold2d();
        let a = CollisionObb2D {
            x: 0.0,
            y: 0.0,
            half_w: 1.0,
            half_h: 1.0,
            rotation: 0.4,
        };
        assert!(!test_obb_polygon_collision2d(
            &a,
            &square(10.0, 10.0, 3.0),
            &mut out
        ));
    }
}

mod test_polygon_polygon_collision2d {
    use super::*;

    #[test]
    fn reports_the_least_penetration_axis_for_two_overlapping_squares() {
        let mut out = create_collision_manifold2d();
        // A = 0..10 square; B overlaps deeply on X (x[2,8]) but shallowly on Y (y[8,20]).
        let a = square(0.0, 0.0, 10.0);
        let b = CollisionPolygon2D {
            points: vec![2.0, 8.0, 8.0, 8.0, 8.0, 20.0, 2.0, 20.0],
        };
        assert!(test_polygon_polygon_collision2d(&a, &b, &mut out));
        assert!((out.normal_x - 0.0).abs() < 1e-5);
        assert!((out.normal_y - (-1.0)).abs() < 1e-5);
        assert!((out.depth - 2.0).abs() < 1e-5);
    }

    #[test]
    fn treats_a_convex_hexagon_correctly() {
        let mut out = create_collision_manifold2d();
        // A convex hexagon centered near the origin.
        let hex = CollisionPolygon2D {
            points: vec![
                2.0, 0.0, 1.0, 2.0, -1.0, 2.0, -2.0, 0.0, -1.0, -2.0, 1.0, -2.0,
            ],
        };
        assert!(test_polygon_polygon_collision2d(
            &hex,
            &square(0.0, 0.0, 3.0),
            &mut out
        ));
        assert!(out.overlapping);
    }

    #[test]
    fn is_separated_when_the_polygons_are_disjoint() {
        let mut out = create_collision_manifold2d();
        assert!(!test_polygon_polygon_collision2d(
            &square(0.0, 0.0, 2.0),
            &square(5.0, 5.0, 2.0),
            &mut out,
        ));
    }

    #[test]
    fn treats_edge_touching_as_not_overlapping_exclusive() {
        let mut out = create_collision_manifold2d();
        assert!(!test_polygon_polygon_collision2d(
            &square(0.0, 0.0, 2.0),
            &square(2.0, 0.0, 2.0),
            &mut out,
        ));
    }

    #[test]
    fn rejects_polygons_with_fewer_than_three_vertices() {
        let mut out = create_collision_manifold2d();
        out.overlapping = true;
        assert!(!test_polygon_polygon_collision2d(
            &CollisionPolygon2D {
                points: vec![0.0, 0.0, 1.0, 1.0]
            },
            &square(0.0, 0.0, 2.0),
            &mut out,
        ));
        assert_eq!(out.depth, 0.0);
        assert_eq!(out.normal_x, 0.0);
        assert_eq!(out.normal_y, 0.0);
        assert!(!out.overlapping);
    }

    #[test]
    fn chooses_the_same_plus_x_mtv_for_coincident_squares_regardless_of_start_vertex_and_winding() {
        let mut out = create_collision_manifold2d();
        let variants: Vec<CollisionPolygon2D> = vec![
            CollisionPolygon2D {
                points: vec![-1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0],
            },
            CollisionPolygon2D {
                points: vec![1.0, 1.0, 1.0, -1.0, -1.0, -1.0, -1.0, 1.0],
            },
            CollisionPolygon2D {
                points: vec![-1.0, 1.0, 1.0, 1.0, 1.0, -1.0, -1.0, -1.0],
            },
        ];
        for polygon in &variants {
            assert!(test_polygon_polygon_collision2d(
                &variants[0],
                polygon,
                &mut out
            ));
            assert_eq!(out.normal_x, 1.0);
            assert_eq!(out.normal_y, 0.0);
            assert!((out.depth - 2.0).abs() < 1e-5);
        }
    }

    #[test]
    fn is_translation_stable_at_large_world_coordinates() {
        let mut out = create_collision_manifold2d();
        let origin = 1e15_f64;
        let a = CollisionPolygon2D {
            points: vec![
                origin,
                origin,
                origin + 10.0,
                origin,
                origin + 10.0,
                origin + 10.0,
                origin,
                origin + 10.0,
            ],
        };
        let b = CollisionPolygon2D {
            points: vec![
                origin + 8.0,
                origin,
                origin + 18.0,
                origin,
                origin + 18.0,
                origin + 10.0,
                origin + 8.0,
                origin + 10.0,
            ],
        };
        assert!(test_polygon_polygon_collision2d(&a, &b, &mut out));
        assert_eq!(out.normal_x, -1.0);
        assert_eq!(out.normal_y, 0.0);
        assert!((out.depth - 2.0).abs() < 1e-5);
    }
}
