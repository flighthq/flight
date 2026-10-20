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

fn position_only_layout() -> VertexAttributeLayout {
    return VertexAttributeLayout {
        attributes: vec![
            VertexAttribute { byte_offset: 0, format: VertexFormat::Float32x3, semantic: VertexSemantic::Position },
        ],
        stride: 12,
    };
}

mod create_mesh_geometry_from_attributes_test {
    use super::*;

    #[test]
    fn builds_a_triangle_from_positions_computing_normals() {
        let geo = create_mesh_geometry_from_attributes(MeshGeometryFromAttributesOptions {
            positions: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            normals: None,
            uvs: None,
            indices: Some(vec![0, 1, 2]),
        });
        assert_eq!(get_mesh_geometry_vertex_count(&geo), 3);
        assert_eq!(get_mesh_geometry_index_count(&geo), 3);
        assert!((geo.vertices[5] - 1.0).abs() < 0.01);
    }

    #[test]
    fn computes_bounds() {
        let geo = create_mesh_geometry_from_attributes(MeshGeometryFromAttributesOptions {
            positions: vec![0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 0.0, 2.0, 0.0],
            normals: None,
            uvs: None,
            indices: None,
        });
        assert!((geo.bounds.unwrap().max.x - 2.0).abs() < 1e-6);
    }
}

mod get_mesh_geometry_triangle_count_test {
    use super::*;

    #[test]
    fn returns_index_div_3_for_triangle_list() {
        let geo = create_box_mesh_geometry(1.0, 1.0, 1.0);
        assert_eq!(get_mesh_geometry_triangle_count(&geo), get_mesh_geometry_index_count(&geo) / 3);
    }

    #[test]
    fn returns_0_for_point_list() {
        let geo = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            vertices: vec![0.0f32; 12],
            subsets: None,
            topology: Some(PrimitiveTopology::PointList),
        });
        assert_eq!(get_mesh_geometry_triangle_count(&geo), 0);
    }
}

mod get_mesh_geometry_triangle_vertex_indices_test {
    use super::*;

    #[test]
    fn resolves_indexed_triangle_lists() {
        let indexed = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(vec![2, 0, 1])),
            layout: position_only_layout(),
            vertices: vec![0.0f32; 9],
            subsets: None,
            topology: None,
        });
        let mut out = MeshTriangleVertexIndices { i0: 0, i1: 0, i2: 0 };
        assert!(get_mesh_geometry_triangle_vertex_indices(&mut out, &indexed, 0));
        assert_eq!(out.i0, 2);
        assert_eq!(out.i1, 0);
        assert_eq!(out.i2, 1);
    }
}

mod merge_mesh_geometries_test {
    use super::*;

    #[test]
    fn returns_none_for_empty_array() {
        let result: Option<MeshGeometry> = merge_mesh_geometries(&[]);
        assert!(result.is_none());
    }

    #[test]
    fn concatenates_vertices_from_two_geometries() {
        let a = create_quad_mesh_geometry(1.0, 1.0);
        let b = create_quad_mesh_geometry(1.0, 1.0);
        let a_vc = get_mesh_geometry_vertex_count(&a);
        let b_vc = get_mesh_geometry_vertex_count(&b);
        let merged = merge_mesh_geometries(&[&a, &b]);
        assert!(merged.is_some());
        assert_eq!(get_mesh_geometry_vertex_count(&merged.unwrap()), a_vc + b_vc);
    }
}

mod validate_mesh_geometry_test {
    use super::*;

    #[test]
    fn returns_true_for_a_valid_geometry() {
        assert!(validate_mesh_geometry(&create_box_mesh_geometry(1.0, 1.0, 1.0)));
    }

    #[test]
    fn returns_false_when_indices_reference_out_of_range() {
        let geo = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(vec![0, 1, 99])),
            layout: canonical_layout(),
            vertices: vec![0.0f32; 3 * 12],
            subsets: None,
            topology: None,
        });
        assert!(!validate_mesh_geometry(&geo));
    }

    #[test]
    fn returns_false_when_positions_contain_nan() {
        let mut verts = vec![0.0f32; 12];
        verts[0] = f32::NAN;
        let geo = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            vertices: verts,
            subsets: None,
            topology: None,
        });
        assert!(!validate_mesh_geometry(&geo));
    }
}
