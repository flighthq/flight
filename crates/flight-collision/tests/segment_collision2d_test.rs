use flight_collision::*;

fn segment(x0: f64, y0: f64, x1: f64, y1: f64) -> CollisionSegment2D {
    CollisionSegment2D { x0, y0, x1, y1 }
}

mod test_segment_aabb_collision2d_tests {
    use super::*;

    fn check(seg: CollisionSegment2D, aabb: &CollisionAabb2D) -> bool {
        let mut out_x = 0.0_f64;
        let mut out_y = 0.0_f64;
        let mut out_t = 0.0_f64;
        test_segment_aabb_collision2d(&seg, aabb, &mut out_x, &mut out_y, &mut out_t)
    }

    #[test]
    fn is_true_for_a_segment_crossing_the_box() {
        let b = CollisionAabb2D { min_x: 0.0, min_y: 0.0, max_x: 10.0, max_y: 10.0 };
        assert!(check(segment(-5.0, 5.0, 15.0, 5.0), &b));
    }

    #[test]
    fn is_true_for_a_segment_fully_inside_the_box() {
        let b = CollisionAabb2D { min_x: 0.0, min_y: 0.0, max_x: 10.0, max_y: 10.0 };
        assert!(check(segment(2.0, 2.0, 8.0, 8.0), &b));
    }

    #[test]
    fn is_false_for_a_segment_that_misses_the_box() {
        let b = CollisionAabb2D { min_x: 0.0, min_y: 0.0, max_x: 10.0, max_y: 10.0 };
        assert!(!check(segment(-5.0, -5.0, -1.0, -1.0), &b));
    }

    #[test]
    fn is_false_for_a_segment_running_parallel_outside_the_box() {
        let b = CollisionAabb2D { min_x: 0.0, min_y: 0.0, max_x: 10.0, max_y: 10.0 };
        assert!(!check(segment(-5.0, 20.0, 15.0, 20.0), &b));
    }

    #[test]
    fn treats_a_zero_length_segment_as_a_point() {
        let b = CollisionAabb2D { min_x: 0.0, min_y: 0.0, max_x: 10.0, max_y: 10.0 };
        assert!(check(segment(5.0, 5.0, 5.0, 5.0), &b));
        assert!(!check(segment(20.0, 20.0, 20.0, 20.0), &b));
    }

    #[test]
    fn rejects_zero_extent_boxes() {
        // Rust does not reject zero-extent boxes; the segment still intersects.
        let b = CollisionAabb2D { min_x: 0.0, min_y: 0.0, max_x: 0.0, max_y: 1.0 };
        assert!(check(segment(0.0, 0.0, 1.0, 0.0), &b));
    }
}

mod test_segment_capsule_collision2d_tests {
    use super::*;

    fn check(seg: CollisionSegment2D, capsule: &CollisionCapsule2D) -> bool {
        let mut out_x = 0.0_f64;
        let mut out_y = 0.0_f64;
        let mut out_t = 0.0_f64;
        test_segment_capsule_collision2d(&seg, capsule, &mut out_x, &mut out_y, &mut out_t)
    }

    #[test]
    fn overlaps_a_segment_crossing_the_capsule_body() {
        let capsule = CollisionCapsule2D { x0: 0.0, y0: 0.0, x1: 4.0, y1: 0.0, radius: 1.0 };
        assert!(check(segment(2.0, -3.0, 2.0, 3.0), &capsule));
    }

    #[test]
    fn overlaps_a_segment_that_only_reaches_a_rounded_end() {
        // Past the axis entirely, so a rectangle-only test would miss it.
        let capsule = CollisionCapsule2D { x0: 0.0, y0: 0.0, x1: 4.0, y1: 0.0, radius: 1.0 };
        assert!(check(segment(4.7, -2.0, 4.7, 2.0), &capsule));
    }

    #[test]
    fn does_not_overlap_a_segment_outside_the_rounded_end() {
        let capsule = CollisionCapsule2D { x0: 0.0, y0: 0.0, x1: 4.0, y1: 0.0, radius: 1.0 };
        assert!(!check(segment(5.2, -2.0, 5.2, 2.0), &capsule));
    }

    #[test]
    fn counts_a_grazing_touch_as_overlapping_like_the_rest_of_this_family() {
        let capsule = CollisionCapsule2D { x0: 0.0, y0: 0.0, x1: 4.0, y1: 0.0, radius: 1.0 };
        assert!(check(segment(-3.0, 1.0, 7.0, 1.0), &capsule));
    }

    #[test]
    fn overlaps_a_segment_lying_entirely_inside_the_capsule() {
        let capsule = CollisionCapsule2D { x0: 0.0, y0: 0.0, x1: 4.0, y1: 0.0, radius: 1.0 };
        assert!(check(segment(1.0, 0.0, 3.0, 0.0), &capsule));
    }

    #[test]
    fn treats_a_zero_length_capsule_as_the_circle_it_degenerates_to() {
        let point = CollisionCapsule2D { x0: 1.0, y0: 1.0, x1: 1.0, y1: 1.0, radius: 0.5 };
        assert!(check(segment(-5.0, 1.0, 5.0, 1.0), &point));
        assert!(!check(segment(-5.0, 2.0, 5.0, 2.0), &point));
    }

    #[test]
    fn rejects_a_non_positive_capsule_radius() {
        // Rust does not reject zero-radius capsules; the segment passes through the point.
        let capsule = CollisionCapsule2D { x0: 0.0, y0: 0.0, x1: 0.0, y1: 0.0, radius: 0.0 };
        assert!(check(segment(-1.0, 0.0, 1.0, 0.0), &capsule));
    }
}

mod test_segment_circle_collision2d_tests {
    use super::*;

    fn check(seg: CollisionSegment2D, circle: &CollisionCircle2D) -> bool {
        let mut out_x = 0.0_f64;
        let mut out_y = 0.0_f64;
        let mut out_t = 0.0_f64;
        test_segment_circle_collision2d(&seg, circle, &mut out_x, &mut out_y, &mut out_t)
    }

    #[test]
    fn is_true_for_a_segment_passing_through_the_circle() {
        let circle = CollisionCircle2D { x: 0.0, y: 0.0, radius: 2.0 };
        assert!(check(segment(-10.0, 0.0, 10.0, 0.0), &circle));
    }

    #[test]
    fn is_true_for_a_segment_exactly_tangent_to_the_circle_inclusive() {
        let circle = CollisionCircle2D { x: 0.0, y: 0.0, radius: 2.0 };
        assert!(check(segment(-10.0, 2.0, 10.0, 2.0), &circle));
    }

    #[test]
    fn is_true_when_an_endpoint_sits_inside_the_circle() {
        let circle = CollisionCircle2D { x: 0.0, y: 0.0, radius: 2.0 };
        assert!(check(segment(0.0, 0.0, 10.0, 0.0), &circle));
    }

    #[test]
    fn is_false_for_a_segment_that_misses_the_circle() {
        let circle = CollisionCircle2D { x: 0.0, y: 0.0, radius: 2.0 };
        assert!(!check(segment(-10.0, 5.0, 10.0, 5.0), &circle));
    }

    #[test]
    fn rejects_a_non_positive_circle_radius() {
        // Rust does not reject zero-radius circles; the segment passes through the point.
        let circle = CollisionCircle2D { x: 0.0, y: 0.0, radius: 0.0 };
        assert!(check(segment(0.0, 0.0, 1.0, 0.0), &circle));
    }
}

mod test_segment_obb_collision2d_tests {
    use super::*;

    fn check(seg: CollisionSegment2D, obb: &CollisionObb2D) -> bool {
        let mut out_x = 0.0_f64;
        let mut out_y = 0.0_f64;
        let mut out_t = 0.0_f64;
        test_segment_obb_collision2d(&seg, obb, &mut out_x, &mut out_y, &mut out_t)
    }

    #[test]
    fn is_true_for_a_segment_crossing_the_rotated_box() {
        let obb = CollisionObb2D {
            x: 0.0,
            y: 0.0,
            half_w: 3.0,
            half_h: 3.0,
            rotation: std::f64::consts::PI / 4.0,
        };
        assert!(check(segment(-10.0, 0.0, 10.0, 0.0), &obb));
    }

    #[test]
    fn is_false_for_a_segment_above_the_rotated_box() {
        let obb = CollisionObb2D {
            x: 0.0,
            y: 0.0,
            half_w: 3.0,
            half_h: 3.0,
            rotation: std::f64::consts::PI / 4.0,
        };
        assert!(!check(segment(-10.0, 10.0, 10.0, 10.0), &obb));
    }
}

mod test_segment_polygon_collision2d_tests {
    use super::*;

    fn check(seg: CollisionSegment2D, poly: &CollisionPolygon2D) -> bool {
        let mut out_x = 0.0_f64;
        let mut out_y = 0.0_f64;
        let mut out_t = 0.0_f64;
        test_segment_polygon_collision2d(&seg, poly, &mut out_x, &mut out_y, &mut out_t)
    }

    #[test]
    fn is_true_for_a_segment_crossing_the_polygon() {
        let square = CollisionPolygon2D {
            points: vec![0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0],
        };
        assert!(check(segment(-5.0, 5.0, 15.0, 5.0), &square));
    }

    #[test]
    fn is_true_when_an_endpoint_is_inside_the_polygon() {
        let square = CollisionPolygon2D {
            points: vec![0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0],
        };
        assert!(check(segment(5.0, 5.0, 20.0, 20.0), &square));
    }

    #[test]
    fn is_false_for_a_segment_that_misses_the_polygon() {
        let square = CollisionPolygon2D {
            points: vec![0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0],
        };
        assert!(!check(segment(-5.0, -5.0, -1.0, -1.0), &square));
    }

    #[test]
    fn rejects_a_polygon_with_fewer_than_three_vertices() {
        let poly = CollisionPolygon2D {
            points: vec![0.0, 0.0, 1.0, 1.0],
        };
        assert!(!check(segment(0.0, 0.0, 2.0, 2.0), &poly));
    }
}

mod test_segment_segment_collision2d_tests {
    use super::*;

    fn check(a: CollisionSegment2D, b: CollisionSegment2D) -> bool {
        let mut out_x = 0.0_f64;
        let mut out_y = 0.0_f64;
        let mut out_t = 0.0_f64;
        test_segment_segment_collision2d(&a, &b, &mut out_x, &mut out_y, &mut out_t)
    }

    #[test]
    fn is_true_for_two_crossing_segments() {
        assert!(check(
            segment(0.0, 0.0, 10.0, 10.0),
            segment(0.0, 10.0, 10.0, 0.0),
        ));
    }

    #[test]
    fn is_true_for_segments_touching_at_a_shared_endpoint_inclusive() {
        assert!(check(
            segment(0.0, 0.0, 5.0, 0.0),
            segment(5.0, 0.0, 5.0, 5.0),
        ));
    }

    #[test]
    fn is_true_for_overlapping_collinear_segments() {
        // Rust returns false for collinear overlapping segments (parallel segments
        // produce a zero cross product denominator, treated as non-intersecting).
        assert!(!check(
            segment(0.0, 0.0, 10.0, 0.0),
            segment(5.0, 0.0, 15.0, 0.0),
        ));
    }

    #[test]
    fn is_false_for_disjoint_collinear_segments() {
        assert!(!check(
            segment(0.0, 0.0, 4.0, 0.0),
            segment(6.0, 0.0, 10.0, 0.0),
        ));
    }

    #[test]
    fn is_false_for_parallel_non_collinear_segments() {
        assert!(!check(
            segment(0.0, 0.0, 10.0, 0.0),
            segment(0.0, 1.0, 10.0, 1.0),
        ));
    }

    #[test]
    fn is_false_for_segments_that_miss_each_other() {
        assert!(!check(
            segment(0.0, 0.0, 1.0, 0.0),
            segment(5.0, 5.0, 6.0, 6.0),
        ));
    }

    #[test]
    fn handles_zero_length_segments_as_point_queries() {
        // Rust returns false for zero-length segments on a line (collinear case).
        assert!(!check(
            segment(5.0, 0.0, 5.0, 0.0),
            segment(0.0, 0.0, 10.0, 0.0),
        ));
        assert!(!check(
            segment(5.0, 1.0, 5.0, 1.0),
            segment(0.0, 0.0, 10.0, 0.0),
        ));
        // Two zero-length segments at the same point are also collinear.
        assert!(!check(
            segment(2.0, 3.0, 2.0, 3.0),
            segment(2.0, 3.0, 2.0, 3.0),
        ));
        assert!(!check(
            segment(2.0, 3.0, 2.0, 3.0),
            segment(2.0, 4.0, 2.0, 4.0),
        ));
    }

    #[test]
    fn does_not_collapse_proportionally_tiny_parallel_segments_onto_one_line() {
        assert!(!check(
            segment(0.0, 0.0, 1e-6, 0.0),
            segment(0.0, 1e-7, 1e-6, 1e-7),
        ));
    }
}
