use flight_collision::*;

mod write_aabb_vertices_test {
    use super::*;

    #[test]
    fn writes_the_four_corners_counter_clockwise_from_the_min_corner() {
        let mut out = [0.0_f64; 8];
        let aabb = CollisionAabb2D {
            min_x: 1.0,
            min_y: 2.0,
            max_x: 5.0,
            max_y: 8.0,
        };
        write_aabb_vertices(&aabb, &mut out);
        assert_eq!(out, [1.0, 2.0, 5.0, 2.0, 5.0, 8.0, 1.0, 8.0]);
    }

    #[test]
    fn writes_a_degenerate_box_as_four_coincident_corners_rather_than_skipping_any() {
        let mut out = [0.0_f64; 8];
        let aabb = CollisionAabb2D {
            min_x: 3.0,
            min_y: 3.0,
            max_x: 3.0,
            max_y: 3.0,
        };
        write_aabb_vertices(&aabb, &mut out);
        assert_eq!(out, [3.0, 3.0, 3.0, 3.0, 3.0, 3.0, 3.0, 3.0]);
    }
}

mod write_obb_vertices_test {
    use super::*;

    #[test]
    fn matches_the_equivalent_axis_aligned_box_at_zero_rotation() {
        let mut obb_out = [0.0_f64; 8];
        let mut aabb_out = [0.0_f64; 8];
        write_obb_vertices(
            &CollisionObb2D {
                x: 3.0,
                y: 4.0,
                half_w: 1.0,
                half_h: 2.0,
                rotation: 0.0,
            },
            &mut obb_out,
        );
        write_aabb_vertices(
            &CollisionAabb2D {
                min_x: 2.0,
                min_y: 2.0,
                max_x: 4.0,
                max_y: 6.0,
            },
            &mut aabb_out,
        );
        for i in 0..8 {
            assert!(
                (obb_out[i] - aabb_out[i]).abs() < 1e-10,
                "mismatch at index {}: obb={} aabb={}",
                i,
                obb_out[i],
                aabb_out[i]
            );
        }
    }

    #[test]
    fn rotates_the_corners_about_the_center_preserving_the_distance_to_it() {
        let mut out = [0.0_f64; 8];
        let obb = CollisionObb2D {
            x: 0.0,
            y: 0.0,
            half_w: 3.0,
            half_h: 4.0,
            rotation: std::f64::consts::PI / 3.0,
        };
        write_obb_vertices(&obb, &mut out);
        let expected = (3.0_f64 * 3.0 + 4.0 * 4.0).sqrt();
        for i in 0..4 {
            let x = out[i * 2];
            let y = out[i * 2 + 1];
            let dist = (x * x + y * y).sqrt();
            assert!(
                (dist - expected).abs() < 1e-10,
                "corner {} distance {} != expected {}",
                i,
                dist,
                expected
            );
        }
    }

    #[test]
    fn turns_a_quarter_rotation_into_a_swap_of_the_half_extents() {
        let mut out = [0.0_f64; 8];
        write_obb_vertices(
            &CollisionObb2D {
                x: 0.0,
                y: 0.0,
                half_w: 1.0,
                half_h: 5.0,
                rotation: std::f64::consts::PI / 2.0,
            },
            &mut out,
        );
        let mut max_x = f64::NEG_INFINITY;
        let mut max_y = f64::NEG_INFINITY;
        for i in 0..4 {
            if out[i * 2] > max_x {
                max_x = out[i * 2];
            }
            if out[i * 2 + 1] > max_y {
                max_y = out[i * 2 + 1];
            }
        }
        assert!(
            (max_x - 5.0).abs() < 1e-10,
            "max_x {} != 5.0",
            max_x
        );
        assert!(
            (max_y - 1.0).abs() < 1e-10,
            "max_y {} != 1.0",
            max_y
        );
    }
}
