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

fn make_vertices(count: usize) -> Vec<f32> {
    return vec![0.0f32; count * 12];
}

mod clone_mesh_geometry_test {
    use super::*;

    #[test]
    fn deep_copies_vertices_and_indices_independently() {
        let mut vertices = make_vertices(3);
        vertices[0] = 7.0;
        let mut clone = {
            let source = create_mesh_geometry(MeshGeometryOptions {
                indices: Some(IndexBuffer::U16(vec![0, 1, 2])),
                layout: canonical_layout(),
                vertices,
                subsets: None,
                topology: None,
            });
            let c = clone_mesh_geometry(&source);
            assert_eq!(c.vertices[0], 7.0);
            c
        };
        clone.vertices[0] = 99.0;
        assert_eq!(clone.vertices[0], 99.0);
    }

    #[test]
    fn resets_the_upload_version() {
        let mut source = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            vertices: make_vertices(1),
            subsets: None,
            topology: None,
        });
        source.version = 5;
        let clone = clone_mesh_geometry(&source);
        assert_eq!(clone.version, 0);
    }
}

mod clone_mesh_geometry_metadata_test {
    use super::*;

    #[test]
    fn copies_descriptors_without_copying_the_vertex_stream() {
        let source = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            vertices: vec![0.0f32; 12],
            subsets: None,
            topology: None,
        });
        let copy = clone_mesh_geometry_metadata(&source);
        assert_eq!(copy.vertices.len(), 0);
    }
}

mod create_mesh_geometry_test {
    use super::*;

    #[test]
    fn defaults_topology_to_triangle_list_and_a_single_full_subset() {
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(vec![0, 1, 2])),
            layout: canonical_layout(),
            vertices: make_vertices(3),
            subsets: None,
            topology: None,
        });
        assert_eq!(geometry.topology, PrimitiveTopology::TriangleList);
        assert_eq!(geometry.subsets.len(), 1);
        assert_eq!(geometry.subsets[0].index_count, 3);
        assert_eq!(geometry.subsets[0].index_offset, 0);
    }

    #[test]
    fn auto_promotes_indices_to_u32_past_65535_vertices() {
        let vertex_count = 70000;
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(vec![0, 1, 2])),
            layout: canonical_layout(),
            vertices: make_vertices(vertex_count),
            subsets: None,
            topology: None,
        });
        match &geometry.indices {
            IndexBuffer::U32(_) => {}
            _ => panic!("expected U32 indices"),
        }
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), vertex_count as u32);
    }

    #[test]
    fn allows_non_indexed_geometry_with_vertex_count_subset() {
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            vertices: make_vertices(6),
            subsets: None,
            topology: None,
        });
        match &geometry.indices {
            IndexBuffer::None => {}
            _ => panic!("expected no indices"),
        }
        assert_eq!(geometry.subsets[0].index_count, 6);
    }
}

mod get_mesh_geometry_index_count_test {
    use super::*;

    #[test]
    fn returns_the_index_length() {
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(vec![0, 1, 2, 0, 2, 3])),
            layout: canonical_layout(),
            vertices: make_vertices(4),
            subsets: None,
            topology: None,
        });
        assert_eq!(get_mesh_geometry_index_count(&geometry), 6);
    }

    #[test]
    fn returns_0_for_non_indexed_geometry() {
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            vertices: make_vertices(3),
            subsets: None,
            topology: None,
        });
        assert_eq!(get_mesh_geometry_index_count(&geometry), 0);
    }
}

mod get_mesh_geometry_morph_bind_pose_test {
    use super::*;

    #[test]
    fn returns_none_before_any_capture() {
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            vertices: make_vertices(3),
            subsets: None,
            topology: None,
        });
        assert!(get_mesh_geometry_morph_bind_pose(&geometry).is_none());
    }
}

mod get_mesh_geometry_vertex_count_test {
    use super::*;

    #[test]
    fn derives_vertex_count_from_stride() {
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            vertices: make_vertices(5),
            subsets: None,
            topology: None,
        });
        assert_eq!(get_mesh_geometry_vertex_count(&geometry), 5);
    }
}

mod has_mesh_geometry_skin_test {
    use super::*;

    #[test]
    fn is_false_for_canonical_and_true_with_joints0() {
        let rigid = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            vertices: make_vertices(3),
            subsets: None,
            topology: None,
        });
        assert_eq!(has_mesh_geometry_skin(&rigid), false);

        let skinned_layout = VertexAttributeLayout {
            attributes: vec![
                VertexAttribute { byte_offset: 0, format: VertexFormat::Float32x3, semantic: VertexSemantic::Position },
                VertexAttribute { byte_offset: 12, format: VertexFormat::Float32x4, semantic: VertexSemantic::Joints0 },
                VertexAttribute { byte_offset: 28, format: VertexFormat::Float32x4, semantic: VertexSemantic::Weights0 },
            ],
            stride: 44,
        };
        let skinned = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: skinned_layout,
            vertices: vec![0.0f32; 11],
            subsets: None,
            topology: None,
        });
        assert_eq!(has_mesh_geometry_skin(&skinned), true);
    }
}

mod invalidate_mesh_geometry_test {
    use super::*;

    #[test]
    fn advances_as_wrapping_u32() {
        let mut geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            vertices: make_vertices(1),
            subsets: None,
            topology: None,
        });
        invalidate_mesh_geometry(&mut geometry);
        assert_eq!(geometry.version, 1);

        geometry.version = 0xFFFFFFFF;
        invalidate_mesh_geometry(&mut geometry);
        assert_eq!(geometry.version, 0);
    }
}
