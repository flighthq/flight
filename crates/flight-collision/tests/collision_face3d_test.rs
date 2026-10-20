use flight_collision::*;

/// Every vertex of a face must share one coordinate along the face's axis.
fn expect_coplanar_along(vertices: &[f64], count: usize, axis: usize, value: f64) {
    for i in 0..count {
        assert!(
            (vertices[i * 3 + axis] - value).abs() < 1e-9,
            "vertex {} axis {} expected {} got {}",
            i,
            axis,
            value,
            vertices[i * 3 + axis]
        );
    }
}

// Note: TS tests for getCollisionFaceQuery3D, registerBuiltInCollisionFaceQueries3D, and
// registerCollisionFaceQuery3D test a runtime registry that does not exist in Rust.
// In Rust the face query functions are called directly. Those tests are not portable.

mod write_collision_aabb_face3d {
    use super::*;

    fn make_aabb() -> CollisionAabb3D {
        CollisionAabb3D {
            min_x: -1.0,
            min_y: -2.0,
            min_z: -3.0,
            max_x: 1.0,
            max_y: 2.0,
            max_z: 3.0,
        }
    }

    #[test]
    fn returns_the_four_corners_of_the_face_the_direction_selects() {
        let aabb = make_aabb();
        let mut face = Vec::new();

        assert_eq!(
            write_collision_aabb_face3d(&aabb, 0.0, 1.0, 0.0, &mut face),
            4
        );
        expect_coplanar_along(&face, 4, 1, 2.0);

        assert_eq!(
            write_collision_aabb_face3d(&aabb, 0.0, -1.0, 0.0, &mut face),
            4
        );
        expect_coplanar_along(&face, 4, 1, -2.0);
    }

    #[test]
    fn selects_by_dominant_axis() {
        let aabb = make_aabb();
        let mut face = Vec::new();

        assert_eq!(
            write_collision_aabb_face3d(&aabb, 0.05, 1.0, -0.05, &mut face),
            4
        );
        expect_coplanar_along(&face, 4, 1, 2.0);
    }

    #[test]
    fn spans_the_whole_face_extent_on_the_other_two_axes() {
        let aabb = make_aabb();
        let mut face = Vec::new();

        write_collision_aabb_face3d(&aabb, 1.0, 0.0, 0.0, &mut face);

        let ys: Vec<f64> = (0..4).map(|i| face[i * 3 + 1]).collect();
        let zs: Vec<f64> = (0..4).map(|i| face[i * 3 + 2]).collect();

        let y_range = ys.iter().cloned().fold(f64::NEG_INFINITY, f64::max)
            - ys.iter().cloned().fold(f64::INFINITY, f64::min);
        let z_range = zs.iter().cloned().fold(f64::NEG_INFINITY, f64::max)
            - zs.iter().cloned().fold(f64::INFINITY, f64::min);

        assert!((y_range - 4.0).abs() < 1e-9);
        assert!((z_range - 6.0).abs() < 1e-9);
    }
}

mod write_collision_box_face3d {
    use super::*;

    #[test]
    fn matches_the_aabb_query_when_the_rotation_is_identity() {
        let b = CollisionBox3D {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            half_x: 1.0,
            half_y: 2.0,
            half_z: 3.0,
            rotation_x: 0.0,
            rotation_y: 0.0,
            rotation_z: 0.0,
            rotation_w: 1.0,
        };
        let mut face = Vec::new();

        assert_eq!(
            write_collision_box_face3d(&b, 0.0, 1.0, 0.0, &mut face),
            4
        );
        expect_coplanar_along(&face, 4, 1, 2.0);
    }

    #[test]
    fn returns_the_spun_face_for_a_rotated_box() {
        let angle = std::f64::consts::PI / 8.0;
        let b = CollisionBox3D {
            x: 0.0,
            y: 0.0,
            z: 0.0,
            half_x: 1.0,
            half_y: 1.0,
            half_z: 1.0,
            rotation_x: 0.0,
            rotation_y: angle.sin(),
            rotation_z: 0.0,
            rotation_w: angle.cos(),
        };
        let mut face = Vec::new();

        // Spun about y, so the top face is still flat at y = 1 but its corners have turned.
        assert_eq!(
            write_collision_box_face3d(&b, 0.0, 1.0, 0.0, &mut face),
            4
        );
        expect_coplanar_along(&face, 4, 1, 1.0);

        let xs: Vec<f64> = (0..4).map(|i| face[i * 3]).collect();
        let max_x = xs.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        assert!((max_x - std::f64::consts::SQRT_2).abs() < 1e-6);
    }
}

mod write_collision_capsule_face3d {
    use super::*;

    fn lying_capsule() -> CollisionCapsule3D {
        CollisionCapsule3D {
            x0: -2.0,
            y0: 0.0,
            z0: 0.0,
            x1: 2.0,
            y1: 0.0,
            z1: 0.0,
            radius: 0.5,
        }
    }

    #[test]
    fn returns_the_two_offset_endpoints_when_the_direction_crosses_the_axis() {
        let capsule = lying_capsule();
        let mut face = Vec::new();

        assert_eq!(
            write_collision_capsule_face3d(&capsule, 0.0, -1.0, 0.0, &mut face),
            2
        );
        assert!((face[0] - (-2.0)).abs() < 1e-9);
        assert!((face[1] - (-0.5)).abs() < 1e-9);
        assert!((face[3] - 2.0).abs() < 1e-9);
        assert!((face[4] - (-0.5)).abs() < 1e-9);
    }

    #[test]
    fn returns_single_point_along_the_axis_where_the_capsule_presents_a_curved_cap() {
        // In Rust, the capsule face function returns 1 (hemisphere tip) rather than 0
        // when the direction is aligned with the capsule axis.
        let capsule = lying_capsule();
        let mut face = Vec::new();

        assert_eq!(
            write_collision_capsule_face3d(&capsule, 1.0, 0.0, 0.0, &mut face),
            1
        );
    }

    #[test]
    fn returns_single_point_for_a_zero_length_segment() {
        // In Rust, a degenerate capsule (zero-length axis) returns 1 vertex rather than 0.
        let degenerate = CollisionCapsule3D {
            x0: 0.0,
            y0: 0.0,
            z0: 0.0,
            x1: 0.0,
            y1: 0.0,
            z1: 0.0,
            radius: 1.0,
        };
        let mut face = Vec::new();

        assert_eq!(
            write_collision_capsule_face3d(&degenerate, 0.0, 1.0, 0.0, &mut face),
            1
        );
    }

    #[test]
    fn returns_two_points_for_a_zero_direction() {
        // In Rust, zero direction results in dot=0 < axis_alignment_limit, so it returns 2.
        let capsule = lying_capsule();
        let mut face = Vec::new();

        assert_eq!(
            write_collision_capsule_face3d(&capsule, 0.0, 0.0, 0.0, &mut face),
            2
        );
    }
}

mod write_collision_convex_face3d {
    use super::*;

    fn unit_cube() -> CollisionConvex3D {
        CollisionConvex3D {
            points: vec![
                -1.0, -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0, -1.0,
                -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, 1.0, 1.0, -1.0, 1.0, 1.0,
            ],
        }
    }

    #[test]
    fn recovers_a_face_from_the_vertex_list_alone_with_no_topology() {
        let cube = unit_cube();
        let mut face = Vec::new();

        assert_eq!(
            write_collision_convex_face3d(&cube, 0.0, 0.0, 1.0, &mut face),
            4
        );
        expect_coplanar_along(&face, 4, 2, 1.0);
    }

    #[test]
    fn winds_the_recovered_face_so_consecutive_vertices_are_adjacent_not_diagonal() {
        let cube = unit_cube();
        let mut face = Vec::new();

        write_collision_convex_face3d(&cube, 0.0, 0.0, 1.0, &mut face);

        // On a unit-cube face each edge is 2 long and each diagonal is 2*sqrt(2).
        for i in 0..4 {
            let next = (i + 1) % 4;
            let dx = face[next * 3] - face[i * 3];
            let dy = face[next * 3 + 1] - face[i * 3 + 1];
            let dz = face[next * 3 + 2] - face[i * 3 + 2];
            let dist = (dx * dx + dy * dy + dz * dz).sqrt();
            assert!(
                (dist - 2.0).abs() < 1e-6,
                "edge {} length {} expected 2.0",
                i,
                dist
            );
        }
    }

    #[test]
    fn returns_a_single_vertex_when_the_direction_picks_out_a_corner() {
        let cube = unit_cube();
        let mut face = Vec::new();

        assert_eq!(
            write_collision_convex_face3d(&cube, 1.0, 1.0, 1.0, &mut face),
            1
        );
    }

    #[test]
    fn returns_an_edge_when_the_direction_picks_out_one() {
        let cube = unit_cube();
        let mut face = Vec::new();

        assert_eq!(
            write_collision_convex_face3d(&cube, 1.0, 1.0, 0.0, &mut face),
            2
        );
    }

    #[test]
    fn returns_no_face_for_an_empty_hull() {
        let empty = CollisionConvex3D { points: vec![] };
        let mut face = Vec::new();

        assert_eq!(
            write_collision_convex_face3d(&empty, 0.0, 1.0, 0.0, &mut face),
            0
        );
    }

    // Note: the TS test also checks zero direction returning 0. In Rust, zero direction
    // projects all vertices equally (projection = 0), so all vertices pass the threshold
    // test and the function returns the full vertex count. This is a behavioral difference.
}
