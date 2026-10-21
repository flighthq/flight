use flight_meshgeometry::contract::*;

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

fn make_one_vertex() -> MeshGeometry {
    let mut vertices = vec![0.0f32; 12];
    vertices[0] = 1.0; vertices[1] = 2.0; vertices[2] = 3.0;
    vertices[3] = 0.0; vertices[4] = 1.0; vertices[5] = 0.0;
    vertices[6] = 1.0; vertices[7] = 0.0; vertices[8] = 0.0; vertices[9] = 1.0;
    vertices[10] = 0.5; vertices[11] = 0.75;
    return create_mesh_geometry(MeshGeometryOptions {
        indices: None,
        layout: canonical_layout(),vertices: (vertices).into(),
        subsets: None,
        topology: None,});
}

fn make_packed_vertex() -> MeshGeometry {
    let layout = VertexAttributeLayout {
        attributes: vec![
            VertexAttribute { byte_offset: 0, format: VertexFormat::Float32x2, semantic: VertexSemantic::Uv1 },
            VertexAttribute { byte_offset: 8, format: VertexFormat::Unorm8x4, semantic: VertexSemantic::Color0 },
            VertexAttribute { byte_offset: 12, format: VertexFormat::Uint16x4, semantic: VertexSemantic::Joints0 },
            VertexAttribute { byte_offset: 20, format: VertexFormat::Unorm8x4, semantic: VertexSemantic::Weights0 },
        ],
        stride: 24,
    };
    let mut bytes = vec![0u8; 24];
    bytes[0..4].copy_from_slice(&0.25f32.to_le_bytes());
    bytes[4..8].copy_from_slice(&0.75f32.to_le_bytes());
    bytes[8] = 255; bytes[9] = 128; bytes[10] = 0; bytes[11] = 64;
    bytes[12..14].copy_from_slice(&2u16.to_le_bytes());
    bytes[14..16].copy_from_slice(&400u16.to_le_bytes());
    bytes[16..18].copy_from_slice(&65535u16.to_le_bytes());
    bytes[18..20].copy_from_slice(&0u16.to_le_bytes());
    bytes[20] = 128; bytes[21] = 64; bytes[22] = 32; bytes[23] = 31;
    let vertices: Vec<f32> = bytes
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect();
    return create_mesh_geometry(MeshGeometryOptions {
        indices: None,
        layout,vertices: (vertices).into(),
        subsets: None,
        topology: None,});
}

fn empty_geometry() -> MeshGeometry {
    return create_mesh_geometry(MeshGeometryOptions {
        indices: None,
        layout: VertexAttributeLayout { attributes: vec![], stride: 0 },
        vertices: (vec![]).into(),
        subsets: None,
        topology: None,});
}

mod get_mesh_geometry_vertex_color0 {
    use super::*;

    #[test]
    fn decodes_the_declared_color_storage() {
        let mut out = flight_geometry::create_vector4(0.0, 0.0, 0.0, 0.0);
        assert!(get_mesh_geometry_vertex_color0(&mut out, &make_packed_vertex(), 0));
        assert_eq!(out.x, 1.0);
    }

    #[test]
    fn reads_packed_unorm8x4_color_components() {
        let mut out = flight_geometry::create_vector4(0.0, 0.0, 0.0, 0.0);
        assert!(get_mesh_geometry_vertex_color0(&mut out, &make_packed_vertex(), 0));
        assert_eq!(out.x, 1.0);
        assert!((out.y - 128.0 / 255.0).abs() < 1e-3);
        assert_eq!(out.z, 0.0);
        assert!((out.w - 64.0 / 255.0).abs() < 1e-3);
    }

    #[test]
    fn treats_float32x3_color_alpha_as_gl_implicit_default() {
        let layout = VertexAttributeLayout {
            attributes: vec![
                VertexAttribute { byte_offset: 0, format: VertexFormat::Float32x3, semantic: VertexSemantic::Color0 },
            ],
            stride: 12,
        };
        let geo = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout,
            vertices: (vec![0.1, 0.2, 0.3]).into(),
            subsets: None,
            topology: None,});
        let mut out = flight_geometry::create_vector4(0.0, 0.0, 0.0, 0.0);
        assert!(get_mesh_geometry_vertex_color0(&mut out, &geo, 0));
        assert_eq!(out.w, 1.0);
    }

    #[test]
    fn leaves_output_untouched_when_color0_is_absent() {
        let mut out = flight_geometry::create_vector4(8.0, 9.0, 10.0, 7.0);
        assert!(!get_mesh_geometry_vertex_color0(&mut out, &make_one_vertex(), 0));
        assert_eq!(out.x, 8.0);
        assert_eq!(out.y, 9.0);
        assert_eq!(out.z, 10.0);
        assert_eq!(out.w, 7.0);
    }
}

mod get_mesh_geometry_vertex_joints0 {
    use super::*;

    #[test]
    fn decodes_the_declared_joint_storage() {
        let mut out = flight_geometry::create_vector4(0.0, 0.0, 0.0, 0.0);
        assert!(get_mesh_geometry_vertex_joints0(&mut out, &make_packed_vertex(), 0));
        assert_eq!(out.y, 400.0);
    }

    #[test]
    fn reads_all_four_joint_indices() {
        let mut out = flight_geometry::create_vector4(0.0, 0.0, 0.0, 0.0);
        assert!(get_mesh_geometry_vertex_joints0(&mut out, &make_packed_vertex(), 0));
        assert_eq!(out.x, 2.0);
        assert_eq!(out.y, 400.0);
        assert_eq!(out.z, 65535.0);
        assert_eq!(out.w, 0.0);
    }

    #[test]
    fn leaves_output_untouched_when_joints0_is_absent() {
        let mut out = flight_geometry::create_vector4(8.0, 9.0, 10.0, 7.0);
        assert!(!get_mesh_geometry_vertex_joints0(&mut out, &make_one_vertex(), 0));
        assert_eq!(out.x, 8.0);
        assert_eq!(out.y, 9.0);
        assert_eq!(out.z, 10.0);
        assert_eq!(out.w, 7.0);
    }

    #[test]
    fn returns_false_for_out_of_range_index() {
        let mut out = flight_geometry::create_vector4(0.0, 0.0, 0.0, 0.0);
        assert!(!get_mesh_geometry_vertex_joints0(&mut out, &make_packed_vertex(), 5));
    }
}

mod get_mesh_geometry_vertex_normal {
    use super::*;

    #[test]
    fn reads_the_normal_of_the_given_vertex() {
        let geo = make_one_vertex();
        let mut out = flight_geometry::create_vector3(0.0, 0.0, 0.0);
        assert!(get_mesh_geometry_vertex_normal(&mut out, &geo, 0));
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 1.0);
        assert_eq!(out.z, 0.0);
    }

    #[test]
    fn returns_false_for_out_of_range_index() {
        let mut out = flight_geometry::create_vector3(0.0, 0.0, 0.0);
        assert!(!get_mesh_geometry_vertex_normal(&mut out, &make_one_vertex(), 1));
    }

    #[test]
    fn returns_false_when_layout_has_no_normal() {
        let layout = VertexAttributeLayout {
            attributes: vec![
                VertexAttribute { byte_offset: 0, format: VertexFormat::Float32x3, semantic: VertexSemantic::Position },
            ],
            stride: 12,
        };
        let geo = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout,
            vertices: (vec![0.0; 3]).into(),
            subsets: None,
            topology: None,});
        let mut out = flight_geometry::create_vector3(0.0, 0.0, 0.0);
        assert!(!get_mesh_geometry_vertex_normal(&mut out, &geo, 0));
    }

    #[test]
    fn leaves_output_untouched_when_absent() {
        let mut out = flight_geometry::create_vector3(8.0, 9.0, 10.0);
        assert!(!get_mesh_geometry_vertex_normal(&mut out, &empty_geometry(), 0));
        assert_eq!(out.x, 8.0);
        assert_eq!(out.y, 9.0);
        assert_eq!(out.z, 10.0);
    }
}

mod get_mesh_geometry_vertex_position {
    use super::*;

    #[test]
    fn reads_the_position_of_the_given_vertex() {
        let geo = make_one_vertex();
        let mut out = flight_geometry::create_vector3(0.0, 0.0, 0.0);
        assert!(get_mesh_geometry_vertex_position(&mut out, &geo, 0));
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 2.0);
        assert_eq!(out.z, 3.0);
    }

    #[test]
    fn returns_false_for_out_of_range_index() {
        let mut out = flight_geometry::create_vector3(0.0, 0.0, 0.0);
        assert!(!get_mesh_geometry_vertex_position(&mut out, &make_one_vertex(), 1));
    }

    #[test]
    fn rejects_non_float_position_format() {
        let packed = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: VertexAttributeLayout {
                attributes: vec![
                    VertexAttribute { byte_offset: 0, format: VertexFormat::Uint8x4, semantic: VertexSemantic::Position },
                ],
                stride: 4,
            },
            vertices: (vec![0.0; 1]).into(),
            subsets: None,
            topology: None,});
        let mut out = flight_geometry::create_vector3(7.0, 8.0, 9.0);
        assert!(!get_mesh_geometry_vertex_position(&mut out, &packed, 0));
        assert_eq!(out.x, 7.0);
        assert_eq!(out.y, 8.0);
        assert_eq!(out.z, 9.0);
    }

    #[test]
    fn leaves_output_untouched_when_absent() {
        let mut out = flight_geometry::create_vector3(8.0, 9.0, 10.0);
        assert!(!get_mesh_geometry_vertex_position(&mut out, &empty_geometry(), 0));
        assert_eq!(out.x, 8.0);
        assert_eq!(out.y, 9.0);
        assert_eq!(out.z, 10.0);
    }
}

mod get_mesh_geometry_vertex_tangent {
    use super::*;

    #[test]
    fn reads_the_tangent_including_w() {
        let geo = make_one_vertex();
        let mut out = flight_geometry::create_vector4(0.0, 0.0, 0.0, 0.0);
        assert!(get_mesh_geometry_vertex_tangent(&mut out, &geo, 0));
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.z, 0.0);
        assert_eq!(out.w, 1.0);
    }

    #[test]
    fn leaves_output_untouched_when_absent() {
        let mut out = flight_geometry::create_vector4(8.0, 9.0, 10.0, 7.0);
        assert!(!get_mesh_geometry_vertex_tangent(&mut out, &empty_geometry(), 0));
        assert_eq!(out.x, 8.0);
        assert_eq!(out.y, 9.0);
        assert_eq!(out.z, 10.0);
        assert_eq!(out.w, 7.0);
    }
}

mod get_mesh_geometry_vertex_uv0 {
    use super::*;

    #[test]
    fn reads_the_uv0_coordinates() {
        let geo = make_one_vertex();
        let mut out = flight_geometry::create_vector2(0.0, 0.0);
        assert!(get_mesh_geometry_vertex_uv0(&mut out, &geo, 0));
        assert!((out.x - 0.5).abs() < 1e-6);
        assert!((out.y - 0.75).abs() < 1e-6);
    }
}

mod get_mesh_geometry_vertex_uv1 {
    use super::*;

    #[test]
    fn reads_the_secondary_uv_channel() {
        let mut out = flight_geometry::create_vector2(0.0, 0.0);
        assert!(get_mesh_geometry_vertex_uv1(&mut out, &make_packed_vertex(), 0));
        assert_eq!(out.x, 0.25);
        assert_eq!(out.y, 0.75);
    }
}

mod get_mesh_geometry_vertex_weights0 {
    use super::*;

    #[test]
    fn decodes_normalized_packed_weights() {
        let mut out = flight_geometry::create_vector4(0.0, 0.0, 0.0, 0.0);
        assert!(get_mesh_geometry_vertex_weights0(&mut out, &make_packed_vertex(), 0));
        assert!((out.x - 128.0 / 255.0).abs() < 1e-3);
    }

    #[test]
    fn reads_all_four_weight_components() {
        let mut out = flight_geometry::create_vector4(0.0, 0.0, 0.0, 0.0);
        assert!(get_mesh_geometry_vertex_weights0(&mut out, &make_packed_vertex(), 0));
        assert!((out.x - 128.0 / 255.0).abs() < 1e-3);
        assert!((out.y - 64.0 / 255.0).abs() < 1e-3);
        assert!((out.z - 32.0 / 255.0).abs() < 1e-3);
        assert!((out.w - 31.0 / 255.0).abs() < 1e-3);
    }

    #[test]
    fn leaves_output_untouched_when_weights0_is_absent() {
        let mut out = flight_geometry::create_vector4(8.0, 9.0, 10.0, 7.0);
        assert!(!get_mesh_geometry_vertex_weights0(&mut out, &make_one_vertex(), 0));
        assert_eq!(out.x, 8.0);
        assert_eq!(out.y, 9.0);
        assert_eq!(out.z, 10.0);
        assert_eq!(out.w, 7.0);
    }
}

mod get_vertex_attribute {
    use super::*;

    #[test]
    fn returns_the_attribute_for_a_present_semantic() {
        let attr = get_vertex_attribute(&canonical_layout(), VertexSemantic::Normal);
        assert!(attr.is_some());
        let a = attr.unwrap();
        assert_eq!(a.byte_offset, 12);
        assert_eq!(a.format, VertexFormat::Float32x3);
    }

    #[test]
    fn returns_none_for_an_absent_semantic() {
        let attr = get_vertex_attribute(&canonical_layout(), VertexSemantic::Color0);
        assert!(attr.is_none());
    }
}

mod get_vertex_attribute_float_offset {
    use super::*;

    #[test]
    fn returns_the_float_offset_for_float32_semantics() {
        let layout = canonical_layout();
        assert_eq!(get_vertex_attribute_float_offset(&layout, VertexSemantic::Position), 0);
        assert_eq!(get_vertex_attribute_float_offset(&layout, VertexSemantic::Normal), 3);
        assert_eq!(get_vertex_attribute_float_offset(&layout, VertexSemantic::Tangent), 6);
        assert_eq!(get_vertex_attribute_float_offset(&layout, VertexSemantic::Uv0), 10);
    }

    #[test]
    fn returns_neg1_for_an_absent_semantic() {
        assert_eq!(get_vertex_attribute_float_offset(&canonical_layout(), VertexSemantic::Color0), -1);
    }

    #[test]
    fn returns_neg1_for_a_non_float32_attribute() {
        let layout = VertexAttributeLayout {
            attributes: vec![
                VertexAttribute { byte_offset: 0, format: VertexFormat::Uint8x4, semantic: VertexSemantic::Color0 },
            ],
            stride: 4,
        };
        assert_eq!(get_vertex_attribute_float_offset(&layout, VertexSemantic::Color0), -1);
    }
}

mod set_mesh_geometry_vertex_color0 {
    use super::*;

    #[test]
    fn encodes_and_versions_the_declared_color_storage() {
        let mut geo = make_packed_vertex();
        assert!(set_mesh_geometry_vertex_color0(&mut geo, 0, 0.0, 1.0, 0.0, 1.0));
        assert_eq!(geo.version, 1);
    }

    #[test]
    fn float32x3_color_write_ignores_alpha() {
        let layout = VertexAttributeLayout {
            attributes: vec![
                VertexAttribute { byte_offset: 0, format: VertexFormat::Float32x3, semantic: VertexSemantic::Color0 },
            ],
            stride: 12,
        };
        let mut geo = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout,
            vertices: (vec![0.1, 0.2, 0.3]).into(),
            subsets: None,
            topology: None,});
        assert!(set_mesh_geometry_vertex_color0(&mut geo, 0, 0.4, 0.5, 0.6, 0.1));
        assert!((geo.vertices[0] - 0.4).abs() < 1e-6);
        assert!((geo.vertices[1] - 0.5).abs() < 1e-6);
        assert!((geo.vertices[2] - 0.6).abs() < 1e-6);
    }

    #[test]
    fn returns_false_when_color0_is_absent() {
        let mut geo = make_one_vertex();
        let version = geo.version;
        assert!(!set_mesh_geometry_vertex_color0(&mut geo, 0, 1.0, 0.0, 0.0, 1.0));
        assert_eq!(geo.version, version);
    }
}

mod set_mesh_geometry_vertex_joints0 {
    use super::*;

    #[test]
    fn encodes_and_versions_the_declared_joint_storage() {
        let mut geo = make_packed_vertex();
        assert!(set_mesh_geometry_vertex_joints0(&mut geo, 0, 1.0, 2.0, 3.0, 4.0));
        assert_eq!(geo.version, 1);
    }

    #[test]
    fn clamps_values_to_uint16_range() {
        let mut geo = make_packed_vertex();
        assert!(set_mesh_geometry_vertex_joints0(&mut geo, 0, 3.4, 70000.0, -2.0, 9.0));
        let mut out = flight_geometry::create_vector4(0.0, 0.0, 0.0, 0.0);
        assert!(get_mesh_geometry_vertex_joints0(&mut out, &geo, 0));
        assert_eq!(out.x, 3.0);
        assert_eq!(out.y, 65535.0);
        assert_eq!(out.z, 0.0);
        assert_eq!(out.w, 9.0);
    }
}

mod set_mesh_geometry_vertex_normal {
    use super::*;

    #[test]
    fn writes_the_normal_and_bumps_version() {
        let mut geo = make_one_vertex();
        let v0 = geo.version;
        assert!(set_mesh_geometry_vertex_normal(&mut geo, 0, 0.0, 0.0, 1.0));
        assert_eq!(geo.vertices[3], 0.0);
        assert_eq!(geo.vertices[4], 0.0);
        assert_eq!(geo.vertices[5], 1.0);
        assert_eq!(geo.version, v0 + 1);
    }

    #[test]
    fn returns_false_for_out_of_range_index() {
        let mut geo = make_one_vertex();
        assert!(!set_mesh_geometry_vertex_normal(&mut geo, 5, 0.0, 0.0, 1.0));
    }
}

mod set_mesh_geometry_vertex_position {
    use super::*;

    #[test]
    fn writes_the_position_and_bumps_version() {
        let mut geo = make_one_vertex();
        let v0 = geo.version;
        assert!(set_mesh_geometry_vertex_position(&mut geo, 0, 10.0, 20.0, 30.0));
        assert_eq!(geo.vertices[0], 10.0);
        assert_eq!(geo.vertices[1], 20.0);
        assert_eq!(geo.vertices[2], 30.0);
        assert_eq!(geo.version, v0 + 1);
    }
}

mod set_mesh_geometry_vertex_tangent {
    use super::*;

    #[test]
    fn writes_the_tangent_including_w_and_bumps_version() {
        let mut geo = make_one_vertex();
        let v0 = geo.version;
        assert!(set_mesh_geometry_vertex_tangent(&mut geo, 0, 0.0, 1.0, 0.0, -1.0));
        assert_eq!(geo.vertices[6], 0.0);
        assert_eq!(geo.vertices[7], 1.0);
        assert_eq!(geo.vertices[8], 0.0);
        assert_eq!(geo.vertices[9], -1.0);
        assert_eq!(geo.version, v0 + 1);
    }
}

mod set_mesh_geometry_vertex_uv0 {
    use super::*;

    #[test]
    fn writes_the_uv0_and_bumps_version() {
        let mut geo = make_one_vertex();
        let v0 = geo.version;
        assert!(set_mesh_geometry_vertex_uv0(&mut geo, 0, 0.1, 0.9));
        assert!((geo.vertices[10] - 0.1).abs() < 1e-6);
        assert!((geo.vertices[11] - 0.9).abs() < 1e-6);
        assert_eq!(geo.version, v0 + 1);
    }

    #[test]
    fn returns_false_for_absent_semantic() {
        let layout = VertexAttributeLayout {
            attributes: vec![
                VertexAttribute { byte_offset: 0, format: VertexFormat::Float32x3, semantic: VertexSemantic::Position },
            ],
            stride: 12,
        };
        let mut geo = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout,
            vertices: (vec![0.0; 3]).into(),
            subsets: None,
            topology: None,});
        assert!(!set_mesh_geometry_vertex_uv0(&mut geo, 0, 0.5, 0.5));
    }
}

mod set_mesh_geometry_vertex_uv1 {
    use super::*;

    #[test]
    fn writes_and_versions_the_secondary_uv_channel() {
        let mut geo = make_packed_vertex();
        assert!(set_mesh_geometry_vertex_uv1(&mut geo, 0, 0.0, 1.0));
        assert_eq!(geo.version, 1);
    }

    #[test]
    fn round_trips_written_uv1_values() {
        let mut geo = make_packed_vertex();
        assert!(set_mesh_geometry_vertex_uv1(&mut geo, 0, 0.1, 0.9));
        let mut out = flight_geometry::create_vector2(0.0, 0.0);
        assert!(get_mesh_geometry_vertex_uv1(&mut out, &geo, 0));
        assert!((out.x - 0.1).abs() < 1e-6);
        assert!((out.y - 0.9).abs() < 1e-6);
    }
}

mod set_mesh_geometry_vertex_weights0 {
    use super::*;

    #[test]
    fn encodes_and_versions_normalized_packed_weights() {
        let mut geo = make_packed_vertex();
        assert!(set_mesh_geometry_vertex_weights0(&mut geo, 0, 1.0, 0.0, 0.0, 0.0));
        assert_eq!(geo.version, 1);
    }

    #[test]
    fn returns_false_when_weights0_is_absent() {
        let mut geo = make_one_vertex();
        let version = geo.version;
        assert!(!set_mesh_geometry_vertex_weights0(&mut geo, 0, 1.0, 0.0, 0.0, 0.0));
        assert_eq!(geo.version, version);
    }

    #[test]
    fn round_trips_written_weight_values() {
        let mut geo = make_packed_vertex();
        assert!(set_mesh_geometry_vertex_weights0(&mut geo, 0, 0.5, 0.25, 0.125, 0.125));
        let mut out = flight_geometry::create_vector4(0.0, 0.0, 0.0, 0.0);
        assert!(get_mesh_geometry_vertex_weights0(&mut out, &geo, 0));
        assert!((out.x - 128.0 / 255.0).abs() < 1e-3);
        assert!((out.y - 64.0 / 255.0).abs() < 1e-3);
        assert!((out.z - 32.0 / 255.0).abs() < 1e-3);
        assert!((out.w - 32.0 / 255.0).abs() < 1e-3);
    }
}
