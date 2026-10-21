use flight_path::contract::*;

mod acquire_path_mesh {
    use super::*;

    #[test]
    fn returns_mesh_for_empty_path() {
        let mut pool = create_path_mesh_pool();
        let path = create_path(Some(PathWinding::NonZero));
        let mesh = acquire_path_mesh(&mut pool, &path, 0.25);
        release_path_mesh(&mut pool, mesh);
    }

    #[test]
    fn returns_mesh_with_triangles_for_non_degenerate_path() {
        let mut pool = create_path_mesh_pool();
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_rectangle(&mut path, 0.0, 0.0, 10.0, 10.0);
        let mesh = acquire_path_mesh(&mut pool, &path, 0.25);
        assert!(mesh.indices.len() > 0);
        assert_eq!(mesh.indices.len() % 3, 0);
        release_path_mesh(&mut pool, mesh);
    }

    #[test]
    fn returns_consistent_tessellation_regardless_of_pooling() {
        let mut pool = create_path_mesh_pool();
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_rectangle(&mut path, 0.0, 0.0, 20.0, 20.0);
        let fresh = acquire_path_mesh(&mut pool, &path, 0.25);
        let fresh_indices = fresh.indices.clone();
        release_path_mesh(&mut pool, fresh);
        let reused = acquire_path_mesh(&mut pool, &path, 0.25);
        assert_eq!(reused.indices, fresh_indices);
        release_path_mesh(&mut pool, reused);
    }

    #[test]
    fn tessellates_path_into_acquired_mesh() {
        let mut pool = create_path_mesh_pool();
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_rectangle(&mut path, 0.0, 0.0, 100.0, 100.0);
        let mesh = acquire_path_mesh(&mut pool, &path, 0.25);
        assert!(!mesh.vertices.is_empty());
        assert!(!mesh.indices.is_empty());
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
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_rectangle(&mut path, 0.0, 0.0, 100.0, 100.0);
        let mesh = acquire_path_mesh(&mut pool, &path, 0.25);
        release_path_mesh(&mut pool, mesh);
        let mesh2 = acquire_path_mesh(&mut pool, &path, 0.25);
        assert!(!mesh2.vertices.is_empty());
    }

    #[test]
    fn can_be_called_without_error() {
        let mut pool = create_path_mesh_pool();
        let path = create_path(Some(PathWinding::NonZero));
        let mesh = acquire_path_mesh(&mut pool, &path, 0.25);
        release_path_mesh(&mut pool, mesh);
    }
}
