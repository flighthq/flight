use flight_path::contract::*;

fn mesh_area(mesh: &PathMesh) -> f64 {
    let mut area = 0.0;
    let mut i = 0;
    while i < mesh.indices.len() {
        let i0 = mesh.indices[i] as usize;
        let i1 = mesh.indices[i + 1] as usize;
        let i2 = mesh.indices[i + 2] as usize;
        let ax = mesh.vertices[i0 * 2];
        let ay = mesh.vertices[i0 * 2 + 1];
        let bx = mesh.vertices[i1 * 2];
        let by = mesh.vertices[i1 * 2 + 1];
        let cx = mesh.vertices[i2 * 2];
        let cy = mesh.vertices[i2 * 2 + 1];
        area += ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)).abs() / 2.0;
        i += 3;
    }
    return area;
}

fn polygon(points: &[f64]) -> Path {
    let mut path = create_path(Some(PathWinding::NonZero));
    append_path_move_to(&mut path, points[0], points[1]);
    let mut i = 2;
    while i < points.len() {
        append_path_line_to(&mut path, points[i], points[i + 1]);
        i += 2;
    }
    return path;
}

mod tessellate_path {
    use super::*;

    #[test]
    fn triangulates_triangle_into_one_triangle() {
        let path = polygon(&[0.0, 0.0, 10.0, 0.0, 0.0, 10.0]);
        let mesh = tessellate_path(&path, Some(0.25));
        assert_eq!(mesh.indices.len(), 3);
        assert!((mesh_area(&mesh) - 50.0).abs() < 0.005);
    }

    #[test]
    fn triangulates_square_into_two_triangles_covering_its_area() {
        let path = polygon(&[0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0]);
        let mesh = tessellate_path(&path, Some(0.25));
        assert_eq!(mesh.indices.len(), 6);
        assert!((mesh_area(&mesh) - 100.0).abs() < 0.005);
    }

    #[test]
    fn triangulates_concave_l_shape_conserving_area() {
        let path = polygon(&[
            0.0, 0.0, 20.0, 0.0, 20.0, 10.0, 10.0, 10.0, 10.0, 20.0, 0.0, 20.0,
        ]);
        let mesh = tessellate_path(&path, Some(0.25));
        assert_eq!(mesh.indices.len(), 12);
        assert!((mesh_area(&mesh) - 300.0).abs() < 0.005);
    }

    #[test]
    fn drops_trailing_point_that_closes_contour_explicitly() {
        let path = polygon(&[0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0, 0.0, 0.0]);
        let mesh = tessellate_path(&path, Some(0.25));
        assert_eq!(mesh.vertices.len(), 8);
        assert!((mesh_area(&mesh) - 100.0).abs() < 0.005);
    }

    #[test]
    fn produces_empty_mesh_for_degenerate_contour() {
        let path = polygon(&[0.0, 0.0, 10.0, 0.0]);
        let mesh = tessellate_path(&path, Some(0.25));
        assert!(mesh.indices.is_empty());
        assert!(mesh.vertices.is_empty());
    }

    #[test]
    fn returns_empty_for_empty_path() {
        let path = create_path(Some(PathWinding::NonZero));
        let mesh = tessellate_path(&path, Some(0.25));
        assert!(mesh.vertices.is_empty());
        assert!(mesh.indices.is_empty());
    }

    #[test]
    fn triangulates_rectangle() {
        let mut path = create_path(Some(PathWinding::NonZero));
        append_path_rectangle(&mut path, 0.0, 0.0, 100.0, 100.0);
        let mesh = tessellate_path(&path, Some(0.25));
        assert!(mesh.vertices.len() >= 8);
        assert!(mesh.indices.len() >= 6);
        assert_eq!(mesh.indices.len() % 3, 0);
    }
}

mod tessellate_path_into {
    use super::*;

    #[test]
    fn writes_same_result_as_tessellate_path_into_provided_mesh() {
        let path = polygon(&[0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0]);
        let expected = tessellate_path(&path, Some(0.25));
        let mut out = PathMesh {
            vertices: Vec::new(),
            indices: Vec::new(),
        };
        tessellate_path_into(&path, &mut out, Some(0.25));
        assert_eq!(out.vertices, expected.vertices);
        assert_eq!(out.indices, expected.indices);
    }

    #[test]
    fn clears_previous_contents_before_writing() {
        let path = polygon(&[0.0, 0.0, 10.0, 0.0, 0.0, 10.0]);
        let mut out = PathMesh {
            vertices: vec![99.0, 99.0, 99.0],
            indices: vec![0, 1, 2, 3],
        };
        tessellate_path_into(&path, &mut out, Some(0.25));
        assert_eq!(out.indices.len(), 3);
        assert_eq!(out.vertices.len(), 6);
    }

    #[test]
    fn reuses_output_vertex_and_index_storage_across_calls() {
        let path = polygon(&[0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0]);
        let mut out = PathMesh {
            vertices: Vec::new(),
            indices: Vec::new(),
        };

        tessellate_path_into(&path, &mut out, Some(0.25));
        let vertices_ptr = out.vertices.as_ptr();
        let vertices_capacity = out.vertices.capacity();
        let indices_ptr = out.indices.as_ptr();
        let indices_capacity = out.indices.capacity();
        tessellate_path_into(&path, &mut out, Some(0.25));

        assert_eq!(out.vertices.as_ptr(), vertices_ptr);
        assert_eq!(out.vertices.capacity(), vertices_capacity);
        assert_eq!(out.indices.as_ptr(), indices_ptr);
        assert_eq!(out.indices.capacity(), indices_capacity);
    }
}
