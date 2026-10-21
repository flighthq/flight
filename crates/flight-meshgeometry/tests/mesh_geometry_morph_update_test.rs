use flight_meshgeometry::contract::*;

fn geometry() -> MeshGeometry {
    return create_mesh_geometry(MeshGeometryOptions {
        vertices: vec![0.0; 12].into_boxed_slice(),
        indices: None,
        layout: CANONICAL_MESH_GEOMETRY_LAYOUT.clone(),
        subsets: None,
        topology: None,
    });
}

fn morph(weight: f32) -> MeshMorph {
    return MeshMorph {
        targets: vec![MeshMorphTarget {
            position_deltas: vec![8.0, 0.0, 0.0].into_boxed_slice(),
            normal_deltas: None,
            tangent_deltas: None,
        }],
        weights: vec![weight].into_boxed_slice(),
    };
}

mod update_mesh_geometry_morph {
    use super::*;

    #[test]
    fn retains_the_original_bind_pose_and_only_invalidates_a_changed_weight_vector() {
        let mut target = geometry();
        let mut weights = morph(1.0);
        assert!(get_mesh_geometry_morph_bind_pose(&target).is_none());
        update_mesh_geometry_morph(&mut target, &weights);
        assert_eq!(target.vertices[0], 8.0);
        let retained = get_mesh_geometry_morph_bind_pose(&target).unwrap().clone();
        let first = target.version;
        update_mesh_geometry_morph(&mut target, &weights);
        assert_eq!(target.version, first);
        weights.weights[0] = 0.25;
        update_mesh_geometry_morph(&mut target, &weights);
        assert_ne!(target.version, first);
        assert_eq!(target.vertices[0], 2.0);
        assert!(std::sync::Arc::ptr_eq(
            &retained,
            get_mesh_geometry_morph_bind_pose(&target).unwrap()
        ));
        assert_eq!(retained.read().unwrap().positions[0], 0.0);
        assert_eq!(ensure_mesh_geometry_bounds(&mut target).unwrap().max.x, 2.0);
    }

    #[test]
    fn treats_nan_as_changed_without_comparing_only_the_array_length() {
        let mut target = geometry();
        let weights = morph(f32::NAN);
        update_mesh_geometry_morph(&mut target, &weights);
        let first = target.version;
        update_mesh_geometry_morph(&mut target, &weights);
        assert_ne!(target.version, first);
        assert!(target.vertices[0].is_nan());
    }

    #[test]
    fn detects_weight_count_changes_and_reblends_from_the_rest_pose() {
        let mut target = geometry();
        let mut weights = morph(1.0);
        update_mesh_geometry_morph(&mut target, &weights);
        weights.weights = vec![0.0, 1.0].into_boxed_slice();
        let first = target.version;
        update_mesh_geometry_morph(&mut target, &weights);
        assert_ne!(target.version, first);
        assert_eq!(target.vertices[0], 0.0);
    }
}
