use flight_meshgeometry::contract::*;

mod clone_mesh_geometry_for_deformation {
    use super::*;

    #[test]
    fn clones_and_restores_morph_bind_pose_positions() {
        let mut geometry = create_box_mesh_geometry(Some(1.0), Some(1.0), Some(1.0));

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
            assert!(
                (clone.vertices[i * stride] - 999.0).abs() > 0.01 || i >= count,
                "vertex {} should be restored from bind pose",
                i
            );
        }
        assert!(clone.bounds.is_some());
    }

    #[test]
    fn clones_normally_when_no_bind_pose_is_captured() {
        let geometry = create_box_mesh_geometry(Some(1.0), Some(1.0), Some(1.0));
        let clone = clone_mesh_geometry_for_deformation(&geometry);
        assert_eq!(
            get_mesh_geometry_vertex_count(&clone),
            get_mesh_geometry_vertex_count(&geometry)
        );
        assert!(clone.bounds.is_some());
    }

    #[test]
    fn restores_a_captured_skin_base_when_no_deeper_morph_base_exists() {
        let skinned_layout = CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT.clone();
        let stride = skinned_layout.read().unwrap().stride as usize / 4;
        let mut vertices = vec![0.0f32; stride];
        vertices[0] = 9.0;
        vertices[4] = 9.0;
        let mut source = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: skinned_layout,
            vertices: (vertices).into(),
            subsets: None,
            topology: None,
        });
        let bind_pose = MeshSkinBindPose {
            joints: (vec![0.0; 4]).into(),
            normals: (vec![0.0, 1.0, 0.0]).into(),
            positions: (vec![1.0, 2.0, 3.0]).into(),
            skinned_normals: (vec![0.0; 3]).into(),
            skinned_positions: (vec![0.0; 3]).into(),
            skinned_tangents: (vec![]).into(),
            tangents: (vec![]).into(),
            weights: (vec![0.0; 4]).into(),
        };
        set_mesh_geometry_skin_bind_pose(&mut source, Some(bind_pose));

        let clone = clone_mesh_geometry_for_deformation(&source);

        assert_eq!(clone.vertices[0], 1.0);
        assert_eq!(clone.vertices[1], 2.0);
        assert_eq!(clone.vertices[2], 3.0);
        assert_eq!(clone.vertices[3], 0.0);
        assert_eq!(clone.vertices[4], 1.0);
        assert_eq!(clone.vertices[5], 0.0);
        assert!(get_mesh_geometry_skin_bind_pose(&clone).is_none());
    }
}
