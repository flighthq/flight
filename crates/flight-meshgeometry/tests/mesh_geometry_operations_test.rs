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

fn position_only_layout() -> VertexAttributeLayout {
    return VertexAttributeLayout {
        attributes: vec![
            VertexAttribute { byte_offset: 0, format: VertexFormat::Float32x3, semantic: VertexSemantic::Position },
        ],
        stride: 12,
    };
}

mod create_mesh_geometry_from_attributes {
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
    fn uses_supplied_normals_without_recomputing() {
        let geo = create_mesh_geometry_from_attributes(MeshGeometryFromAttributesOptions {
            positions: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            normals: Some(vec![0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0]),
            uvs: None,
            indices: Some(vec![0, 1, 2]),
        });
        assert!((geo.vertices[5] - (-1.0)).abs() < 0.01);
    }

    #[test]
    fn computes_bounds() {
        let geo = create_mesh_geometry_from_attributes(MeshGeometryFromAttributesOptions {
            positions: vec![0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 0.0, 2.0, 0.0],
            normals: None,
            uvs: None,
            indices: None,
        });
        assert!((geo.bounds.as_ref().unwrap().max.x - 2.0).abs() < 1e-6);
        assert!((geo.bounds.as_ref().unwrap().max.y - 2.0).abs() < 1e-6);
    }
}

mod get_mesh_geometry_triangle_count {
    use super::*;

    #[test]
    fn returns_index_div_3_for_triangle_list() {
        let geo = create_box_mesh_geometry(Some(1.0), Some(1.0), Some(1.0));
        assert_eq!(get_mesh_geometry_triangle_count(&geo), get_mesh_geometry_index_count(&geo) / 3);
    }

    #[test]
    fn returns_0_for_point_list() {
        let geo = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            vertices: (vec![0.0f32; 12]).into(),
            subsets: None,
            topology: Some(PrimitiveTopology::PointList),});
        assert_eq!(get_mesh_geometry_triangle_count(&geo), 0);
    }

    #[test]
    fn returns_index_count_minus_2_for_triangle_strip() {
        let geo = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(IndexBufferU16 { data: (vec![0, 1, 2, 3]).into()})),
            layout: canonical_layout(),
            vertices: (vec![0.0f32; 4 * 12]).into(),
            subsets: None,
            topology: Some(PrimitiveTopology::TriangleStrip),});
        assert_eq!(get_mesh_geometry_triangle_count(&geo), 2);
    }
}

mod get_mesh_geometry_triangle_vertex_indices {
    use super::*;

    #[test]
    fn resolves_indexed_triangle_lists() {
        let indexed = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(IndexBufferU16 { data: (vec![2, 0, 1]).into()})),
            layout: position_only_layout(),
            vertices: (vec![0.0f32; 9]).into(),
            subsets: None,
            topology: None,});
        let mut out = MeshTriangleVertexIndices { i0: 0, i1: 0, i2: 0 };
        assert!(get_mesh_geometry_triangle_vertex_indices(&mut out, &indexed, 0));
        assert_eq!(out.i0, 2);
        assert_eq!(out.i1, 0);
        assert_eq!(out.i2, 1);
    }

    #[test]
    fn resolves_non_indexed_triangle_lists() {
        let sequential = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: position_only_layout(),
            vertices: (vec![0.0f32; 9]).into(),
            subsets: None,
            topology: None,});
        let mut out = MeshTriangleVertexIndices { i0: 0, i1: 0, i2: 0 };
        assert!(get_mesh_geometry_triangle_vertex_indices(&mut out, &sequential, 0));
        assert_eq!(out.i0, 0);
        assert_eq!(out.i1, 1);
        assert_eq!(out.i2, 2);
    }

    #[test]
    fn alternates_triangle_strip_winding_for_indexed_geometry() {
        let indexed = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(IndexBufferU16 { data: (vec![3, 1, 4, 2]).into()})),
            layout: position_only_layout(),
            vertices: (vec![0.0f32; 15]).into(),
            subsets: None,
            topology: Some(PrimitiveTopology::TriangleStrip),});
        let mut out = MeshTriangleVertexIndices { i0: 0, i1: 0, i2: 0 };
        assert!(get_mesh_geometry_triangle_vertex_indices(&mut out, &indexed, 0));
        assert_eq!(out.i0, 3);
        assert_eq!(out.i1, 1);
        assert_eq!(out.i2, 4);
        assert!(get_mesh_geometry_triangle_vertex_indices(&mut out, &indexed, 1));
        assert_eq!(out.i0, 4);
        assert_eq!(out.i1, 1);
        assert_eq!(out.i2, 2);
    }

    #[test]
    fn alternates_triangle_strip_winding_for_non_indexed_geometry() {
        let sequential = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: position_only_layout(),
            vertices: (vec![0.0f32; 12]).into(),
            subsets: None,
            topology: Some(PrimitiveTopology::TriangleStrip),});
        let mut out = MeshTriangleVertexIndices { i0: 0, i1: 0, i2: 0 };
        assert!(get_mesh_geometry_triangle_vertex_indices(&mut out, &sequential, 1));
        assert_eq!(out.i0, 2);
        assert_eq!(out.i1, 1);
        assert_eq!(out.i2, 3);
    }

    #[test]
    fn leaves_out_unchanged_for_unsupported_topology() {
        let points = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: position_only_layout(),
            vertices: (vec![0.0f32; 9]).into(),
            subsets: None,
            topology: Some(PrimitiveTopology::PointList),});
        let mut out = MeshTriangleVertexIndices { i0: 7, i1: 8, i2: 9 };
        assert!(!get_mesh_geometry_triangle_vertex_indices(&mut out, &points, 0));
        assert_eq!(out.i0, 7);
        assert_eq!(out.i1, 8);
        assert_eq!(out.i2, 9);
    }

    #[test]
    fn leaves_out_unchanged_for_out_of_range_triangle_index() {
        let triangles = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: position_only_layout(),
            vertices: (vec![0.0f32; 9]).into(),
            subsets: None,
            topology: None,});
        let mut out = MeshTriangleVertexIndices { i0: 7, i1: 8, i2: 9 };
        assert!(!get_mesh_geometry_triangle_vertex_indices(&mut out, &triangles, 1));
        assert_eq!(out.i0, 7);
        assert_eq!(out.i1, 8);
        assert_eq!(out.i2, 9);
    }
}

mod merge_mesh_geometries {
    use super::*;

    #[test]
    fn returns_none_for_empty_array() {
        let result: Option<MeshGeometry> = merge_mesh_geometries(&[]);
        assert!(result.is_none());
    }

    #[test]
    fn returns_none_on_layout_mismatch() {
        let a = create_quad_mesh_geometry(Some(1.0), Some(1.0));
        let b = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: position_only_layout(),
            vertices: (vec![0.0f32; 9]).into(),
            subsets: None,
            topology: None,});
        assert!(merge_mesh_geometries(&[&a, &b]).is_none());
    }

    #[test]
    fn returns_none_on_topology_mismatch() {
        let faces = create_quad_mesh_geometry(Some(1.0), Some(1.0));
        let lines = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: faces.layout.clone(),
            vertices: (vec![0.0f32; faces.vertices.len()]).into(),
            subsets: None,
            topology: Some(PrimitiveTopology::LineList),});
        assert!(merge_mesh_geometries(&[&faces, &lines]).is_none());
        assert!(merge_mesh_geometries(&[&lines, &faces]).is_none());
    }

    #[test]
    fn merges_geometries_that_share_a_non_default_topology() {
        let layout = create_quad_mesh_geometry(Some(1.0), Some(1.0)).layout;
        let a = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: layout.clone(),
            vertices: (vec![0.0f32; 24]).into(),
            subsets: None,
            topology: Some(PrimitiveTopology::LineList),});
        let b = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: layout.clone(),
            vertices: (vec![0.0f32; 24]).into(),
            subsets: None,
            topology: Some(PrimitiveTopology::LineList),});
        let merged = merge_mesh_geometries(&[&a, &b]);
        assert!(merged.is_some());
        assert_eq!(merged.unwrap().topology, PrimitiveTopology::LineList);
    }

    #[test]
    fn concatenates_vertices_from_two_geometries() {
        let a = create_quad_mesh_geometry(Some(1.0), Some(1.0));
        let b = create_quad_mesh_geometry(Some(1.0), Some(1.0));
        let a_vc = get_mesh_geometry_vertex_count(&a);
        let b_vc = get_mesh_geometry_vertex_count(&b);
        let merged = merge_mesh_geometries(&[&a, &b]);
        assert!(merged.is_some());
        assert_eq!(get_mesh_geometry_vertex_count(&merged.unwrap()), a_vc + b_vc);
    }

    #[test]
    fn offsets_indices_correctly() {
        let a = create_quad_mesh_geometry(Some(1.0), Some(1.0));
        let b = create_quad_mesh_geometry(Some(1.0), Some(1.0));
        let a_vert_count = get_mesh_geometry_vertex_count(&a);
        let a_idx_count = match &a.indices {
            IndexBuffer::U16(IndexBufferU16 { data: v }) => v.len(),
            IndexBuffer::U32(IndexBufferU32 { data: v }) => v.len(),
            IndexBuffer::None => get_mesh_geometry_vertex_count(&a) as usize,
        };
        let b_idx_count = match &b.indices {
            IndexBuffer::U16(IndexBufferU16 { data: v }) => v.len(),
            IndexBuffer::U32(IndexBufferU32 { data: v }) => v.len(),
            IndexBuffer::None => get_mesh_geometry_vertex_count(&b) as usize,
        };
        let merged = merge_mesh_geometries(&[&a, &b]).unwrap();
        for i in a_idx_count..a_idx_count + b_idx_count {
            let idx = match &merged.indices {
                IndexBuffer::U16(IndexBufferU16 { data: v }) => v[i] as u32,
                IndexBuffer::U32(IndexBufferU32 { data: v }) => v[i],
                IndexBuffer::None => i as u32,
            };
            assert!(idx >= a_vert_count);
        }
    }

    #[test]
    fn recomputes_bounds() {
        let a = create_quad_mesh_geometry(Some(1.0), Some(1.0));
        let merged = merge_mesh_geometries(&[&a, &a]);
        assert!(merged.unwrap().bounds.is_some());
    }

    #[test]
    fn carries_per_source_subsets() {
        let a = create_quad_mesh_geometry(Some(1.0), Some(1.0));
        let b = create_quad_mesh_geometry(Some(1.0), Some(1.0));
        let a_idx_count = match &a.indices {
            IndexBuffer::U16(IndexBufferU16 { data: v }) => v.len() as u32,
            IndexBuffer::U32(IndexBufferU32 { data: v }) => v.len() as u32,
            IndexBuffer::None => get_mesh_geometry_vertex_count(&a),
        };
        let merged = merge_mesh_geometries(&[&a, &b]).unwrap();
        assert_eq!(merged.subsets.len(), 2);
        assert_eq!(merged.subsets[0].index_offset, 0);
        assert_eq!(merged.subsets[1].index_offset, a_idx_count);
    }
}

mod validate_mesh_geometry {
    use super::*;

    #[test]
    fn returns_true_for_a_valid_geometry() {
        assert!(validate_mesh_geometry(&create_box_mesh_geometry(Some(1.0), Some(1.0), Some(1.0))));
    }

    #[test]
    fn returns_false_when_indices_reference_out_of_range_vertices() {
        let geo = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(IndexBufferU16 { data: (vec![0, 1, 99]).into()})),
            layout: canonical_layout(),
            vertices: (vec![0.0f32; 3 * 12]).into(),
            subsets: None,
            topology: None,});
        assert!(!validate_mesh_geometry(&geo));
    }

    #[test]
    fn returns_false_when_vertex_stream_is_not_stride_aligned() {
        let mut geo = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            vertices: (vec![0.0f32; 12]).into(),
            subsets: None,
            topology: None,});
        geo.vertices = vec![0.0f32; 13].into();
        assert!(!validate_mesh_geometry(&geo));
    }

    #[test]
    fn returns_false_when_positions_contain_nan() {
        let mut verts = vec![0.0f32; 12];
        verts[0] = f32::NAN;
        let geo = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            vertices: (verts).into(),
            subsets: None,
            topology: None,});
        assert!(!validate_mesh_geometry(&geo));
    }

    #[test]
    fn returns_false_when_positions_contain_infinity() {
        let mut verts = vec![0.0f32; 12];
        verts[2] = f32::INFINITY;
        let geo = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            vertices: (verts).into(),
            subsets: None,
            topology: None,});
        assert!(!validate_mesh_geometry(&geo));
    }

    #[test]
    fn returns_false_for_nan_in_a_normal() {
        let mut verts = vec![0.0f32; 12];
        verts[3] = f32::NAN;
        let geo = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            vertices: (verts).into(),
            subsets: None,
            topology: None,});
        assert!(!validate_mesh_geometry(&geo));
    }

    #[test]
    fn returns_false_for_nan_in_a_tangent() {
        let mut verts = vec![0.0f32; 12];
        verts[6] = f32::NAN;
        let geo = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            vertices: (verts).into(),
            subsets: None,
            topology: None,});
        assert!(!validate_mesh_geometry(&geo));
    }

    #[test]
    fn returns_false_for_nan_in_a_uv() {
        let mut verts = vec![0.0f32; 12];
        verts[10] = f32::NAN;
        let geo = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            vertices: (verts).into(),
            subsets: None,
            topology: None,});
        assert!(!validate_mesh_geometry(&geo));
    }

    #[test]
    fn returns_false_for_infinity_in_a_tangent() {
        let mut verts = vec![0.0f32; 12];
        verts[7] = f32::INFINITY;
        let geo = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            vertices: (verts).into(),
            subsets: None,
            topology: None,});
        assert!(!validate_mesh_geometry(&geo));
    }

    #[test]
    fn returns_false_for_subset_whose_draw_range_runs_past_index_buffer() {
        let mut geo = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(IndexBufferU16 { data: (vec![0, 1, 2]).into()})),
            layout: canonical_layout(),
            vertices: (vec![0.0f32; 3 * 12]).into(),
            subsets: None,
            topology: None,});
        geo.subsets = vec![MeshSubset { index_count: 99, index_offset: 2 }];
        assert!(!validate_mesh_geometry(&geo));
    }

    #[test]
    fn returns_false_for_element_count_that_cannot_form_whole_triangles() {
        let geo = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(IndexBufferU16 { data: (vec![0, 1, 2, 0]).into()})),
            layout: canonical_layout(),
            vertices: (vec![0.0f32; 3 * 12]).into(),
            subsets: None,
            topology: None,});
        assert!(!validate_mesh_geometry(&geo));
    }

    #[test]
    fn accepts_a_line_list_with_even_element_count_and_rejects_odd() {
        let even_geo = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(IndexBufferU16 { data: (vec![0, 1, 1, 2]).into()})),
            layout: canonical_layout(),
            vertices: (vec![0.0f32; 3 * 12]).into(),
            subsets: None,
            topology: Some(PrimitiveTopology::LineList),});
        let odd_geo = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(IndexBufferU16 { data: (vec![0, 1, 2]).into()})),
            layout: canonical_layout(),
            vertices: (vec![0.0f32; 3 * 12]).into(),
            subsets: None,
            topology: Some(PrimitiveTopology::LineList),});
        assert!(validate_mesh_geometry(&even_geo));
        assert!(!validate_mesh_geometry(&odd_geo));
    }

    #[test]
    fn accepts_an_empty_element_stream() {
        let geo = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(IndexBufferU16 { data: (vec![]).into()})),
            layout: canonical_layout(),
            vertices: (vec![0.0f32; 3 * 12]).into(),
            subsets: None,
            topology: None,});
        assert!(validate_mesh_geometry(&geo));
    }
}
