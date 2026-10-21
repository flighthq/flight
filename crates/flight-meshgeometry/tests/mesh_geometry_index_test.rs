use flight_meshgeometry::*;

fn canonical_layout() -> VertexAttributeLayout {
    return canonical_mesh_geometry_layout();
}

fn make_quad() -> MeshGeometry {
    let mut vertices = vec![0.0f32; 4 * 12];
    let set_position = |verts: &mut Vec<f32>, i: usize, x: f32, y: f32| {
        verts[i * 12] = x;
        verts[i * 12 + 1] = y;
    };
    set_position(&mut vertices, 0, 0.0, 0.0);
    set_position(&mut vertices, 1, 1.0, 0.0);
    set_position(&mut vertices, 2, 0.0, 1.0);
    set_position(&mut vertices, 3, 1.0, 1.0);
    return create_mesh_geometry(MeshGeometryOptions {
        indices: Some(IndexBuffer::U16(vec![0, 1, 2, 2, 1, 3])),
        layout: canonical_layout(),
        vertices,
        subsets: None,
        topology: None,
    });
}

mod compact_mesh_geometry_vertices {
    use super::*;

    #[test]
    fn removes_unreferenced_vertices() {
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(vec![0, 2, 2])),
            layout: canonical_layout(),
            vertices: vec![0.0f32; 3 * 12],
            subsets: None,
            topology: None,
        });
        let compact = compact_mesh_geometry_vertices(&geometry);
        assert_eq!(get_mesh_geometry_vertex_count(&compact), 2);
    }

    #[test]
    fn copies_complete_packed_records_byte_for_byte() {
        let layout = VertexAttributeLayout {
            attributes: vec![
                VertexAttribute { byte_offset: 0, format: VertexFormat::Unorm8x4, semantic: VertexSemantic::Color0 },
            ],
            stride: 4,
        };
        let mut vertices = vec![0.0f32; 3];
        let bytes = vertices_as_bytes_mut(&mut vertices);
        bytes[0] = 1; bytes[1] = 2; bytes[2] = 3; bytes[3] = 4;
        bytes[4] = 10; bytes[5] = 20; bytes[6] = 30; bytes[7] = 40;
        bytes[8] = 100; bytes[9] = 110; bytes[10] = 120; bytes[11] = 130;
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(vec![2, 0])),
            layout,
            vertices,
            subsets: None,
            topology: None,
        });
        let compacted = compact_mesh_geometry_vertices(&geometry);
        let out_bytes = vertices_as_bytes(&compacted.vertices);
        assert_eq!(&out_bytes[0..4], &[100, 110, 120, 130]);
        assert_eq!(&out_bytes[4..8], &[1, 2, 3, 4]);
    }

    #[test]
    fn clones_non_indexed_geometry_unchanged() {
        let mut geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            vertices: vec![0.0f32; 2 * 12],
            subsets: None,
            topology: None,
        });
        geometry.vertices[12] = 7.0;
        let compact = compact_mesh_geometry_vertices(&geometry);
        assert_eq!(compact.vertices[12], 7.0);
        match &compact.indices {
            IndexBuffer::None => {}
            _ => panic!("expected no indices"),
        }
    }

    #[test]
    fn returns_an_unchanged_deep_clone_for_out_of_range_source_index() {
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(vec![0, 3])),
            layout: canonical_layout(),
            vertices: vec![0.0f32; 2 * 12],
            subsets: None,
            topology: None,
        });
        let compacted = compact_mesh_geometry_vertices(&geometry);
        match &compacted.indices {
            IndexBuffer::U16(v) => assert_eq!(&v[..], &[0, 3]),
            _ => panic!("expected U16 indices"),
        }
    }
}

mod compute_mesh_geometry_wireframe_indices {
    use super::*;

    #[test]
    fn produces_line_pairs_from_triangle_list() {
        let geometry = make_quad();
        let wireframe = compute_mesh_geometry_wireframe_indices(&geometry);
        let line_count = match &wireframe {
            IndexBuffer::U16(v) => v.len(),
            IndexBuffer::U32(v) => v.len(),
            IndexBuffer::None => 0,
        };
        assert_eq!(line_count, 12);
        match &wireframe {
            IndexBuffer::U16(v) => {
                assert_eq!(&v[0..6], &[0, 1, 1, 2, 2, 0]);
            }
            _ => panic!("expected U16 wireframe"),
        }
    }

    #[test]
    fn mirrors_the_source_index_width() {
        let geometry = make_quad();
        let wireframe = compute_mesh_geometry_wireframe_indices(&geometry);
        match &wireframe {
            IndexBuffer::U16(_) => {}
            _ => panic!("expected U16 wireframe matching source index width"),
        }
    }

    #[test]
    fn returns_an_empty_buffer_for_non_triangle_topology() {
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(vec![0, 1])),
            layout: canonical_layout(),
            vertices: vec![0.0f32; 2 * 12],
            subsets: None,
            topology: Some(PrimitiveTopology::LineList),
        });
        let wireframe = compute_mesh_geometry_wireframe_indices(&geometry);
        let count = match &wireframe {
            IndexBuffer::U16(v) => v.len(),
            IndexBuffer::U32(v) => v.len(),
            IndexBuffer::None => 0,
        };
        assert_eq!(count, 0);
    }
}

mod expand_mesh_geometry_indices {
    use super::*;

    #[test]
    fn produces_non_indexed_geometry_from_indexed() {
        let mut geometry = make_quad();
        geometry.bounds = Some(flight_geometry::create_aabb(
            0.0, 0.0, 0.0, 1.0, 1.0, 0.0,
        ));
        geometry.subsets = vec![
            MeshSubset { index_count: 3, index_offset: 0 },
            MeshSubset { index_count: 3, index_offset: 3 },
        ];
        let expanded = expand_mesh_geometry_indices(&geometry);
        match &expanded.indices {
            IndexBuffer::None => {}
            _ => panic!("expected no indices after expand"),
        }
        assert_eq!(get_mesh_geometry_vertex_count(&expanded), 6);
        // Index 2 (position 0,1) appears at flat positions 2 and 3.
        assert_eq!(expanded.vertices[2 * 12], 0.0);
        assert_eq!(expanded.vertices[2 * 12 + 1], 1.0);
        assert_eq!(expanded.vertices[3 * 12], 0.0);
        assert_eq!(expanded.vertices[3 * 12 + 1], 1.0);
    }

    #[test]
    fn deep_copies_non_indexed_geometry_as_is() {
        let mut vertices = vec![0.0f32; 3 * 12];
        vertices[0] = 7.0;
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            vertices,
            subsets: None,
            topology: None,
        });
        let expanded = expand_mesh_geometry_indices(&geometry);
        match &expanded.indices {
            IndexBuffer::None => {}
            _ => panic!("expected no indices"),
        }
        assert_eq!(get_mesh_geometry_vertex_count(&expanded), 3);
        assert_eq!(expanded.vertices[0], 7.0);
    }

    #[test]
    fn preserves_vertex_data_through_expand() {
        let mut geometry = create_box_mesh_geometry(1.0, 1.0, 1.0);
        ensure_mesh_geometry_bounds(&mut geometry);
        let expanded = expand_mesh_geometry_indices(&geometry);
        assert!(get_mesh_geometry_vertex_count(&expanded) > 0);
    }
}

mod index_mesh_geometry_vertices {
    use super::*;

    #[test]
    fn adds_a_sequential_narrow_index_without_changing_vertex_identity() {
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            vertices: vec![0.0f32; 6 * 12],
            subsets: Some(vec![
                MeshSubset { index_count: 3, index_offset: 0 },
                MeshSubset { index_count: 3, index_offset: 3 },
            ]),
            topology: None,
        });
        let indexed = index_mesh_geometry_vertices(&geometry);
        match &indexed.indices {
            IndexBuffer::U16(v) => {
                assert_eq!(&v[..], &[0, 1, 2, 3, 4, 5]);
            }
            _ => panic!("expected U16 indices"),
        }
    }

    #[test]
    fn deep_clones_an_already_indexed_geometry_without_remapping() {
        let geometry = make_quad();
        let indexed = index_mesh_geometry_vertices(&geometry);
        match (&geometry.indices, &indexed.indices) {
            (IndexBuffer::U16(orig), IndexBuffer::U16(idx)) => {
                assert_eq!(&orig[..], &idx[..]);
            }
            _ => panic!("expected matching U16 indices"),
        }
    }

    #[test]
    fn indexes_an_expanded_geometry() {
        let base = create_box_mesh_geometry(1.0, 1.0, 1.0);
        let expanded = expand_mesh_geometry_indices(&base);
        let indexed = index_mesh_geometry_vertices(&expanded);
        assert!(get_mesh_geometry_index_count(&indexed) > 0);
        assert!(get_mesh_geometry_vertex_count(&indexed) <= get_mesh_geometry_vertex_count(&expanded));
    }
}

mod weld_mesh_geometry_vertices {
    use super::*;

    #[test]
    fn deduplicates_exact_records_and_remaps_a_sequential_element_stream() {
        let mut vertices = vec![0.0f32; 4 * 12];
        vertices[0] = 1.0;
        vertices[12] = 2.0;
        vertices[24] = 1.0;
        vertices[36] = 3.0;
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_layout(),
            vertices,
            subsets: None,
            topology: Some(PrimitiveTopology::LineStrip),
        });
        let welded = weld_mesh_geometry_vertices(&geometry);
        assert_eq!(get_mesh_geometry_vertex_count(&welded), 3);
        match &welded.indices {
            IndexBuffer::U16(v) => assert_eq!(&v[..], &[0, 1, 0, 2]),
            _ => panic!("expected U16 indices"),
        }
        assert_eq!(welded.topology, PrimitiveTopology::LineStrip);
    }

    #[test]
    fn compares_complete_packed_records_byte_for_byte() {
        let layout = VertexAttributeLayout {
            attributes: vec![
                VertexAttribute { byte_offset: 0, format: VertexFormat::Unorm8x4, semantic: VertexSemantic::Color0 },
            ],
            stride: 4,
        };
        let mut vertices = vec![0.0f32; 3];
        let bytes = vertices_as_bytes_mut(&mut vertices);
        bytes[0] = 255; bytes[1] = 0; bytes[2] = 0; bytes[3] = 255;
        bytes[4] = 0; bytes[5] = 255; bytes[6] = 0; bytes[7] = 255;
        bytes[8] = 255; bytes[9] = 0; bytes[10] = 0; bytes[11] = 255;
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout,
            vertices,
            subsets: None,
            topology: None,
        });
        let welded = weld_mesh_geometry_vertices(&geometry);
        assert_eq!(welded.vertices.len() * 4, 8); // 2 unique vertices * 4 bytes
        let out_bytes = vertices_as_bytes(&welded.vertices);
        assert_eq!(&out_bytes[0..4], &[255, 0, 0, 255]);
        assert_eq!(&out_bytes[4..8], &[0, 255, 0, 255]);
        match &welded.indices {
            IndexBuffer::U16(v) => assert_eq!(&v[..], &[0, 1, 0]),
            _ => panic!("expected U16 indices"),
        }
    }

    #[test]
    fn remaps_existing_indices_and_preserves_subset_ranges() {
        let mut geometry = make_quad();
        // Make vertex 3 a duplicate of vertex 0.
        let stride = 12;
        for i in 0..stride {
            geometry.vertices[3 * stride + i] = geometry.vertices[0 * stride + i];
        }
        let welded = weld_mesh_geometry_vertices(&geometry);
        match &welded.indices {
            IndexBuffer::U16(v) => {
                assert_eq!(&v[..], &[0, 1, 2, 2, 1, 0]);
            }
            _ => panic!("expected U16 indices"),
        }
    }

    #[test]
    fn returns_an_unchanged_deep_clone_for_invalid_source_indices() {
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(vec![0, 4])),
            layout: canonical_layout(),
            vertices: vec![0.0f32; 2 * 12],
            subsets: None,
            topology: None,
        });
        let welded = weld_mesh_geometry_vertices(&geometry);
        match &welded.indices {
            IndexBuffer::U16(v) => assert_eq!(&v[..], &[0, 4]),
            _ => panic!("expected U16 indices"),
        }
    }

    #[test]
    fn reduces_vertex_count_by_merging_duplicates() {
        let base = create_box_mesh_geometry(1.0, 1.0, 1.0);
        let expanded = expand_mesh_geometry_indices(&base);
        let welded = weld_mesh_geometry_vertices(&expanded);
        assert!(get_mesh_geometry_vertex_count(&welded) < get_mesh_geometry_vertex_count(&expanded));
    }
}
