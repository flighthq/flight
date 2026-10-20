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

fn make_one_vertex() -> MeshGeometry {
    let mut vertices = vec![0.0f32; 12];
    vertices[0] = 1.0; vertices[1] = 2.0; vertices[2] = 3.0;
    vertices[3] = 0.0; vertices[4] = 1.0; vertices[5] = 0.0;
    vertices[6] = 1.0; vertices[7] = 0.0; vertices[8] = 0.0; vertices[9] = 1.0;
    vertices[10] = 0.5; vertices[11] = 0.75;
    return create_mesh_geometry(MeshGeometryOptions {
        indices: None,
        layout: canonical_layout(),
        vertices,
        subsets: None,
        topology: None,
    });
}

mod get_mesh_geometry_vertex_position_test {
    use super::*;

    #[test]
    fn reads_the_position() {
        let geo = make_one_vertex();
        let mut out = Vec3Out { x: 0.0, y: 0.0, z: 0.0 };
        assert!(get_mesh_geometry_vertex_position(&mut out, &geo, 0));
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 2.0);
        assert_eq!(out.z, 3.0);
    }

    #[test]
    fn returns_false_for_out_of_range() {
        let geo = make_one_vertex();
        let mut out = Vec3Out { x: 0.0, y: 0.0, z: 0.0 };
        assert!(!get_mesh_geometry_vertex_position(&mut out, &geo, 1));
    }
}

mod get_mesh_geometry_vertex_normal_test {
    use super::*;

    #[test]
    fn reads_the_normal() {
        let geo = make_one_vertex();
        let mut out = Vec3Out { x: 0.0, y: 0.0, z: 0.0 };
        assert!(get_mesh_geometry_vertex_normal(&mut out, &geo, 0));
        assert_eq!(out.x, 0.0);
        assert_eq!(out.y, 1.0);
        assert_eq!(out.z, 0.0);
    }
}

mod get_mesh_geometry_vertex_tangent_test {
    use super::*;

    #[test]
    fn reads_the_tangent_including_w() {
        let geo = make_one_vertex();
        let mut out = Vec4Out { x: 0.0, y: 0.0, z: 0.0, w: 0.0 };
        assert!(get_mesh_geometry_vertex_tangent(&mut out, &geo, 0));
        assert_eq!(out.x, 1.0);
        assert_eq!(out.y, 0.0);
        assert_eq!(out.z, 0.0);
        assert_eq!(out.w, 1.0);
    }
}

mod get_mesh_geometry_vertex_uv0_test {
    use super::*;

    #[test]
    fn reads_the_uv0() {
        let geo = make_one_vertex();
        let mut out = Vec2Out { x: 0.0, y: 0.0 };
        assert!(get_mesh_geometry_vertex_uv0(&mut out, &geo, 0));
        assert!((out.x - 0.5).abs() < 1e-6);
        assert!((out.y - 0.75).abs() < 1e-6);
    }
}

mod set_mesh_geometry_vertex_position_test {
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

mod set_mesh_geometry_vertex_normal_test {
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
}

mod get_vertex_attribute_test {
    use super::*;

    #[test]
    fn returns_the_attribute_for_present_semantic() {
        let attr = get_vertex_attribute(&canonical_layout(), VertexSemantic::Normal);
        assert!(attr.is_some());
        let a = attr.unwrap();
        assert_eq!(a.byte_offset, 12);
        assert_eq!(a.format, VertexFormat::Float32x3);
    }

    #[test]
    fn returns_none_for_absent_semantic() {
        let attr = get_vertex_attribute(&canonical_layout(), VertexSemantic::Color0);
        assert!(attr.is_none());
    }
}

mod get_vertex_attribute_float_offset_test {
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
    fn returns_neg1_for_absent_semantic() {
        assert_eq!(get_vertex_attribute_float_offset(&canonical_layout(), VertexSemantic::Color0), -1);
    }
}
