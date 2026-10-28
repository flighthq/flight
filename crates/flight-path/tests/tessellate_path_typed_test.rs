use flight_path::contract::*;

fn rectangle_path(x: f64, y: f64, w: f64, h: f64) -> Path {
    let mut path = create_path(PathWinding::NonZero);
    append_path_rectangle(&mut path, x, y, w, h);
    return path;
}

mod tessellate_path_typed {
    use super::*;

    #[test]
    fn returns_float32_vertices_and_uint32_indices() {
        let mesh = tessellate_path_typed(&rectangle_path(0.0, 0.0, 100.0, 100.0), None);
        let _vertices: &[f32] = &mesh.vertices;
        let _indices: &[u32] = &mesh.indices;
        assert!(!mesh.vertices.is_empty() && !mesh.indices.is_empty());
    }

    #[test]
    fn produces_the_same_values_as_tessellate_path() {
        let path = rectangle_path(10.0, 20.0, 80.0, 60.0);
        let typed = tessellate_path_typed(&path, None);
        let plain = tessellate_path(&path, None);
        let narrowed: Vec<f32> = plain.vertices.iter().map(|v| *v as f32).collect();
        assert_eq!(typed.vertices.to_vec(), narrowed);
        assert_eq!(typed.indices.to_vec(), plain.indices);
    }

    #[test]
    fn returns_empty_typed_arrays_for_an_empty_path() {
        let mesh = tessellate_path_typed(&create_path(PathWinding::NonZero), None);
        assert_eq!(mesh.vertices.len(), 0);
        assert_eq!(mesh.indices.len(), 0);
    }
}

mod tessellate_path_typed_into {
    use super::*;

    #[test]
    fn writes_into_an_existing_path_mesh_typed_with_the_same_values() {
        let path = rectangle_path(0.0, 0.0, 100.0, 100.0);
        let expected = tessellate_path(&path, None);
        let mut out = PathMeshTyped {
            vertices: Vec::new().into_boxed_slice(),
            indices: Vec::new().into_boxed_slice(),
        };
        tessellate_path_typed_into(&path, &mut out, None);
        let narrowed: Vec<f32> = expected.vertices.iter().map(|v| *v as f32).collect();
        assert_eq!(out.vertices[..narrowed.len()].to_vec(), narrowed);
        assert_eq!(
            out.indices[..expected.indices.len()].to_vec(),
            expected.indices
        );
    }

    #[test]
    fn grows_typed_arrays_when_the_mesh_exceeds_capacity() {
        let path = rectangle_path(0.0, 0.0, 50.0, 50.0);
        let mut out = PathMeshTyped {
            vertices: vec![0.0; 2].into_boxed_slice(),
            indices: vec![0; 1].into_boxed_slice(),
        };
        tessellate_path_typed_into(&path, &mut out, None);
        assert!(out.vertices.len() >= 8);
        assert!(out.indices.len() >= 6);
    }

    #[test]
    fn reuses_typed_arrays_when_capacity_is_sufficient() {
        let path = rectangle_path(0.0, 0.0, 50.0, 50.0);
        let mut big = PathMeshTyped {
            vertices: vec![0.0; 1000].into_boxed_slice(),
            indices: vec![0; 1000].into_boxed_slice(),
        };
        let v_ref = big.vertices.as_ptr();
        let i_ref = big.indices.as_ptr();
        tessellate_path_typed_into(&path, &mut big, None);
        assert_eq!(big.vertices.as_ptr(), v_ref);
        assert_eq!(big.indices.as_ptr(), i_ref);
    }
}
