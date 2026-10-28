use flight_path::contract::*;

mod acquire_path_mesh {
    use super::*;

    #[test]
    fn returns_mesh_for_empty_path() {
        let mut pool = create_path_mesh_pool();
        let path = create_path(PathWinding::NonZero);
        let mesh = acquire_path_mesh(&mut pool, &path, Some(0.25));
        release_path_mesh(&mut pool, mesh);
    }

    #[test]
    fn returns_mesh_with_triangles_for_non_degenerate_path() {
        let mut pool = create_path_mesh_pool();
        let mut path = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut path, 0.0, 0.0, 10.0, 10.0);
        let mesh = acquire_path_mesh(&mut pool, &path, Some(0.25));
        assert!(mesh.indices.len() > 0);
        assert_eq!(mesh.indices.len() % 3, 0);
        release_path_mesh(&mut pool, mesh);
    }

    #[test]
    fn returns_consistent_tessellation_regardless_of_pooling() {
        let mut pool = create_path_mesh_pool();
        let mut path = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut path, 0.0, 0.0, 20.0, 20.0);
        let fresh = acquire_path_mesh(&mut pool, &path, Some(0.25));
        let fresh_indices = fresh.indices.clone();
        release_path_mesh(&mut pool, fresh);
        let reused = acquire_path_mesh(&mut pool, &path, Some(0.25));
        assert_eq!(reused.indices, fresh_indices);
        release_path_mesh(&mut pool, reused);
    }

    #[test]
    fn tessellates_path_into_acquired_mesh() {
        let mut pool = create_path_mesh_pool();
        let mut path = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut path, 0.0, 0.0, 100.0, 100.0);
        let mesh = acquire_path_mesh(&mut pool, &path, Some(0.25));
        assert!(!mesh.vertices.is_empty());
        assert!(!mesh.indices.is_empty());
    }
}

mod acquire_path_mesh_typed {
    use super::*;

    #[test]
    fn returns_a_path_mesh_typed_with_float32_and_uint32_arrays() {
        let mut pool = create_path_mesh_pool();
        let mut path = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut path, 0.0, 0.0, 5.0, 5.0);
        let mesh = acquire_path_mesh_typed(&mut pool, &path, None);
        let _vertices: &[f32] = &mesh.vertices;
        let _indices: &[u32] = &mesh.indices;
        release_path_mesh_typed(&mut pool, mesh);
    }

    #[test]
    fn returns_non_empty_typed_arrays_for_a_rectangle() {
        let mut pool = create_path_mesh_pool();
        let mut path = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut path, 0.0, 0.0, 100.0, 50.0);
        let mesh = acquire_path_mesh_typed(&mut pool, &path, None);
        assert!(!mesh.vertices.is_empty());
        assert!(!mesh.indices.is_empty());
    }

    #[test]
    fn reuses_a_released_wrapper_and_its_typed_arrays() {
        let mut pool = create_path_mesh_pool();
        let mut path = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut path, 0.0, 0.0, 100.0, 50.0);
        let first = acquire_path_mesh_typed(&mut pool, &path, None);
        let vertices = first.vertices.as_ptr();
        let indices = first.indices.as_ptr();
        release_path_mesh_typed(&mut pool, first);
        let second = acquire_path_mesh_typed(&mut pool, &path, None);
        assert_eq!(second.vertices.as_ptr(), vertices);
        assert_eq!(second.indices.as_ptr(), indices);
    }
}

mod create_path_mesh_pool {
    use super::*;

    #[test]
    fn creates_empty_pool() {
        let _pool = create_path_mesh_pool();
    }
}

mod release_path_mesh {
    use super::*;

    #[test]
    fn returns_mesh_to_pool_for_reuse() {
        let mut pool = create_path_mesh_pool();
        let mut path = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut path, 0.0, 0.0, 100.0, 100.0);
        let mesh = acquire_path_mesh(&mut pool, &path, Some(0.25));
        release_path_mesh(&mut pool, mesh);
        let mesh2 = acquire_path_mesh(&mut pool, &path, Some(0.25));
        assert!(!mesh2.vertices.is_empty());
    }

    #[test]
    fn can_be_called_without_error() {
        let mut pool = create_path_mesh_pool();
        let path = create_path(PathWinding::NonZero);
        let mesh = acquire_path_mesh(&mut pool, &path, Some(0.25));
        release_path_mesh(&mut pool, mesh);
    }
}

mod release_path_mesh_typed {
    use super::*;

    #[test]
    fn can_be_called_on_an_acquired_typed_mesh_without_error() {
        let mut pool = create_path_mesh_pool();
        let mut path = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut path, 0.0, 0.0, 10.0, 10.0);
        let mesh = acquire_path_mesh_typed(&mut pool, &path, None);
        release_path_mesh_typed(&mut pool, mesh);
    }
}
