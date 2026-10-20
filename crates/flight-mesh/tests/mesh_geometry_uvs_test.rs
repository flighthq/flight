use flight_mesh::*;

mod offset_mesh_geometry_uvs_test {
    use super::*;

    #[test]
    fn offsets_uv0_by_delta() {
        let mut geometry = create_quad_mesh_geometry(1.0, 1.0);
        let uv_offset = 10usize;
        let u0_before = geometry.vertices[uv_offset];
        let v0_before = geometry.vertices[uv_offset + 1];
        let v0 = geometry.version;
        offset_mesh_geometry_uvs(&mut geometry, 0.5, 0.25);
        assert!((geometry.vertices[uv_offset] - (u0_before + 0.5)).abs() < 1e-6);
        assert!((geometry.vertices[uv_offset + 1] - (v0_before + 0.25)).abs() < 1e-6);
        assert!(geometry.version > v0);
    }

    #[test]
    fn is_a_noop_without_uv0() {
        let layout = VertexAttributeLayout {
            attributes: vec![
                VertexAttribute { byte_offset: 0, format: VertexFormat::Float32x3, semantic: VertexSemantic::Position },
            ],
            stride: 12,
        };
        let mut geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout,
            vertices: vec![1.0, 2.0, 3.0],
            subsets: None,
            topology: None,
        });
        let v0 = geometry.version;
        offset_mesh_geometry_uvs(&mut geometry, 0.5, 0.25);
        assert_eq!(geometry.version, v0);
    }
}

mod scale_mesh_geometry_uvs_test {
    use super::*;

    #[test]
    fn scales_uv0_by_factor() {
        let mut geometry = create_quad_mesh_geometry(1.0, 1.0);
        let uv_offset = 10usize;
        let u0_before = geometry.vertices[uv_offset];
        let v0_before = geometry.vertices[uv_offset + 1];
        scale_mesh_geometry_uvs(&mut geometry, 2.0, 3.0);
        assert!((geometry.vertices[uv_offset] - u0_before * 2.0).abs() < 1e-6);
        assert!((geometry.vertices[uv_offset + 1] - v0_before * 3.0).abs() < 1e-6);
    }
}
