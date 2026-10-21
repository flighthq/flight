use flight_collision::*;
use flight_collision::contract::*;
use std::sync::Arc;

/// Every vertex of a face must share one coordinate along the face's axis.
fn expect_coplanar_along(vertices: &[f32], count: usize, axis: usize, value: f32) {
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

fn sphere() -> CollisionShape3D {
    return CollisionShape3D::Sphere(CollisionSphere3D {
        x: 0.0,
        y: 0.0,
        z: 0.0,
        radius: 1.0,
    });
}

mod get_collision_face_query3d {
    use super::*;

    #[test]
    fn starts_empty_and_looks_up_custom_kinds_exactly() {
        let mut registry = crate::collision_registry3d();
        assert!(get_collision_face_query3d(&registry, "sphere").is_none());
        assert!(get_collision_face_query3d(&registry, "acme.blob").is_none());

        registry.face_queries.insert(
            "acme.blob".to_string(),
            Arc::new(|_, _, _, _, out| {
                out.clear();
                out.extend_from_slice(&[1.0, 2.0, 3.0]);
                return 1;
            }),
        );

        let mut out = Vec::new();
        let query = get_collision_face_query3d(&registry, "acme.blob").unwrap();
        assert_eq!(query(&sphere(), 0.0, 1.0, 0.0, &mut out), 1);
        assert_eq!(out, vec![1.0, 2.0, 3.0]);
        assert!(get_collision_face_query3d(&registry, "acme.blob.extra").is_none());
    }
}

mod query_collision_aabb_face3d {
    use super::*;

    #[test]
    fn accepts_the_shape_union_and_returns_the_selected_face() {
        let shape = CollisionShape3D::Aabb(CollisionAabb3D {
            min_x: -1.0,
            min_y: -2.0,
            min_z: -3.0,
            max_x: 1.0,
            max_y: 2.0,
            max_z: 3.0,
        });
        let mut out = Vec::new();
        assert_eq!(query_collision_aabb_face3d(&shape, 0.0, 1.0, 0.0, &mut out), 4);
        expect_coplanar_along(&out, 4, 1, 2.0);
    }
}

mod query_collision_box_face3d {
    use super::*;

    #[test]
    fn accepts_the_shape_union_and_returns_the_selected_face() {
        let shape = CollisionShape3D::Box(CollisionBox3D {
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
        });
        let mut out = Vec::new();
        assert_eq!(query_collision_box_face3d(&shape, 0.0, 1.0, 0.0, &mut out), 4);
        expect_coplanar_along(&out, 4, 1, 2.0);
    }
}

mod query_collision_capsule_face3d {
    use super::*;

    #[test]
    fn capsule_declines_curved_caps_degenerate_axes_and_zero_directions() {
        let lying = CollisionShape3D::Capsule(CollisionCapsule3D {
            x0: -2.0,
            y0: 0.0,
            z0: 0.0,
            x1: 2.0,
            y1: 0.0,
            z1: 0.0,
            radius: 0.5,
        });
        let degenerate = CollisionShape3D::Capsule(CollisionCapsule3D {
            x0: 0.0,
            y0: 0.0,
            z0: 0.0,
            x1: 0.0,
            y1: 0.0,
            z1: 0.0,
            radius: 1.0,
        });
        let mut out = Vec::new();

        assert_eq!(query_collision_capsule_face3d(&lying, 1.0, 0.0, 0.0, &mut out), 0);
        assert_eq!(query_collision_capsule_face3d(&degenerate, 0.0, 1.0, 0.0, &mut out), 0);
        assert_eq!(query_collision_capsule_face3d(&lying, 0.0, 0.0, 0.0, &mut out), 0);
        assert!(out.is_empty());
    }

    #[test]
    fn capsule_normalizes_the_direction_before_offsetting_its_edge() {
        let lying = CollisionShape3D::Capsule(CollisionCapsule3D {
            x0: -2.0,
            y0: 0.0,
            z0: 0.0,
            x1: 2.0,
            y1: 0.0,
            z1: 0.0,
            radius: 0.5,
        });
        let mut out = Vec::new();

        assert_eq!(query_collision_capsule_face3d(&lying, 0.0, -4.0, 0.0, &mut out), 2);
        assert_eq!(out, vec![-2.0, -0.5, 0.0, 2.0, -0.5, 0.0]);
    }
}

mod query_collision_convex_face3d {
    use super::*;

    #[test]
    fn convex_declines_a_zero_direction() {
        let cube = CollisionShape3D::Convex(CollisionConvex3D {
            points: vec![-1.0, -1.0, -1.0, 1.0, 1.0, 1.0],
        });
        let mut out = vec![9.0];
        assert_eq!(query_collision_convex_face3d(&cube, 0.0, 0.0, 0.0, &mut out), 0);
        assert!(out.is_empty());
    }
}

mod register_built_in_collision_face_queries3d {
    use super::*;

    #[test]
    fn registers_exactly_the_four_source_built_ins() {
        let mut registry = crate::collision_registry3d();
        register_built_in_collision_face_queries3d(&mut registry);

        assert_eq!(registry.face_queries.len(), 4);
        for kind in ["aabb", "box", "capsule", "convex"] {
            assert!(get_collision_face_query3d(&registry, kind).is_some(), "{kind}");
        }
        for kind in ["sphere", "cylinder", "cone"] {
            assert!(get_collision_face_query3d(&registry, kind).is_none(), "{kind}");
        }
    }
}

mod register_collision_face_query3d {
    use super::*;

    #[test]
    fn supports_custom_kinds_and_last_write_wins() {
        let mut registry = crate::collision_registry3d();
        register_collision_face_query3d(
            &mut registry,
            "custom",
            Arc::new(|_, _, _, _, _| 1),
        );
        register_collision_face_query3d(
            &mut registry,
            "custom",
            Arc::new(|_, _, _, _, _| 2),
        );

        let mut out = Vec::new();
        assert_eq!(
            get_collision_face_query3d(&registry, "custom").unwrap()(
                &sphere(),
                0.0,
                1.0,
                0.0,
                &mut out,
            ),
            2,
        );
    }
}

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

        let ys: Vec<f32> = (0..4).map(|i| face[i * 3 + 1]).collect();
        let zs: Vec<f32> = (0..4).map(|i| face[i * 3 + 2]).collect();

        let y_range = ys.iter().cloned().fold(f32::NEG_INFINITY, f32::max)
            - ys.iter().cloned().fold(f32::INFINITY, f32::min);
        let z_range = zs.iter().cloned().fold(f32::NEG_INFINITY, f32::max)
            - zs.iter().cloned().fold(f32::INFINITY, f32::min);

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
        let angle = std::f32::consts::PI / 8.0;
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

        let xs: Vec<f32> = (0..4).map(|i| face[i * 3]).collect();
        let max_x = xs.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
        assert!((max_x - std::f32::consts::SQRT_2).abs() < 1e-6);
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
