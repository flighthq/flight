use flight_mesh::*;

mod canonical_mesh_geometry_layout_test {
    use super::*;

    #[test]
    fn has_stride_48() {
        assert_eq!(canonical_mesh_geometry_layout().stride, 48);
    }

    #[test]
    fn has_four_attributes() {
        let layout = canonical_mesh_geometry_layout();
        let semantics: Vec<VertexSemantic> = layout.attributes.iter().map(|a| a.semantic).collect();
        assert!(semantics.contains(&VertexSemantic::Position));
        assert!(semantics.contains(&VertexSemantic::Normal));
        assert!(semantics.contains(&VertexSemantic::Tangent));
        assert!(semantics.contains(&VertexSemantic::Uv0));
    }
}

mod canonical_skinned_mesh_geometry_layout_test {
    use super::*;

    #[test]
    fn extends_to_stride_80() {
        assert_eq!(canonical_skinned_mesh_geometry_layout().stride, 80);
    }

    #[test]
    fn adds_joints0_and_weights0() {
        let layout = canonical_skinned_mesh_geometry_layout();
        let joints = layout.attributes.iter().find(|a| a.semantic == VertexSemantic::Joints0);
        let weights = layout.attributes.iter().find(|a| a.semantic == VertexSemantic::Weights0);
        assert!(joints.is_some());
        assert_eq!(joints.unwrap().byte_offset, 48);
        assert_eq!(joints.unwrap().format, VertexFormat::Float32x4);
        assert!(weights.is_some());
        assert_eq!(weights.unwrap().byte_offset, 64);
    }
}

mod convert_mesh_geometry_layout_test {
    use super::*;

    fn position_only_layout() -> VertexAttributeLayout {
        return VertexAttributeLayout {
            attributes: vec![
                VertexAttribute { byte_offset: 0, format: VertexFormat::Float32x3, semantic: VertexSemantic::Position },
            ],
            stride: 12,
        };
    }

    fn make_canonical_geometry() -> MeshGeometry {
        let mut vertices = vec![0.0f32; 12];
        vertices[0] = 1.0; vertices[1] = 2.0; vertices[2] = 3.0;
        vertices[3] = 0.0; vertices[4] = 1.0; vertices[5] = 0.0;
        vertices[6] = 1.0; vertices[7] = 0.0; vertices[8] = 0.0; vertices[9] = 1.0;
        vertices[10] = 0.5; vertices[11] = 0.25;
        return create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_mesh_geometry_layout(),
            vertices,
            subsets: None,
            topology: None,
        });
    }

    #[test]
    fn strips_to_position_only_layout() {
        let source = make_canonical_geometry();
        let converted = convert_mesh_geometry_layout(&source, &position_only_layout());
        assert_eq!(converted.layout.stride, 12);
        assert_eq!(converted.vertices.len(), 3);
        assert!((converted.vertices[0] - 1.0).abs() < 1e-6);
        assert!((converted.vertices[1] - 2.0).abs() < 1e-6);
        assert!((converted.vertices[2] - 3.0).abs() < 1e-6);
    }

    #[test]
    fn preserves_vertex_count() {
        let mut vertices = vec![0.0f32; 3 * 12];
        vertices[0] = 1.0;
        vertices[12] = 2.0;
        vertices[24] = 3.0;
        let source = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_mesh_geometry_layout(),
            vertices,
            subsets: None,
            topology: None,
        });
        let converted = convert_mesh_geometry_layout(&source, &position_only_layout());
        assert_eq!(converted.vertices.len(), 9);
    }
}
