use flight_mesh::*;

fn canonical_layout() -> VertexAttributeLayout {
    return VertexAttributeLayout {
        attributes: vec![
            VertexAttribute { byte_offset: 0, format: VertexFormat::Float32x3, semantic: VertexSemantic::Position },
            VertexAttribute { byte_offset: 12, format: VertexFormat::Float32x3, semantic: VertexSemantic::Normal },
            VertexAttribute { byte_offset: 24, format: VertexFormat::Float32x4, semantic: VertexSemantic::Tangent },
            VertexAttribute { byte_offset: 40, format: VertexFormat::Float32x2, semantic: VertexSemantic::Uv0 },
        ],
        stride: 48,
    };
}

mod add_mesh_geometry_subset {
    use super::*;

    #[test]
    fn appends_a_new_subset_to_the_list() {
        let mut geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(vec![0, 1, 2, 3, 4, 5])),
            layout: canonical_layout(),
            vertices: vec![0.0f32; 6 * 12],
            subsets: Some(vec![MeshSubset { index_count: 3, index_offset: 0 }]),
            topology: None,
        });
        add_mesh_geometry_subset(&mut geometry, &MeshSubset { index_count: 3, index_offset: 3 });
        assert_eq!(geometry.subsets.len(), 2);
        assert_eq!(geometry.subsets[1].index_count, 3);
        assert_eq!(geometry.subsets[1].index_offset, 3);
    }
}

mod get_mesh_geometry_subset_triangle_count {
    use super::*;

    #[test]
    fn returns_index_count_div_3_for_triangle_list() {
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(vec![0, 1, 2, 3, 4, 5])),
            layout: canonical_layout(),
            vertices: vec![0.0f32; 6 * 12],
            subsets: Some(vec![
                MeshSubset { index_count: 3, index_offset: 0 },
                MeshSubset { index_count: 3, index_offset: 3 },
            ]),
            topology: None,
        });
        assert_eq!(get_mesh_geometry_subset_triangle_count(&geometry, 0), 1);
        assert_eq!(get_mesh_geometry_subset_triangle_count(&geometry, 1), 1);
    }

    #[test]
    fn returns_0_for_out_of_range() {
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(vec![0, 1, 2])),
            layout: canonical_layout(),
            vertices: vec![0.0f32; 3 * 12],
            subsets: None,
            topology: None,
        });
        assert_eq!(get_mesh_geometry_subset_triangle_count(&geometry, 5), 0);
        assert_eq!(get_mesh_geometry_subset_triangle_count(&geometry, -1), 0);
    }

    #[test]
    fn counts_strip_triangles_as_index_count_minus_2() {
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(vec![0, 1, 2, 3])),
            layout: canonical_layout(),
            vertices: vec![0.0f32; 4 * 12],
            subsets: None,
            topology: Some(PrimitiveTopology::TriangleStrip),
        });
        assert_eq!(get_mesh_geometry_subset_triangle_count(&geometry, 0), 2);
    }
}

mod get_mesh_geometry_triangle_subset_index {
    use super::*;

    #[test]
    fn locates_the_owning_subset() {
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(vec![0, 1, 2, 3, 4, 5])),
            layout: canonical_layout(),
            vertices: vec![0.0f32; 6 * 12],
            subsets: Some(vec![
                MeshSubset { index_count: 3, index_offset: 0 },
                MeshSubset { index_count: 3, index_offset: 3 },
            ]),
            topology: None,
        });
        assert_eq!(get_mesh_geometry_triangle_subset_index(&geometry, 0), 0);
        assert_eq!(get_mesh_geometry_triangle_subset_index(&geometry, 1), 1);
    }

    #[test]
    fn returns_neg1_for_out_of_range() {
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(vec![0, 1, 2])),
            layout: canonical_layout(),
            vertices: vec![0.0f32; 3 * 12],
            subsets: None,
            topology: None,
        });
        assert_eq!(get_mesh_geometry_triangle_subset_index(&geometry, 99), -1);
        assert_eq!(get_mesh_geometry_triangle_subset_index(&geometry, -1), -1);
    }

    #[test]
    fn resolves_overlapping_strip_triangles_and_rejects_non_triangle_topology() {
        let mut geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(vec![0, 1, 2, 3])),
            layout: canonical_layout(),
            vertices: vec![0.0f32; 4 * 12],
            subsets: Some(vec![MeshSubset { index_count: 4, index_offset: 0 }]),
            topology: Some(PrimitiveTopology::TriangleStrip),
        });
        assert_eq!(get_mesh_geometry_triangle_subset_index(&geometry, 0), 0);
        assert_eq!(get_mesh_geometry_triangle_subset_index(&geometry, 1), 0);
        geometry.topology = PrimitiveTopology::LineList;
        assert_eq!(get_mesh_geometry_triangle_subset_index(&geometry, 0), -1);
    }
}

mod set_mesh_geometry_subsets {
    use super::*;

    #[test]
    fn replaces_all_subsets() {
        let mut geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(vec![0, 1, 2, 3, 4, 5, 6, 7, 8])),
            layout: canonical_layout(),
            vertices: vec![0.0f32; 9 * 12],
            subsets: None,
            topology: None,
        });
        set_mesh_geometry_subsets(&mut geometry, &[
            MeshSubset { index_count: 3, index_offset: 0 },
            MeshSubset { index_count: 3, index_offset: 3 },
            MeshSubset { index_count: 3, index_offset: 6 },
        ]);
        assert_eq!(geometry.subsets.len(), 3);
        assert_eq!(geometry.subsets[2].index_offset, 6);
    }
}
