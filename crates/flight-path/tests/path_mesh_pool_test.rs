use flight_path::*;

mod acquire_path_mesh_test {
    use super::*;

    #[test]
    fn tessellates_path_into_acquired_mesh() {
        let mut pool = create_path_mesh_pool();
        let mut path = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut path, 0.0, 0.0, 100.0, 100.0);
        let mesh = acquire_path_mesh(&mut pool, &path, 0.25);
        assert!(!mesh.vertices.is_empty());
        assert!(!mesh.indices.is_empty());
    }
}

mod create_path_mesh_pool_test {
    use super::*;

    #[test]
    fn creates_empty_pool() {
        let _pool = create_path_mesh_pool();
    }
}

mod release_path_mesh_test {
    use super::*;

    #[test]
    fn returns_mesh_to_pool_for_reuse() {
        let mut pool = create_path_mesh_pool();
        let mut path = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut path, 0.0, 0.0, 100.0, 100.0);
        let mesh = acquire_path_mesh(&mut pool, &path, 0.25);
        release_path_mesh(&mut pool, mesh);
        let mesh2 = acquire_path_mesh(&mut pool, &path, 0.25);
        assert!(!mesh2.vertices.is_empty());
    }
}
