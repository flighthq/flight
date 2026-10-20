use flight_mesh::*;

fn make_simple_geometry() -> MeshGeometry {
    let mut vertices = vec![0.0f32; 3 * 12];
    // Three vertices at (0,0,0), (1,0,0), (0,1,0)
    vertices[0] = 0.0; vertices[1] = 0.0; vertices[2] = 0.0;
    vertices[12] = 1.0; vertices[13] = 0.0; vertices[14] = 0.0;
    vertices[24] = 0.0; vertices[25] = 1.0; vertices[26] = 0.0;
    // Normals all (0,0,1)
    vertices[3] = 0.0; vertices[4] = 0.0; vertices[5] = 1.0;
    vertices[15] = 0.0; vertices[16] = 0.0; vertices[17] = 1.0;
    vertices[27] = 0.0; vertices[28] = 0.0; vertices[29] = 1.0;
    return create_mesh_geometry(MeshGeometryOptions {
        indices: Some(IndexBuffer::U16(vec![0, 1, 2])),
        layout: canonical_mesh_geometry_layout(),
        vertices,
        subsets: None,
        topology: None,
    });
}

mod capture_mesh_morph_bind_pose_test {
    use super::*;

    #[test]
    fn captures_positions_and_normals() {
        let geometry = make_simple_geometry();
        let bind_pose = capture_mesh_morph_bind_pose(&geometry);
        assert_eq!(bind_pose.positions.len(), 9);
        assert_eq!(bind_pose.positions[0], 0.0);
        assert_eq!(bind_pose.positions[3], 1.0);
        assert_eq!(bind_pose.positions[6], 0.0);
        assert!(bind_pose.normals.is_some());
        let normals = bind_pose.normals.unwrap();
        assert_eq!(normals[2], 1.0);
        assert!(bind_pose.tangents.is_some());
    }

    #[test]
    fn allocates_blended_scratch_arrays() {
        let geometry = make_simple_geometry();
        let bind_pose = capture_mesh_morph_bind_pose(&geometry);
        assert_eq!(bind_pose.blended_positions.len(), 9);
        assert!(bind_pose.blended_normals.is_some());
    }
}

mod blend_mesh_geometry_morph_test {
    use super::*;

    #[test]
    fn blends_positions_by_weight() {
        let mut geometry = make_simple_geometry();
        let mut bind_pose = capture_mesh_morph_bind_pose(&geometry);

        let morph = MeshMorph {
            targets: vec![MeshMorphTarget {
                position_deltas: vec![
                    10.0, 0.0, 0.0,
                    10.0, 0.0, 0.0,
                    10.0, 0.0, 0.0,
                ],
                normal_deltas: None,
                tangent_deltas: None,
            }],
            weights: vec![0.5],
        };

        blend_mesh_geometry_morph(&mut geometry, &morph, &mut bind_pose);
        // position[0].x = 0 + 0.5 * 10 = 5.0
        assert!((geometry.vertices[0] - 5.0).abs() < 1e-3);
        // position[1].x = 1 + 0.5 * 10 = 6.0
        assert!((geometry.vertices[12] - 6.0).abs() < 1e-3);
    }

    #[test]
    fn weight_zero_leaves_base_positions_unchanged() {
        let mut geometry = make_simple_geometry();
        let original_pos0 = geometry.vertices[0];
        let mut bind_pose = capture_mesh_morph_bind_pose(&geometry);

        let morph = MeshMorph {
            targets: vec![MeshMorphTarget {
                position_deltas: vec![100.0, 0.0, 0.0, 100.0, 0.0, 0.0, 100.0, 0.0, 0.0],
                normal_deltas: None,
                tangent_deltas: None,
            }],
            weights: vec![0.0],
        };

        blend_mesh_geometry_morph(&mut geometry, &morph, &mut bind_pose);
        assert!((geometry.vertices[0] - original_pos0).abs() < 1e-6);
    }
}
