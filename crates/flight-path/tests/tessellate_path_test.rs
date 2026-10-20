use flight_path::*;

mod tessellate_path_test {
    use super::*;

    #[test]
    fn returns_empty_for_empty_path() {
        let path = create_path(PathWinding::NonZero);
        let mesh = tessellate_path(&path, 0.25);
        assert!(mesh.vertices.is_empty());
        assert!(mesh.indices.is_empty());
    }

    #[test]
    fn triangulates_rectangle() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut path, 0.0, 0.0, 100.0, 100.0);
        let mesh = tessellate_path(&path, 0.25);
        assert!(mesh.vertices.len() >= 8);
        assert!(mesh.indices.len() >= 6);
        assert_eq!(mesh.indices.len() % 3, 0);
    }

    #[test]
    fn triangulates_triangle() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_move_to(&mut path, 0.0, 0.0);
        append_path_line_to(&mut path, 100.0, 0.0);
        append_path_line_to(&mut path, 50.0, 100.0);
        append_path_close(&mut path);
        let mesh = tessellate_path(&path, 0.25);
        assert_eq!(mesh.indices.len(), 3);
    }
}

mod tessellate_path_into_test {
    use super::*;

    #[test]
    fn reuses_mesh_object() {
        let mut path = create_path(PathWinding::NonZero);
        append_path_rectangle(&mut path, 0.0, 0.0, 100.0, 100.0);
        let mut mesh = PathMesh { vertices: Vec::new(), indices: Vec::new() };
        tessellate_path_into(&path, &mut mesh, 0.25);
        assert!(!mesh.vertices.is_empty());
        assert!(!mesh.indices.is_empty());
    }
}
