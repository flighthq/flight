use flight_meshgeometry::contract::*;

fn normal_offset(geometry: &MeshGeometry) -> usize {
    return geometry
        .layout
        .read()
        .unwrap()
        .attributes
        .iter()
        .find(|a| a.semantic == VertexSemantic::Normal)
        .map(|a| a.byte_offset as usize / 4)
        .unwrap();
}

fn tangent_offset(geometry: &MeshGeometry) -> usize {
    return geometry
        .layout
        .read()
        .unwrap()
        .attributes
        .iter()
        .find(|a| a.semantic == VertexSemantic::Tangent)
        .map(|a| a.byte_offset as usize / 4)
        .unwrap();
}

fn expect_unit_normals(geometry: &MeshGeometry) {
    let count = get_mesh_geometry_vertex_count(geometry);
    let fpv = (geometry.layout.read().unwrap().stride / 4) as usize;
    let noff = normal_offset(geometry);
    for i in 0..count as usize {
        let b = i * fpv + noff;
        let len = (geometry.vertices[b] * geometry.vertices[b]
            + geometry.vertices[b + 1] * geometry.vertices[b + 1]
            + geometry.vertices[b + 2] * geometry.vertices[b + 2])
            .sqrt();
        assert!(
            (len - 1.0).abs() < 0.5e-4,
            "vertex {} normal length {}",
            i,
            len
        );
    }
}

fn expect_unit_tangents(geometry: &MeshGeometry) {
    let count = get_mesh_geometry_vertex_count(geometry);
    let fpv = (geometry.layout.read().unwrap().stride / 4) as usize;
    let toff = tangent_offset(geometry);
    for i in 0..count as usize {
        let b = i * fpv + toff;
        let len = (geometry.vertices[b] * geometry.vertices[b]
            + geometry.vertices[b + 1] * geometry.vertices[b + 1]
            + geometry.vertices[b + 2] * geometry.vertices[b + 2])
            .sqrt();
        assert!(
            (len - 1.0).abs() < 0.5e-4,
            "vertex {} tangent length {}",
            i,
            len
        );
        assert_eq!(
            geometry.vertices[b + 3].abs(),
            1.0,
            "vertex {} tangent.w",
            i
        );
    }
}

fn expect_finite_canonical_record(geometry: &MeshGeometry) {
    for (i, v) in geometry.vertices.iter().enumerate() {
        assert!(v.is_finite(), "vertex float [{}] is not finite: {}", i, v);
    }
}

mod create_box_mesh_geometry {
    use super::*;

    #[test]
    fn builds_24_vertices_36_indices_and_bounds_at_half_extents() {
        let geometry = create_box_mesh_geometry(Some(2.0), Some(4.0), Some(6.0));
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 24);
        assert_eq!(get_mesh_geometry_index_count(&geometry), 36);
        let b = geometry.bounds.as_ref().unwrap();
        assert!((b.min.x - (-1.0)).abs() < 1e-3);
        assert!((b.max.y - 2.0).abs() < 1e-3);
        assert!((b.max.z - 3.0).abs() < 1e-3);
        expect_unit_normals(&geometry);
        expect_unit_tangents(&geometry);
    }
}

mod create_capsule_mesh_geometry {
    use super::*;

    #[test]
    fn clamps_signed_negative_counts_to_the_source_minimum() {
        let actual = create_capsule_mesh_geometry(Some(1.0), Some(1.0), Some(-7), Some(-7));
        let expected = create_capsule_mesh_geometry(Some(1.0), Some(1.0), Some(3), Some(1));
        assert!(validate_mesh_geometry(&actual));
        assert_eq!(actual.vertices, expected.vertices);
        assert_eq!(actual.indices, expected.indices);
    }

    #[test]
    fn builds_a_capsule_spanning_half_height_plus_radius() {
        let geometry = create_capsule_mesh_geometry(Some(0.5), Some(1.0), Some(8), Some(4));
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 90);
        assert_eq!(get_mesh_geometry_index_count(&geometry), 432);
        let b = geometry.bounds.as_ref().unwrap();
        assert!((b.min.y - (-1.0)).abs() < 0.05);
        assert!((b.max.y - 1.0).abs() < 0.05);
        expect_unit_normals(&geometry);
    }
}

mod create_circle_mesh_geometry {
    use super::*;

    #[test]
    fn clamps_signed_negative_counts_to_the_source_minimum() {
        let actual = create_circle_mesh_geometry(Some(1.0), Some(-7));
        let expected = create_circle_mesh_geometry(Some(1.0), Some(3));
        assert!(validate_mesh_geometry(&actual));
        assert_eq!(actual.vertices, expected.vertices);
        assert_eq!(actual.indices, expected.indices);
    }

    #[test]
    fn builds_a_filled_disc_with_segments_triangles() {
        let geometry = create_circle_mesh_geometry(Some(0.5), Some(16));
        assert_eq!(get_mesh_geometry_index_count(&geometry), 48);
        let b = geometry.bounds.as_ref().unwrap();
        assert!((b.max.x - 0.5).abs() < 0.005);
        expect_unit_normals(&geometry);
    }
}

mod create_cone_mesh_geometry {
    use super::*;

    #[test]
    fn clamps_signed_negative_counts_to_the_source_minimum() {
        let actual = create_cone_mesh_geometry(Some(1.0), Some(1.0), Some(-7), Some(true));
        let expected = create_cone_mesh_geometry(Some(1.0), Some(1.0), Some(3), Some(true));
        assert!(validate_mesh_geometry(&actual));
        assert_eq!(actual.vertices, expected.vertices);
        assert_eq!(actual.indices, expected.indices);
    }

    #[test]
    fn builds_a_capped_cone_with_apex_at_plus_y() {
        let geometry = create_cone_mesh_geometry(Some(0.5), Some(2.0), Some(16), Some(true));
        assert!(get_mesh_geometry_vertex_count(&geometry) > 0);
        let b = geometry.bounds.as_ref().unwrap();
        assert!((b.max.y - 1.0).abs() < 1e-3);
        assert!((b.min.y - (-1.0)).abs() < 1e-3);
        expect_unit_normals(&geometry);
    }

    #[test]
    fn emits_no_zero_area_triangle() {
        let geometry = create_cone_mesh_geometry(Some(0.7), Some(1.4), Some(16), Some(true));
        assert_no_degenerate_triangles(&geometry);
    }

    #[test]
    fn emits_no_zero_area_triangle_with_zero_height() {
        let geometry = create_cone_mesh_geometry(Some(0.5), Some(0.0), Some(8), Some(true));
        expect_finite_canonical_record(&geometry);
        assert!(validate_mesh_geometry(&geometry));
        assert_no_degenerate_triangles(&geometry);
    }

    #[test]
    fn keeps_per_segment_apex_vertices_that_carry_distinct_uvs() {
        let geometry = create_cone_mesh_geometry(Some(0.7), Some(1.4), Some(8), Some(true));
        let fpv = (geometry.layout.read().unwrap().stride / 4) as usize;
        let vertex_count = get_mesh_geometry_vertex_count(&geometry) as usize;
        let mut apex_uvs = std::collections::HashSet::new();
        for v in 0..vertex_count {
            let base = v * fpv;
            let horizontal_dist = (geometry.vertices[base] * geometry.vertices[base]
                + geometry.vertices[base + 2] * geometry.vertices[base + 2])
                .sqrt();
            let is_apex = horizontal_dist <= 1e-9 && geometry.vertices[base + 1] > 0.0;
            if is_apex {
                apex_uvs.insert(geometry.vertices[base + 10].to_bits());
            }
        }
        assert!(apex_uvs.len() > 1);
    }
}

mod create_cylinder_mesh_geometry {
    use super::*;

    #[test]
    fn clamps_signed_negative_counts_to_the_source_minimum() {
        let actual =
            create_cylinder_mesh_geometry(Some(1.0), Some(1.0), Some(1.0), Some(-7), Some(true));
        let expected =
            create_cylinder_mesh_geometry(Some(1.0), Some(1.0), Some(1.0), Some(3), Some(true));
        assert!(validate_mesh_geometry(&actual));
        assert_eq!(actual.vertices, expected.vertices);
        assert_eq!(actual.indices, expected.indices);
    }

    #[test]
    fn builds_a_capped_cylinder_bounded_by_radius_and_height() {
        let geometry =
            create_cylinder_mesh_geometry(Some(0.5), Some(0.5), Some(2.0), Some(16), Some(true));
        let b = geometry.bounds.as_ref().unwrap();
        assert!((b.max.y - 1.0).abs() < 1e-3);
        assert!((b.max.x - 0.5).abs() < 0.005);
        expect_unit_normals(&geometry);
        expect_unit_tangents(&geometry);
    }

    #[test]
    fn keeps_records_finite_when_height_is_zero() {
        let geometry =
            create_cylinder_mesh_geometry(Some(0.5), Some(0.5), Some(0.0), Some(8), Some(true));
        expect_finite_canonical_record(&geometry);
        assert!(validate_mesh_geometry(&geometry));
    }

    #[test]
    fn emits_no_zero_area_triangle_with_zero_bottom_radius() {
        let geometry =
            create_cylinder_mesh_geometry(Some(0.5), Some(0.0), Some(1.0), Some(12), Some(true));
        assert_no_degenerate_triangles(&geometry);
    }
}

mod create_dodecahedron_mesh_geometry {
    use super::*;

    #[test]
    fn clamps_signed_negative_counts_to_the_source_minimum() {
        let actual = create_dodecahedron_mesh_geometry(Some(1.0), Some(-7));
        let expected = create_dodecahedron_mesh_geometry(Some(1.0), Some(0));
        assert!(validate_mesh_geometry(&actual));
        assert_eq!(actual.vertices, expected.vertices);
        assert_eq!(actual.indices, expected.indices);
    }

    #[test]
    fn produces_a_non_empty_geometry_with_unit_normals() {
        let geometry = create_dodecahedron_mesh_geometry(Some(0.5), Some(0));
        assert!(get_mesh_geometry_vertex_count(&geometry) > 0);
        expect_unit_normals(&geometry);
    }
}

mod create_icosahedron_mesh_geometry {
    use super::*;

    #[test]
    fn clamps_signed_negative_counts_to_the_source_minimum() {
        let actual = create_icosahedron_mesh_geometry(Some(1.0), Some(-7));
        let expected = create_icosahedron_mesh_geometry(Some(1.0), Some(0));
        assert!(validate_mesh_geometry(&actual));
        assert_eq!(actual.vertices, expected.vertices);
        assert_eq!(actual.indices, expected.indices);
    }

    #[test]
    fn builds_20_triangles_at_detail_0() {
        let geometry = create_icosahedron_mesh_geometry(Some(0.5), Some(0));
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 60);
        expect_unit_normals(&geometry);
    }

    #[test]
    fn lifts_a_seam_face_past_1_rather_than_clamping_it_into_range() {
        let geometry = create_icosahedron_mesh_geometry(Some(1.0), Some(0));
        let fpv = (geometry.layout.read().unwrap().stride / 4) as usize;
        let vertex_count = get_mesh_geometry_vertex_count(&geometry) as usize;
        let mut max_u = f32::NEG_INFINITY;
        for v in 0..vertex_count {
            let u = geometry.vertices[v * fpv + 10];
            if u > max_u {
                max_u = u;
            }
        }
        assert!(max_u > 1.0);
    }
}

mod create_icosphere_mesh_geometry {
    use super::*;

    #[test]
    fn clamps_signed_negative_counts_to_the_source_minimum() {
        let actual = create_icosphere_mesh_geometry(Some(1.0), Some(-7));
        let expected = create_icosphere_mesh_geometry(Some(1.0), Some(0));
        assert!(validate_mesh_geometry(&actual));
        assert_eq!(actual.vertices, expected.vertices);
        assert_eq!(actual.indices, expected.indices);
    }

    #[test]
    fn builds_a_sphere_with_evenly_distributed_vertices() {
        let geometry = create_icosphere_mesh_geometry(Some(1.0), Some(1));
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 240);
        let count = get_mesh_geometry_vertex_count(&geometry);
        let fpv = (geometry.layout.read().unwrap().stride / 4) as usize;
        for i in 0..count as usize {
            let b = i * fpv;
            let r = (geometry.vertices[b] * geometry.vertices[b]
                + geometry.vertices[b + 1] * geometry.vertices[b + 1]
                + geometry.vertices[b + 2] * geometry.vertices[b + 2])
                .sqrt();
            assert!((r - 1.0).abs() < 0.5e-3, "vertex {} radius {}", i, r);
        }
        expect_unit_normals(&geometry);
    }
}

mod create_octahedron_mesh_geometry {
    use super::*;

    #[test]
    fn clamps_signed_negative_counts_to_the_source_minimum() {
        let actual = create_octahedron_mesh_geometry(Some(1.0), Some(-7));
        let expected = create_octahedron_mesh_geometry(Some(1.0), Some(0));
        assert!(validate_mesh_geometry(&actual));
        assert_eq!(actual.vertices, expected.vertices);
        assert_eq!(actual.indices, expected.indices);
    }

    #[test]
    fn builds_8_triangles_at_detail_0() {
        let geometry = create_octahedron_mesh_geometry(Some(0.5), Some(0));
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 24);
        expect_unit_normals(&geometry);
    }
}

mod create_plane_mesh_geometry {
    use super::*;

    #[test]
    fn clamps_signed_negative_counts_to_the_source_minimum() {
        let actual = create_plane_mesh_geometry(Some(1.0), Some(1.0), Some(-7), Some(-7));
        let expected = create_plane_mesh_geometry(Some(1.0), Some(1.0), Some(1), Some(1));
        assert!(validate_mesh_geometry(&actual));
        assert_eq!(actual.vertices, expected.vertices);
        assert_eq!(actual.indices, expected.indices);
    }

    #[test]
    fn builds_a_subdivided_plane_with_plus_y_normals() {
        let geometry = create_plane_mesh_geometry(Some(2.0), Some(2.0), Some(2), Some(2));
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 9);
        assert_eq!(get_mesh_geometry_index_count(&geometry), 24);
        assert!((geometry.vertices[4] - 1.0).abs() < 1e-6);
        let b = geometry.bounds.as_ref().unwrap();
        assert!((b.min.x - (-1.0)).abs() < 1e-3);
        assert!((b.max.z - 1.0).abs() < 1e-3);
    }
}

mod create_polyhedron_mesh_geometry {
    use super::*;

    const TRIANGLE_VERTS: [[f32; 3]; 3] = [[0.0, 1.0, 0.0], [-1.0, -1.0, 0.0], [1.0, -1.0, 0.0]];
    const ONE_FACE: [[u32; 3]; 1] = [[0, 1, 2]];

    #[test]
    fn clamps_signed_negative_counts_to_the_source_minimum() {
        let actual = create_polyhedron_mesh_geometry(
            &[[0.0, 1.0, 0.0], [-1.0, -1.0, 0.0], [1.0, -1.0, 0.0]],
            &[[0, 1, 2]],
            Some(1.0),
            Some(-7),
        );
        let expected = create_polyhedron_mesh_geometry(
            &[[0.0, 1.0, 0.0], [-1.0, -1.0, 0.0], [1.0, -1.0, 0.0]],
            &[[0, 1, 2]],
            Some(1.0),
            Some(0),
        );
        assert!(validate_mesh_geometry(&actual));
        assert_eq!(actual.vertices, expected.vertices);
        assert_eq!(actual.indices, expected.indices);
    }

    #[test]
    fn projects_the_supplied_vertices_onto_the_radius_sphere() {
        let geometry =
            create_polyhedron_mesh_geometry(&TRIANGLE_VERTS, &ONE_FACE, Some(2.0), Some(0));
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 3);
        let fpv = (geometry.layout.read().unwrap().stride / 4) as usize;
        assert!((geometry.vertices[0]).abs() < 0.5e-6);
        assert!((geometry.vertices[1] - 2.0).abs() < 0.5e-6);
        assert!((geometry.vertices[2]).abs() < 0.5e-6);
        for v in 0..3 {
            let base = v * fpv;
            let r = (geometry.vertices[base] * geometry.vertices[base]
                + geometry.vertices[base + 1] * geometry.vertices[base + 1]
                + geometry.vertices[base + 2] * geometry.vertices[base + 2])
                .sqrt();
            assert!((r - 2.0).abs() < 0.5e-6, "vertex {} radius {}", v, r);
            let nlen = (geometry.vertices[base + 3] * geometry.vertices[base + 3]
                + geometry.vertices[base + 4] * geometry.vertices[base + 4]
                + geometry.vertices[base + 5] * geometry.vertices[base + 5])
                .sqrt();
            assert!(
                (nlen - 1.0).abs() < 0.5e-6,
                "vertex {} normal length {}",
                v,
                nlen
            );
        }
    }

    #[test]
    fn produces_different_geometry_for_different_seed_vertices() {
        let a = create_polyhedron_mesh_geometry(&TRIANGLE_VERTS, &ONE_FACE, Some(1.0), Some(0));
        let other_verts: [[f32; 3]; 3] = [[0.0, 0.0, 1.0], [0.0, 1.0, 0.0], [1.0, 0.0, 0.0]];
        let b = create_polyhedron_mesh_geometry(&other_verts, &ONE_FACE, Some(1.0), Some(0));
        assert_ne!(a.vertices, b.vertices);
    }

    #[test]
    fn subdivides_to_expected_vertex_counts() {
        assert_eq!(
            get_mesh_geometry_vertex_count(&create_polyhedron_mesh_geometry(
                &TRIANGLE_VERTS,
                &ONE_FACE,
                Some(1.0),
                Some(0)
            )),
            3
        );
        assert_eq!(
            get_mesh_geometry_vertex_count(&create_polyhedron_mesh_geometry(
                &TRIANGLE_VERTS,
                &ONE_FACE,
                Some(1.0),
                Some(1)
            )),
            12
        );
        assert_eq!(
            get_mesh_geometry_vertex_count(&create_polyhedron_mesh_geometry(
                &TRIANGLE_VERTS,
                &ONE_FACE,
                Some(1.0),
                Some(2)
            )),
            48
        );
    }

    #[test]
    fn keeps_every_subdivided_vertex_on_the_sphere() {
        let geometry =
            create_polyhedron_mesh_geometry(&TRIANGLE_VERTS, &ONE_FACE, Some(3.0), Some(2));
        let fpv = (geometry.layout.read().unwrap().stride / 4) as usize;
        let count = get_mesh_geometry_vertex_count(&geometry);
        for v in 0..count as usize {
            let base = v * fpv;
            let r = (geometry.vertices[base] * geometry.vertices[base]
                + geometry.vertices[base + 1] * geometry.vertices[base + 1]
                + geometry.vertices[base + 2] * geometry.vertices[base + 2])
                .sqrt();
            assert!((r - 3.0).abs() < 0.5e-5, "vertex {} radius {}", v, r);
        }
    }
}

mod create_quad_mesh_geometry {
    use super::*;

    #[test]
    fn builds_a_unit_quad_in_xy_plane_with_plus_z_normals() {
        let geometry = create_quad_mesh_geometry(Some(1.0), Some(1.0));
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 4);
        assert_eq!(get_mesh_geometry_index_count(&geometry), 6);
        assert!((geometry.vertices[5] - 1.0).abs() < 1e-6);
        expect_unit_tangents(&geometry);
    }
}

mod create_ring_mesh_geometry {
    use super::*;

    #[test]
    fn clamps_signed_negative_counts_to_the_source_minimum() {
        let actual = create_ring_mesh_geometry(Some(1.0), Some(1.0), Some(-7));
        let expected = create_ring_mesh_geometry(Some(1.0), Some(1.0), Some(3));
        assert!(validate_mesh_geometry(&actual));
        assert_eq!(actual.vertices, expected.vertices);
        assert_eq!(actual.indices, expected.indices);
    }

    #[test]
    fn builds_a_ring_bounded_by_outer_radius() {
        let geometry = create_ring_mesh_geometry(Some(0.25), Some(0.5), Some(16));
        assert!(get_mesh_geometry_vertex_count(&geometry) > 0);
        let b = geometry.bounds.as_ref().unwrap();
        assert!((b.max.x - 0.5).abs() < 0.005);
        expect_unit_normals(&geometry);
    }
}

mod create_sphere_mesh_geometry {
    use super::*;

    #[test]
    fn clamps_signed_negative_counts_to_the_source_minimum() {
        let actual = create_sphere_mesh_geometry(Some(1.0), Some(-7), Some(-7));
        let expected = create_sphere_mesh_geometry(Some(1.0), Some(1), Some(2));
        assert!(validate_mesh_geometry(&actual));
        assert_eq!(actual.vertices, expected.vertices);
        assert_eq!(actual.indices, expected.indices);
    }

    #[test]
    fn builds_a_sphere_whose_vertices_lie_on_the_radius() {
        let geometry = create_sphere_mesh_geometry(Some(1.0), Some(16), Some(8));
        let count = get_mesh_geometry_vertex_count(&geometry);
        let fpv = (geometry.layout.read().unwrap().stride / 4) as usize;
        for i in 0..count as usize {
            let b = i * fpv;
            let r = (geometry.vertices[b] * geometry.vertices[b]
                + geometry.vertices[b + 1] * geometry.vertices[b + 1]
                + geometry.vertices[b + 2] * geometry.vertices[b + 2])
                .sqrt();
            assert!((r - 1.0).abs() < 0.5e-4, "vertex {} radius {}", i, r);
        }
        expect_unit_normals(&geometry);
    }
}

mod create_tetrahedron_mesh_geometry {
    use super::*;

    #[test]
    fn clamps_signed_negative_counts_to_the_source_minimum() {
        let actual = create_tetrahedron_mesh_geometry(Some(1.0), Some(-7));
        let expected = create_tetrahedron_mesh_geometry(Some(1.0), Some(0));
        assert!(validate_mesh_geometry(&actual));
        assert_eq!(actual.vertices, expected.vertices);
        assert_eq!(actual.indices, expected.indices);
    }

    #[test]
    fn builds_4_triangles_at_detail_0() {
        let geometry = create_tetrahedron_mesh_geometry(Some(0.5), Some(0));
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 12);
        expect_unit_normals(&geometry);
    }
}

mod create_torus_knot_mesh_geometry {
    use super::*;

    #[test]
    fn clamps_signed_negative_counts_to_the_source_minimum() {
        let actual = create_torus_knot_mesh_geometry(
            Some(1.0),
            Some(1.0),
            Some(-7),
            Some(-7),
            Some(1.0),
            Some(1.0),
        );
        let expected = create_torus_knot_mesh_geometry(
            Some(1.0),
            Some(1.0),
            Some(3),
            Some(3),
            Some(1.0),
            Some(1.0),
        );
        assert!(validate_mesh_geometry(&actual));
        assert_eq!(actual.vertices, expected.vertices);
        assert_eq!(actual.indices, expected.indices);
    }

    #[test]
    fn produces_a_non_empty_geometry() {
        let geometry = create_torus_knot_mesh_geometry(
            Some(0.5),
            Some(0.15),
            Some(32),
            Some(8),
            Some(2.0),
            Some(3.0),
        );
        assert!(get_mesh_geometry_vertex_count(&geometry) > 0);
        assert!(get_mesh_geometry_index_count(&geometry) > 0);
    }
}

mod create_torus_mesh_geometry {
    use super::*;

    #[test]
    fn clamps_signed_negative_counts_to_the_source_minimum() {
        let actual = create_torus_mesh_geometry(Some(1.0), Some(1.0), Some(-7), Some(-7));
        let expected = create_torus_mesh_geometry(Some(1.0), Some(1.0), Some(3), Some(3));
        assert!(validate_mesh_geometry(&actual));
        assert_eq!(actual.vertices, expected.vertices);
        assert_eq!(actual.indices, expected.indices);
    }

    #[test]
    fn builds_a_torus_bounded_by_radius_plus_tube() {
        let geometry = create_torus_mesh_geometry(Some(0.5), Some(0.2), Some(12), Some(24));
        let b = geometry.bounds.as_ref().unwrap();
        assert!((b.max.x - 0.7).abs() < 0.005);
        assert!((b.max.z - 0.2).abs() < 0.005);
        expect_unit_normals(&geometry);
    }
}

fn assert_no_degenerate_triangles(geometry: &MeshGeometry) {
    let fpv = (geometry.layout.read().unwrap().stride / 4) as usize;
    let mut triangles = 0u32;
    let tri_count = get_mesh_geometry_triangle_count(geometry);
    let mut corner = MeshTriangleVertexIndices {
        i0: 0,
        i1: 0,
        i2: 0,
    };
    for t in 0..tri_count {
        if !get_mesh_geometry_triangle_vertex_indices(&mut corner, geometry, t) {
            continue;
        }
        triangles += 1;
        let p0 = [
            geometry.vertices[corner.i0 as usize * fpv],
            geometry.vertices[corner.i0 as usize * fpv + 1],
            geometry.vertices[corner.i0 as usize * fpv + 2],
        ];
        let p1 = [
            geometry.vertices[corner.i1 as usize * fpv],
            geometry.vertices[corner.i1 as usize * fpv + 1],
            geometry.vertices[corner.i1 as usize * fpv + 2],
        ];
        let p2 = [
            geometry.vertices[corner.i2 as usize * fpv],
            geometry.vertices[corner.i2 as usize * fpv + 1],
            geometry.vertices[corner.i2 as usize * fpv + 2],
        ];
        let e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
        let e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
        let cross = [
            e1[1] * e2[2] - e1[2] * e2[1],
            e1[2] * e2[0] - e1[0] * e2[2],
            e1[0] * e2[1] - e1[1] * e2[0],
        ];
        let area = (cross[0] * cross[0] + cross[1] * cross[1] + cross[2] * cross[2]).sqrt();
        assert!(area > 1e-12, "triangle {} has zero area", t);
    }
    assert!(triangles > 0, "no triangles found");
}
