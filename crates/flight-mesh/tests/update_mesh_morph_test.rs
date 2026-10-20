use flight_mesh::*;

fn make_morphed_mesh() -> Mesh {
    let mut vertices = vec![0.0f32; 3 * 12];
    vertices[0] = 0.0; vertices[1] = 0.0; vertices[2] = 0.0;
    vertices[12] = 1.0; vertices[13] = 0.0; vertices[14] = 0.0;
    vertices[24] = 0.0; vertices[25] = 1.0; vertices[26] = 0.0;
    // normals
    vertices[3] = 0.0; vertices[4] = 0.0; vertices[5] = 1.0;
    vertices[15] = 0.0; vertices[16] = 0.0; vertices[17] = 1.0;
    vertices[27] = 0.0; vertices[28] = 0.0; vertices[29] = 1.0;
    let geometry = create_mesh_geometry(MeshGeometryOptions {
        indices: Some(IndexBuffer::U16(vec![0, 1, 2])),
        layout: canonical_mesh_geometry_layout(),
        vertices,
        subsets: None,
        topology: None,
    });
    let morph = MeshMorph {
        targets: vec![MeshMorphTarget {
            position_deltas: vec![10.0, 0.0, 0.0, 10.0, 0.0, 0.0, 10.0, 0.0, 0.0],
            normal_deltas: None,
            tangent_deltas: None,
        }],
        weights: vec![1.0],
    };
    return Mesh {
        geometry,
        morph: Some(morph),
    };
}

mod update_mesh_morph {
    use super::*;

    #[test]
    fn lazy_captures_bind_pose_on_first_call() {
        let mut mesh = make_morphed_mesh();
        assert!(get_mesh_geometry_morph_bind_pose(&mesh.geometry).is_none());
        update_mesh_morph(&mut mesh);
        assert!(get_mesh_geometry_morph_bind_pose(&mesh.geometry).is_some());
    }

    #[test]
    fn applies_morph_weights() {
        let mut mesh = make_morphed_mesh();
        update_mesh_morph(&mut mesh);
        // position[0].x = 0 + 1.0 * 10 = 10.0
        assert!((mesh.geometry.vertices[0] - 10.0).abs() < 1e-3);
    }

    #[test]
    fn skips_blend_when_weights_are_unchanged() {
        let mut mesh = make_morphed_mesh();
        update_mesh_morph(&mut mesh);
        let version_after_first = mesh.geometry.version;
        // second call with same weights
        update_mesh_morph(&mut mesh);
        assert_eq!(mesh.geometry.version, version_after_first);
    }

    #[test]
    fn reblends_when_weights_change() {
        let mut mesh = make_morphed_mesh();
        update_mesh_morph(&mut mesh);
        let version_after_first = mesh.geometry.version;
        // Change the weight
        if let Some(ref mut morph) = mesh.morph {
            morph.weights[0] = 0.5;
        }
        update_mesh_morph(&mut mesh);
        assert!(mesh.geometry.version > version_after_first);
        // position[0].x = 0 + 0.5 * 10 = 5.0
        assert!((mesh.geometry.vertices[0] - 5.0).abs() < 1e-3);
    }

    #[test]
    fn no_morph_is_a_noop() {
        let geometry = create_mesh_geometry(MeshGeometryOptions {
            indices: None,
            layout: canonical_mesh_geometry_layout(),
            vertices: vec![0.0f32; 12],
            subsets: None,
            topology: None,
        });
        let mut mesh = Mesh { geometry, morph: None };
        let v0 = mesh.geometry.version;
        update_mesh_morph(&mut mesh);
        assert_eq!(mesh.geometry.version, v0);
    }
}
