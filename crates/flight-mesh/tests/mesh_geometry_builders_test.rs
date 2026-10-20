use flight_mesh::*;

fn expect_unit_normals(geometry: &MeshGeometry) {
    let count = get_mesh_geometry_vertex_count(geometry);
    let stride = 12usize;
    for i in 0..count as usize {
        let b = i * stride + 3;
        let len = (geometry.vertices[b] * geometry.vertices[b]
            + geometry.vertices[b + 1] * geometry.vertices[b + 1]
            + geometry.vertices[b + 2] * geometry.vertices[b + 2])
            .sqrt();
        assert!((len - 1.0).abs() < 1e-3, "vertex {} normal length {}", i, len);
    }
}

mod create_box_mesh_geometry_test {
    use super::*;

    #[test]
    fn builds_24_vertices_36_indices() {
        let geometry = create_box_mesh_geometry(2.0, 4.0, 6.0);
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 24);
        assert_eq!(get_mesh_geometry_index_count(&geometry), 36);
        let b = geometry.bounds.unwrap();
        assert!((b.min.x - (-1.0)).abs() < 1e-3);
        assert!((b.max.y - 2.0).abs() < 1e-3);
        assert!((b.max.z - 3.0).abs() < 1e-3);
        expect_unit_normals(&geometry);
    }
}

mod create_sphere_mesh_geometry_test {
    use super::*;

    #[test]
    fn vertices_lie_on_the_radius() {
        let geometry = create_sphere_mesh_geometry(1.0, 16, 8);
        let count = get_mesh_geometry_vertex_count(&geometry);
        for i in 0..count as usize {
            let b = i * 12;
            let r = (geometry.vertices[b] * geometry.vertices[b]
                + geometry.vertices[b + 1] * geometry.vertices[b + 1]
                + geometry.vertices[b + 2] * geometry.vertices[b + 2])
                .sqrt();
            assert!((r - 1.0).abs() < 1e-3, "vertex {} radius {}", i, r);
        }
        expect_unit_normals(&geometry);
    }
}

mod create_plane_mesh_geometry_test {
    use super::*;

    #[test]
    fn builds_subdivided_plane() {
        let geometry = create_plane_mesh_geometry(2.0, 2.0, 2, 2);
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 9);
        assert_eq!(get_mesh_geometry_index_count(&geometry), 24);
        assert!((geometry.vertices[4] - 1.0).abs() < 1e-6);
    }
}

mod create_quad_mesh_geometry_test {
    use super::*;

    #[test]
    fn builds_a_unit_quad() {
        let geometry = create_quad_mesh_geometry(1.0, 1.0);
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 4);
        assert_eq!(get_mesh_geometry_index_count(&geometry), 6);
    }
}

mod create_icosahedron_mesh_geometry_test {
    use super::*;

    #[test]
    fn builds_20_triangles_at_detail_0() {
        let geometry = create_icosahedron_mesh_geometry(0.5, 0);
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 60);
        expect_unit_normals(&geometry);
    }
}

mod create_icosphere_mesh_geometry_test {
    use super::*;

    #[test]
    fn builds_sphere_with_subdivisions() {
        let geometry = create_icosphere_mesh_geometry(1.0, 1);
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 240);
        let count = get_mesh_geometry_vertex_count(&geometry);
        for i in 0..count as usize {
            let b = i * 12;
            let r = (geometry.vertices[b] * geometry.vertices[b]
                + geometry.vertices[b + 1] * geometry.vertices[b + 1]
                + geometry.vertices[b + 2] * geometry.vertices[b + 2])
                .sqrt();
            assert!((r - 1.0).abs() < 1e-2, "vertex {} radius {}", i, r);
        }
    }
}

mod create_tetrahedron_mesh_geometry_test {
    use super::*;

    #[test]
    fn builds_4_triangles() {
        let geometry = create_tetrahedron_mesh_geometry(0.5, 0);
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 12);
        expect_unit_normals(&geometry);
    }
}

mod create_octahedron_mesh_geometry_test {
    use super::*;

    #[test]
    fn builds_8_triangles() {
        let geometry = create_octahedron_mesh_geometry(0.5, 0);
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 24);
        expect_unit_normals(&geometry);
    }
}

mod create_torus_mesh_geometry_test {
    use super::*;

    #[test]
    fn bounded_by_radius_plus_tube() {
        let geometry = create_torus_mesh_geometry(0.5, 0.2, 12, 24);
        let b = geometry.bounds.unwrap();
        assert!((b.max.x - 0.7).abs() < 0.05);
        assert!((b.max.z - 0.2).abs() < 0.05);
    }
}

mod create_cylinder_mesh_geometry_test {
    use super::*;

    #[test]
    fn builds_capped_cylinder() {
        let geometry = create_cylinder_mesh_geometry(0.5, 0.5, 2.0, 16, true);
        let b = geometry.bounds.unwrap();
        assert!((b.max.y - 1.0).abs() < 1e-3);
        assert!((b.max.x - 0.5).abs() < 0.05);
        expect_unit_normals(&geometry);
    }
}

mod create_capsule_mesh_geometry_test {
    use super::*;

    #[test]
    fn builds_capsule() {
        let geometry = create_capsule_mesh_geometry(0.5, 1.0, 8, 4);
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 90);
        assert_eq!(get_mesh_geometry_index_count(&geometry), 432);
        let b = geometry.bounds.unwrap();
        assert!((b.min.y - (-1.0)).abs() < 0.1);
        assert!((b.max.y - 1.0).abs() < 0.1);
        expect_unit_normals(&geometry);
    }
}

mod create_ring_mesh_geometry_test {
    use super::*;

    #[test]
    fn bounded_by_outer_radius() {
        let geometry = create_ring_mesh_geometry(0.25, 0.5, 16);
        assert!(get_mesh_geometry_vertex_count(&geometry) > 0);
        let b = geometry.bounds.unwrap();
        assert!((b.max.x - 0.5).abs() < 0.05);
    }
}

mod create_circle_mesh_geometry_test {
    use super::*;

    #[test]
    fn builds_filled_disc() {
        let geometry = create_circle_mesh_geometry(0.5, 16);
        assert_eq!(get_mesh_geometry_index_count(&geometry), 48);
        let b = geometry.bounds.unwrap();
        assert!((b.max.x - 0.5).abs() < 0.05);
    }
}

mod create_cone_mesh_geometry_test {
    use super::*;

    #[test]
    fn builds_capped_cone() {
        let geometry = create_cone_mesh_geometry(0.5, 2.0, 16, true);
        assert!(get_mesh_geometry_vertex_count(&geometry) > 0);
        let b = geometry.bounds.unwrap();
        assert!((b.max.y - 1.0).abs() < 1e-3);
        assert!((b.min.y - (-1.0)).abs() < 1e-3);
        expect_unit_normals(&geometry);
    }
}

mod create_torus_knot_mesh_geometry_test {
    use super::*;

    #[test]
    fn produces_non_empty_geometry() {
        let geometry = create_torus_knot_mesh_geometry(0.5, 0.15, 32, 8, 2.0, 3.0);
        assert!(get_mesh_geometry_vertex_count(&geometry) > 0);
        assert!(get_mesh_geometry_index_count(&geometry) > 0);
    }
}
