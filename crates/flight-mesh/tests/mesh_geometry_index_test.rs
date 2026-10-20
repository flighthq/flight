use flight_mesh::*;

mod compact_mesh_geometry_vertices_test {
    use super::*;

    #[test]
    fn removes_unreferenced_vertices() {
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: Some(IndexBuffer::U16(vec![0, 2, 2])),
            layout: canonical_mesh_geometry_layout(),
            vertices: vec![0.0f32; 3 * 12],
            subsets: None,
            topology: None,
        });
        let compact = compact_mesh_geometry_vertices(&geometry);
        assert_eq!(get_mesh_geometry_vertex_count(&compact), 2);
    }

    #[test]
    fn clones_non_indexed_geometry_unchanged() {
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_mesh_geometry_layout(),
            vertices: vec![0.0f32; 3 * 12],
            subsets: None,
            topology: None,
        });
        let compact = compact_mesh_geometry_vertices(&geometry);
        assert_eq!(get_mesh_geometry_vertex_count(&compact), 3);
    }
}

mod compute_mesh_geometry_wireframe_indices_test {
    use super::*;

    #[test]
    fn produces_line_pairs_from_triangle_list() {
        let geometry = create_quad_mesh_geometry(1.0, 1.0);
        let wireframe = compute_mesh_geometry_wireframe_indices(&geometry);
        let line_count = match &wireframe {
            IndexBuffer::U16(v) => v.len(),
            IndexBuffer::U32(v) => v.len(),
            IndexBuffer::None => 0,
        };
        assert!(line_count > 0);
        assert_eq!(line_count % 2, 0);
    }
}

mod expand_mesh_geometry_indices_test {
    use super::*;

    #[test]
    fn produces_non_indexed_geometry_from_indexed() {
        let geometry = create_quad_mesh_geometry(1.0, 1.0);
        let expanded = expand_mesh_geometry_indices(&geometry);
        assert_eq!(get_mesh_geometry_index_count(&expanded), 0);
        assert_eq!(get_mesh_geometry_vertex_count(&expanded), 6);
    }

    #[test]
    fn preserves_vertex_data_through_expand() {
        let mut geometry = create_box_mesh_geometry(1.0, 1.0, 1.0);
        ensure_mesh_geometry_bounds(&mut geometry);
        let expanded = expand_mesh_geometry_indices(&geometry);
        assert!(get_mesh_geometry_vertex_count(&expanded) > 0);
    }
}

mod index_mesh_geometry_vertices_test {
    use super::*;

    #[test]
    fn indexes_an_expanded_geometry() {
        let base = create_box_mesh_geometry(1.0, 1.0, 1.0);
        let expanded = expand_mesh_geometry_indices(&base);
        let indexed = index_mesh_geometry_vertices(&expanded);
        assert!(get_mesh_geometry_index_count(&indexed) > 0);
        assert!(get_mesh_geometry_vertex_count(&indexed) <= get_mesh_geometry_vertex_count(&expanded));
    }
}

mod weld_mesh_geometry_vertices_test {
    use super::*;

    #[test]
    fn reduces_vertex_count_by_merging_duplicates() {
        let base = create_box_mesh_geometry(1.0, 1.0, 1.0);
        let expanded = expand_mesh_geometry_indices(&base);
        let welded = weld_mesh_geometry_vertices(&expanded);
        assert!(get_mesh_geometry_vertex_count(&welded) < get_mesh_geometry_vertex_count(&expanded));
    }
}
