use flight_mesh::*;

mod clone_mesh_geometry_for_deformation_test {
    use super::*;

    #[test]
    fn clones_and_restores_morph_bind_pose_positions() {
        let mut geometry = create_box_mesh_geometry(1.0, 1.0, 1.0);

        // Capture the bind pose
        let bind_pose = capture_mesh_morph_bind_pose(&geometry);
        set_mesh_geometry_morph_bind_pose(&mut geometry, Some(bind_pose));

        // Overwrite positions in the vertex stream to simulate morphing
        let stride = 12usize;
        let count = get_mesh_geometry_vertex_count(&geometry) as usize;
        for i in 0..count {
            geometry.vertices[i * stride] = 999.0;
        }

        // Clone for deformation should restore from bind pose
        let clone = clone_mesh_geometry_for_deformation(&geometry);
        for i in 0..count {
            assert!((clone.vertices[i * stride] - 999.0).abs() > 0.01 || i >= count,
                "vertex {} should be restored from bind pose", i);
        }
        assert!(clone.bounds.is_some());
    }

    #[test]
    fn clones_normally_when_no_bind_pose_is_captured() {
        let geometry = create_box_mesh_geometry(1.0, 1.0, 1.0);
        let clone = clone_mesh_geometry_for_deformation(&geometry);
        assert_eq!(get_mesh_geometry_vertex_count(&clone), get_mesh_geometry_vertex_count(&geometry));
        assert!(clone.bounds.is_some());
    }
}
