use flight_mesh::*;
use flight_geometry::Matrix4;

mod center_mesh_geometry_test {
    use super::*;

    #[test]
    fn centers_an_offset_box_at_the_origin() {
        let mut geometry = create_box_mesh_geometry(2.0, 2.0, 2.0);
        translate_mesh_geometry(&mut geometry, 5.0, 10.0, 15.0);
        center_mesh_geometry(&mut geometry);
        let b = geometry.bounds.unwrap();
        let cx = (b.min.x + b.max.x) * 0.5;
        let cy = (b.min.y + b.max.y) * 0.5;
        let cz = (b.min.z + b.max.z) * 0.5;
        assert!(cx.abs() < 1e-3);
        assert!(cy.abs() < 1e-3);
        assert!(cz.abs() < 1e-3);
    }
}

mod scale_mesh_geometry_test {
    use super::*;

    #[test]
    fn doubles_the_bounds() {
        let mut geometry = create_box_mesh_geometry(2.0, 2.0, 2.0);
        ensure_mesh_geometry_bounds(&mut geometry);
        scale_mesh_geometry(&mut geometry, 2.0, 2.0, 2.0);
        ensure_mesh_geometry_bounds(&mut geometry);
        let b = geometry.bounds.unwrap();
        assert!((b.max.x - 2.0).abs() < 1e-3);
        assert!((b.max.y - 2.0).abs() < 1e-3);
        assert!((b.max.z - 2.0).abs() < 1e-3);
    }

    #[test]
    fn normals_remain_unit_length_after_non_uniform_scale() {
        let mut geometry = create_box_mesh_geometry(1.0, 1.0, 1.0);
        scale_mesh_geometry(&mut geometry, 1.0, 2.0, 0.5);
        let stride = 12usize;
        let count = get_mesh_geometry_vertex_count(&geometry);
        for i in 0..count as usize {
            let b = i * stride + 3;
            let len = (geometry.vertices[b] * geometry.vertices[b]
                + geometry.vertices[b + 1] * geometry.vertices[b + 1]
                + geometry.vertices[b + 2] * geometry.vertices[b + 2])
                .sqrt();
            assert!((len - 1.0).abs() < 1e-3, "vertex {} normal length {}", i, len);
        }
    }
}

mod transform_mesh_geometry_test {
    use super::*;

    #[test]
    fn identity_matrix_leaves_geometry_unchanged() {
        let source = create_box_mesh_geometry(1.0, 1.0, 1.0);
        let original_vertices = source.vertices.clone();
        let mut geometry = clone_mesh_geometry(&source);
        let identity = Matrix4 {
            m: [
                1.0, 0.0, 0.0, 0.0,
                0.0, 1.0, 0.0, 0.0,
                0.0, 0.0, 1.0, 0.0,
                0.0, 0.0, 0.0, 1.0,
            ],
        };
        let result = transform_mesh_geometry(&mut geometry, &identity);
        assert!(result);
        for i in 0..original_vertices.len() {
            assert!((geometry.vertices[i] - original_vertices[i]).abs() < 1e-6,
                "vertex[{}]: {} vs {}", i, geometry.vertices[i], original_vertices[i]);
        }
    }

    #[test]
    fn translation_matrix_offsets_positions() {
        let mut geometry = create_quad_mesh_geometry(1.0, 1.0);
        let translation = Matrix4 {
            m: [
                1.0, 0.0, 0.0, 0.0,
                0.0, 1.0, 0.0, 0.0,
                0.0, 0.0, 1.0, 0.0,
                10.0, 20.0, 30.0, 1.0,
            ],
        };
        let result = transform_mesh_geometry(&mut geometry, &translation);
        assert!(result);
        ensure_mesh_geometry_bounds(&mut geometry);
        let b = geometry.bounds.unwrap();
        assert!((((b.min.x + b.max.x) * 0.5) - 10.0).abs() < 1e-3);
    }
}

mod translate_mesh_geometry_test {
    use super::*;

    #[test]
    fn offsets_all_positions_and_bounds() {
        let mut geometry = create_box_mesh_geometry(2.0, 2.0, 2.0);
        ensure_mesh_geometry_bounds(&mut geometry);
        let v0 = geometry.version;
        translate_mesh_geometry(&mut geometry, 10.0, 20.0, 30.0);
        ensure_mesh_geometry_bounds(&mut geometry);
        let b = geometry.bounds.unwrap();
        assert!((((b.min.x + b.max.x) * 0.5) - 10.0).abs() < 1e-3);
        assert!((((b.min.y + b.max.y) * 0.5) - 20.0).abs() < 1e-3);
        assert!((((b.min.z + b.max.z) * 0.5) - 30.0).abs() < 1e-3);
        assert!(geometry.version > v0);
    }
}
