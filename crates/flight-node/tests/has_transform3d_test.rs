use flight_node::contract::*;

mod init_transform3d_runtime_trait {
    use super::*;

    #[test]
    fn nulls_the_matrix_caches_and_clears_the_detached_flag() {
        let mut runtime = HasTransform3DRuntime {
            local_matrix4: Some(flight_geometry::create_matrix4()),
            local_matrix4_detached: true,
            world_matrix4: Some(flight_geometry::create_matrix4()),
        };
        init_transform3d_runtime_trait(&mut runtime);
        assert_eq!(runtime.local_matrix4, None);
        assert_eq!(runtime.world_matrix4, None);
        assert!(!runtime.local_matrix4_detached);
    }
}

mod init_transform3d_trait {
    use super::*;

    fn empty_transform() -> HasTransform3D {
        return HasTransform3D {
            position: flight_geometry::create_vector3(9.0, 9.0, 9.0),
            rotation: flight_geometry::create_quaternion(0.0, 0.0, 0.0, 1.0),
            scale: flight_geometry::create_vector3(9.0, 9.0, 9.0),
        };
    }

    #[test]
    fn defaults_to_identity_position_rotation_scale() {
        let mut node = empty_transform();
        init_transform3d_trait(&mut node, None);
        assert_eq!(
            (node.position.x, node.position.y, node.position.z),
            (0.0, 0.0, 0.0)
        );
        assert_eq!(
            (
                node.rotation.x,
                node.rotation.y,
                node.rotation.z,
                node.rotation.w
            ),
            (0.0, 0.0, 0.0, 1.0)
        );
        assert_eq!((node.scale.x, node.scale.y, node.scale.z), (1.0, 1.0, 1.0));
    }

    #[test]
    fn copies_out_of_the_options_so_two_nodes_never_share_storage() {
        let options = HasTransform3DOptions {
            position: Some(flight_geometry::create_vector3(1.0, 2.0, 3.0)),
            rotation: Some(flight_geometry::create_quaternion(0.0, 0.0, 0.0, 1.0)),
            scale: Some(flight_geometry::create_vector3(2.0, 2.0, 2.0)),
        };
        let mut first = empty_transform();
        let mut second = empty_transform();
        init_transform3d_trait(&mut first, Some(&options));
        init_transform3d_trait(&mut second, Some(&options));
        first.position.x = 999.0;
        first.scale.y = 999.0;
        first.rotation.w = 0.0;
        assert_eq!(second.position.x, 1.0);
        assert_eq!(second.scale.y, 2.0);
        assert_eq!(second.rotation.w, 1.0);
        assert_eq!(options.position.as_ref().unwrap().x, 1.0);
        assert_eq!(options.scale.as_ref().unwrap().y, 2.0);
        assert_eq!(options.rotation.as_ref().unwrap().w, 1.0);
    }
}
