use flight_meshgeometry::*;

mod canonical_mesh_geometry_layout {
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

    #[test]
    fn position_attribute_is_at_byte_offset_0_with_format_float32x3() {
        let layout = canonical_mesh_geometry_layout();
        let pos = layout.attributes.iter().find(|a| a.semantic == VertexSemantic::Position).unwrap();
        assert_eq!(pos.byte_offset, 0);
        assert_eq!(pos.format, VertexFormat::Float32x3);
    }
}

mod canonical_skinned_mesh_geometry_layout {
    use super::*;

    #[test]
    fn extends_to_stride_80() {
        assert_eq!(canonical_skinned_mesh_geometry_layout().stride, 80);
    }

    #[test]
    fn keeps_position_and_normal_at_the_canonical_offsets() {
        let layout = canonical_skinned_mesh_geometry_layout();
        let position = layout.attributes.iter().find(|a| a.semantic == VertexSemantic::Position).unwrap();
        let normal = layout.attributes.iter().find(|a| a.semantic == VertexSemantic::Normal).unwrap();
        assert_eq!(position.byte_offset, 0);
        assert_eq!(normal.byte_offset, 12);
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

mod convert_mesh_geometry_layout {
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
    fn strips_to_position_plus_uv0_layout() {
        let source = make_canonical_geometry();
        let position_uv0_layout = VertexAttributeLayout {
            attributes: vec![
                VertexAttribute { byte_offset: 0, format: VertexFormat::Float32x3, semantic: VertexSemantic::Position },
                VertexAttribute { byte_offset: 12, format: VertexFormat::Float32x2, semantic: VertexSemantic::Uv0 },
            ],
            stride: 20,
        };
        let converted = convert_mesh_geometry_layout(&source, &position_uv0_layout);
        assert_eq!(converted.layout.stride, 20);
        assert_eq!(converted.vertices.len(), 5);
        assert!((converted.vertices[0] - 1.0).abs() < 1e-6);
        assert!((converted.vertices[1] - 2.0).abs() < 1e-6);
        assert!((converted.vertices[2] - 3.0).abs() < 1e-6);
        assert!((converted.vertices[3] - 0.5).abs() < 1e-6);
        assert!((converted.vertices[4] - 0.25).abs() < 1e-6);
    }

    #[test]
    fn zero_fills_attributes_absent_in_the_source() {
        let pos_only_source = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: position_only_layout(),
            vertices: vec![1.0, 2.0, 3.0],
            subsets: None,
            topology: None,
        });
        let target_layout = VertexAttributeLayout {
            attributes: vec![
                VertexAttribute { byte_offset: 0, format: VertexFormat::Float32x3, semantic: VertexSemantic::Position },
                VertexAttribute { byte_offset: 12, format: VertexFormat::Float32x3, semantic: VertexSemantic::Normal },
            ],
            stride: 24,
        };
        let converted = convert_mesh_geometry_layout(&pos_only_source, &target_layout);
        assert!((converted.vertices[0] - 1.0).abs() < 1e-6);
        assert!((converted.vertices[1] - 2.0).abs() < 1e-6);
        assert!((converted.vertices[2] - 3.0).abs() < 1e-6);
        assert_eq!(converted.vertices[3], 0.0);
        assert_eq!(converted.vertices[4], 0.0);
        assert_eq!(converted.vertices[5], 0.0);
    }

    #[test]
    fn converts_packed_channels_by_semantic_and_round_trips_their_declared_encoding() {
        let packed_layout = VertexAttributeLayout {
            attributes: vec![
                VertexAttribute { byte_offset: 0, format: VertexFormat::Unorm8x4, semantic: VertexSemantic::Color0 },
                VertexAttribute { byte_offset: 4, format: VertexFormat::Uint16x4, semantic: VertexSemantic::Joints0 },
            ],
            stride: 12,
        };
        let mut packed_vertices = vec![0.0f32; 3];
        let bytes = vertices_as_bytes_mut(&mut packed_vertices);
        bytes[0] = 255; bytes[1] = 128; bytes[2] = 0; bytes[3] = 64;
        bytes[4..6].copy_from_slice(&1u16.to_le_bytes());
        bytes[6..8].copy_from_slice(&255u16.to_le_bytes());
        bytes[8..10].copy_from_slice(&256u16.to_le_bytes());
        bytes[10..12].copy_from_slice(&65535u16.to_le_bytes());
        let source = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: packed_layout.clone(),
            vertices: packed_vertices.clone(),
            subsets: None,
            topology: None,
        });
        let float_layout = VertexAttributeLayout {
            attributes: vec![
                VertexAttribute { byte_offset: 0, format: VertexFormat::Float32x4, semantic: VertexSemantic::Color0 },
                VertexAttribute { byte_offset: 16, format: VertexFormat::Float32x4, semantic: VertexSemantic::Joints0 },
            ],
            stride: 32,
        };
        let converted = convert_mesh_geometry_layout(&source, &float_layout);
        assert_eq!(converted.vertices[0], 1.0);
        assert!((converted.vertices[1] - 128.0 / 255.0).abs() < 1e-3);
        assert_eq!(converted.vertices[2], 0.0);
        assert!((converted.vertices[3] - 64.0 / 255.0).abs() < 1e-3);
        assert_eq!(converted.vertices[4], 1.0);
        assert_eq!(converted.vertices[5], 255.0);
        assert_eq!(converted.vertices[6], 256.0);
        assert_eq!(converted.vertices[7], 65535.0);
        let round_trip = convert_mesh_geometry_layout(&converted, &packed_layout);
        let rt_bytes = vertices_as_bytes(&round_trip.vertices);
        let orig_bytes = vertices_as_bytes(&packed_vertices);
        assert_eq!(&rt_bytes[..12], &orig_bytes[..12]);
    }

    #[test]
    fn leaves_target_only_components_zero() {
        let source_layout = VertexAttributeLayout {
            attributes: vec![
                VertexAttribute { byte_offset: 0, format: VertexFormat::Float32x3, semantic: VertexSemantic::Position },
            ],
            stride: 12,
        };
        let source = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: source_layout,
            vertices: vec![1.0, 2.0, 3.0],
            subsets: None,
            topology: None,
        });
        let target_layout = VertexAttributeLayout {
            attributes: vec![
                VertexAttribute { byte_offset: 0, format: VertexFormat::Float32x4, semantic: VertexSemantic::Position },
            ],
            stride: 16,
        };
        let converted = convert_mesh_geometry_layout(&source, &target_layout);
        assert_eq!(converted.vertices[0], 1.0);
        assert_eq!(converted.vertices[1], 2.0);
        assert_eq!(converted.vertices[2], 3.0);
        assert_eq!(converted.vertices[3], 0.0);
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

    #[test]
    fn preserves_index_buffer_and_topology() {
        let vertices = vec![0.0f32; 3 * 12];
        let source = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(vec![0, 1, 2])),
            layout: canonical_mesh_geometry_layout(),
            vertices,
            subsets: None,
            topology: Some(PrimitiveTopology::TriangleList),
        });
        let converted = convert_mesh_geometry_layout(&source, &position_only_layout());
        assert_eq!(converted.topology, PrimitiveTopology::TriangleList);
        match &converted.indices {
            IndexBuffer::U16(v) => assert_eq!(v.len(), 3),
            _ => panic!("expected U16 indices"),
        }
    }

    #[test]
    fn does_not_modify_the_source_geometry() {
        let source = make_canonical_geometry();
        let original_data: Vec<f32> = source.vertices.clone();
        let _converted = convert_mesh_geometry_layout(&source, &position_only_layout());
        assert_eq!(source.vertices, original_data);
    }
}
