use flight_mesh::*;
use flight_geometry::Aabb;

mod compute_mesh_geometry_bounds_test {
    use super::*;

    #[test]
    fn computes_tight_aabb_for_a_box() {
        let geometry = create_box_mesh_geometry(2.0, 4.0, 6.0);
        let mut bounds = Aabb::default();
        compute_mesh_geometry_bounds(&mut bounds, &geometry);
        assert!((bounds.min.x - (-1.0)).abs() < 1e-3);
        assert!((bounds.max.x - 1.0).abs() < 1e-3);
        assert!((bounds.min.y - (-2.0)).abs() < 1e-3);
        assert!((bounds.max.y - 2.0).abs() < 1e-3);
        assert!((bounds.min.z - (-3.0)).abs() < 1e-3);
        assert!((bounds.max.z - 3.0).abs() < 1e-3);
    }

    #[test]
    fn returns_infinity_for_empty_geometry() {
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_mesh_geometry_layout(),
            vertices: vec![],
            subsets: None,
            topology: None,
        });
        let mut bounds = Aabb::default();
        compute_mesh_geometry_bounds(&mut bounds, &geometry);
        assert!(bounds.min.x > bounds.max.x);
    }
}

mod compute_mesh_geometry_bounding_sphere_test {
    use super::*;

    #[test]
    fn encloses_a_unit_box() {
        let geometry = create_box_mesh_geometry(2.0, 2.0, 2.0);
        let mut center = Vec3Out { x: 0.0, y: 0.0, z: 0.0 };
        let radius = compute_mesh_geometry_bounding_sphere(&mut center, &geometry);
        assert!(radius >= 1.7);
        assert!((center.x).abs() < 1e-3);
        assert!((center.y).abs() < 1e-3);
        assert!((center.z).abs() < 1e-3);
    }

    #[test]
    fn returns_negative_radius_for_empty_geometry() {
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_mesh_geometry_layout(),
            vertices: vec![],
            subsets: None,
            topology: None,
        });
        let mut center = Vec3Out { x: 0.0, y: 0.0, z: 0.0 };
        let radius = compute_mesh_geometry_bounding_sphere(&mut center, &geometry);
        assert!(radius < 0.0);
    }
}

mod compute_mesh_geometry_flat_normals_test {
    use super::*;

    #[test]
    fn flat_normals_point_outward_on_a_box() {
        let mut geometry = create_box_mesh_geometry(1.0, 1.0, 1.0);
        compute_mesh_geometry_flat_normals(&mut geometry);
        let stride = 12usize;
        let count = get_mesh_geometry_vertex_count(&geometry);
        for i in 0..count as usize {
            let b = i * stride + 3;
            let nx = geometry.vertices[b];
            let ny = geometry.vertices[b + 1];
            let nz = geometry.vertices[b + 2];
            let len = (nx * nx + ny * ny + nz * nz).sqrt();
            assert!((len - 1.0).abs() < 1e-3, "vertex {} normal length {}", i, len);
        }
    }
}

mod compute_mesh_geometry_normals_test {
    use super::*;

    #[test]
    fn smooth_normals_are_mostly_unit_length() {
        let mut geometry = create_sphere_mesh_geometry(1.0, 16, 8);
        compute_mesh_geometry_normals(&mut geometry, None);
        let stride = 12usize;
        let count = get_mesh_geometry_vertex_count(&geometry);
        let mut unit_count = 0u32;
        for i in 0..count as usize {
            let b = i * stride + 3;
            let nx = geometry.vertices[b];
            let ny = geometry.vertices[b + 1];
            let nz = geometry.vertices[b + 2];
            let len = (nx * nx + ny * ny + nz * nz).sqrt();
            if (len - 1.0).abs() < 1e-2 {
                unit_count += 1;
            }
        }
        // Nearly all normals are unit; pole vertices may be degenerate
        assert!(unit_count as f32 / count as f32 > 0.95,
            "only {}/{} normals are unit length", unit_count, count);
    }
}

mod compute_mesh_geometry_position_groups_test {
    use super::*;

    #[test]
    fn groups_welded_vertices() {
        let geometry = create_box_mesh_geometry(1.0, 1.0, 1.0);
        let groups = compute_mesh_geometry_position_groups(&geometry);
        assert_eq!(groups.len() as u32, get_mesh_geometry_vertex_count(&geometry));
    }
}

mod compute_mesh_geometry_tangents_test {
    use super::*;

    #[test]
    fn computes_unit_tangents_on_a_box() {
        let mut geometry = create_box_mesh_geometry(1.0, 1.0, 1.0);
        compute_mesh_geometry_tangents(&mut geometry, None);
        let stride = 12usize;
        let count = get_mesh_geometry_vertex_count(&geometry);
        for i in 0..count as usize {
            let b = i * stride + 6;
            let tx = geometry.vertices[b];
            let ty = geometry.vertices[b + 1];
            let tz = geometry.vertices[b + 2];
            let len = (tx * tx + ty * ty + tz * tz).sqrt();
            assert!((len - 1.0).abs() < 1e-2, "vertex {} tangent length {}", i, len);
        }
    }
}

mod ensure_mesh_geometry_bounds_test {
    use super::*;

    #[test]
    fn computes_bounds_on_first_call_and_caches() {
        let mut geometry = create_box_mesh_geometry(1.0, 1.0, 1.0);
        geometry.bounds = None;
        let first = ensure_mesh_geometry_bounds(&mut geometry);
        assert!(first.is_some());
        let first_b = first.unwrap();
        assert!((first_b.max.x - 0.5).abs() < 1e-3);

        let second = ensure_mesh_geometry_bounds(&mut geometry);
        assert!(second.is_some());
        let second_b = second.unwrap();
        assert_eq!(first_b.max.x, second_b.max.x);
    }
}

mod refresh_mesh_geometry_bounds_test {
    use super::*;

    #[test]
    fn recomputes_bounds_after_vertex_modification() {
        let mut geometry = create_box_mesh_geometry(1.0, 1.0, 1.0);
        ensure_mesh_geometry_bounds(&mut geometry);
        geometry.vertices[0] = 100.0;
        geometry.version += 1;
        refresh_mesh_geometry_bounds(&mut geometry);
        let b = geometry.bounds.unwrap();
        assert!((b.max.x - 100.0).abs() < 1e-3);
    }
}
