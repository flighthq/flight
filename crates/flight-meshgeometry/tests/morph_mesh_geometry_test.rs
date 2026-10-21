use flight_meshgeometry::contract::*;

fn make_simple_geometry() -> MeshGeometry {
    let mut vertices = vec![0.0f32; 3 * 12];
    vertices[0] = 0.0; vertices[1] = 0.0; vertices[2] = 0.0;
    vertices[12] = 1.0; vertices[13] = 0.0; vertices[14] = 0.0;
    vertices[24] = 0.0; vertices[25] = 1.0; vertices[26] = 0.0;
    vertices[3] = 0.0; vertices[4] = 0.0; vertices[5] = 1.0;
    vertices[15] = 0.0; vertices[16] = 0.0; vertices[17] = 1.0;
    vertices[27] = 0.0; vertices[28] = 0.0; vertices[29] = 1.0;
    return create_mesh_geometry(MeshGeometryOptions {
        indices: Some(IndexBuffer::U16(IndexBufferU16 { data: vec![0, 1, 2] })),
        layout: CANONICAL_MESH_GEOMETRY_LAYOUT.clone(),
        vertices,
        subsets: None,
        topology: None,
    });
}

mod blend_mesh_geometry_morph {
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
        assert!((geometry.vertices[0] - 5.0).abs() < 1e-3);
        assert!((geometry.vertices[12] - 6.0).abs() < 1e-3);
    }

    #[test]
    fn bumps_geometry_version_so_backends_re_upload() {
        let mut geometry = make_simple_geometry();
        let mut bind_pose = capture_mesh_morph_bind_pose(&geometry);
        let before = geometry.version;
        let morph = MeshMorph {
            targets: vec![MeshMorphTarget {
                position_deltas: vec![1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
                normal_deltas: None,
                tangent_deltas: None,
            }],
            weights: vec![1.0],
        };
        blend_mesh_geometry_morph(&mut geometry, &morph, &mut bind_pose);
        assert_eq!(geometry.version, before + 1);
    }

    #[test]
    fn is_idempotent_across_frames() {
        let position_layout = VertexAttributeLayout {
            attributes: vec![
                VertexAttribute { byte_offset: 0, format: VertexFormat::Float32x3, semantic: VertexSemantic::Position },
            ],
            stride: 12,
        };
        let mut geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: position_layout,
            vertices: vec![0.0, 0.0, 0.0],
            subsets: None,
            topology: None,
        });
        let mut bind_pose = capture_mesh_morph_bind_pose(&geometry);
        let morph = MeshMorph {
            targets: vec![MeshMorphTarget {
                position_deltas: vec![1.0, 0.0, 0.0],
                normal_deltas: None,
                tangent_deltas: None,
            }],
            weights: vec![1.0],
        };
        blend_mesh_geometry_morph(&mut geometry, &morph, &mut bind_pose);
        blend_mesh_geometry_morph(&mut geometry, &morph, &mut bind_pose);
        assert!((geometry.vertices[0] - 1.0).abs() < 1e-6);
        assert!((geometry.vertices[1] - 0.0).abs() < 1e-6);
        assert!((geometry.vertices[2] - 0.0).abs() < 1e-6);
    }

    #[test]
    fn morphs_normals_and_tangent_xyz_but_leaves_tangent_w_and_uv0_intact() {
        let mut geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: CANONICAL_MESH_GEOMETRY_LAYOUT.clone(),
            vertices: vec![0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.25, 0.75],
            subsets: None,
            topology: None,
        });
        let mut bind_pose = capture_mesh_morph_bind_pose(&geometry);
        let morph = MeshMorph {
            targets: vec![MeshMorphTarget {
                position_deltas: vec![5.0, 0.0, 0.0],
                normal_deltas: Some(vec![0.0, 1.0, 0.0]),
                tangent_deltas: Some(vec![0.0, 0.0, 2.0]),
            }],
            weights: vec![1.0],
        };
        blend_mesh_geometry_morph(&mut geometry, &morph, &mut bind_pose);
        let v = &geometry.vertices;
        assert_eq!(v[0], 5.0);
        assert_eq!(v[1], 0.0);
        assert_eq!(v[2], 0.0);
        assert_eq!(v[3], 0.0);
        assert_eq!(v[4], 1.0);
        assert_eq!(v[5], 1.0);
        assert_eq!(v[6], 1.0);
        assert_eq!(v[7], 0.0);
        assert_eq!(v[8], 2.0);
        assert_eq!(v[9], 1.0);
        assert_eq!(v[10], 0.25);
        assert_eq!(v[11], 0.75);
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

mod capture_mesh_morph_bind_pose {
    use super::*;

    #[test]
    fn allocates_blended_scratch_arrays() {
        let geometry = make_simple_geometry();
        let bind_pose = capture_mesh_morph_bind_pose(&geometry);
        assert_eq!(bind_pose.blended_positions.len(), 9);
        assert!(bind_pose.blended_normals.is_some());
    }

    #[test]
    fn captures_normal_and_tangent_xyz_base_attributes_when_the_layout_carries_them() {
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: CANONICAL_MESH_GEOMETRY_LAYOUT.clone(),
            vertices: vec![0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0],
            subsets: None,
            topology: None,
        });
        let bind_pose = capture_mesh_morph_bind_pose(&geometry);
        let normals = bind_pose.normals.as_ref().unwrap();
        assert_eq!(normals[0], 0.0);
        assert_eq!(normals[1], 1.0);
        assert_eq!(normals[2], 0.0);
        let tangents = bind_pose.tangents.as_ref().unwrap();
        assert_eq!(tangents[0], 1.0);
        assert_eq!(tangents[1], 0.0);
        assert_eq!(tangents[2], 0.0);
        assert_eq!(bind_pose.blended_normals.as_ref().unwrap().len(), 3);
        assert_eq!(bind_pose.blended_tangents.as_ref().unwrap().len(), 3);
    }

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
}
