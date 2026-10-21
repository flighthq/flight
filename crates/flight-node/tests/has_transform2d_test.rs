use flight_node::contract::*;

mod init_transform2d_runtime_trait {
    use super::*;

    #[test]
    fn initializes_default_values() {
        let mut runtime = HasTransform2DRuntime {
            local_matrix: Some(flight_geometry::create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0)),
            rotation_angle: 45.0,
            rotation_cosine: 0.0,
            rotation_sine: 1.0,
            world_matrix: Some(flight_geometry::create_matrix(1.0, 0.0, 0.0, 1.0, 0.0, 0.0)),
        };
        init_transform2d_runtime_trait(&mut runtime, None);
        assert_eq!(runtime.local_matrix, None);
        assert_eq!(runtime.rotation_angle, 0.0);
        assert_eq!(runtime.rotation_cosine, 1.0);
        assert_eq!(runtime.rotation_sine, 0.0);
        assert_eq!(runtime.world_matrix, None);
    }
}

mod init_transform2d_trait {
    use super::*;

    #[test]
    fn initializes_default_values() {
        let mut node = HasTransform2D {
            pivot_x: 4.0,
            pivot_y: 8.0,
            rotation: 45.0,
            scale_x: 2.0,
            scale_y: 3.0,
            skew_x: 15.0,
            skew_y: 30.0,
            x: 100.0,
            y: 200.0,
        };
        init_transform2d_trait(&mut node, None);
        assert_eq!(node.pivot_x, 0.0);
        assert_eq!(node.pivot_y, 0.0);
        assert_eq!(node.rotation, 0.0);
        assert_eq!(node.scale_x, 1.0);
        assert_eq!(node.scale_y, 1.0);
        assert_eq!(node.skew_x, 0.0);
        assert_eq!(node.skew_y, 0.0);
        assert_eq!(node.x, 0.0);
        assert_eq!(node.y, 0.0);
    }

    #[test]
    fn allows_predefined_values() {
        let options = HasTransform2DOptions {
            pivot_x: Some(4.0),
            pivot_y: Some(8.0),
            rotation: Some(45.0),
            scale_x: Some(2.0),
            scale_y: Some(3.0),
            skew_x: Some(15.0),
            skew_y: Some(30.0),
            x: Some(100.0),
            y: Some(200.0),
        };
        let mut node = HasTransform2D {
            pivot_x: 0.0,
            pivot_y: 0.0,
            rotation: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            skew_x: 0.0,
            skew_y: 0.0,
            x: 0.0,
            y: 0.0,
        };
        init_transform2d_trait(&mut node, Some(&options));
        assert_eq!(node.pivot_x, 4.0);
        assert_eq!(node.pivot_y, 8.0);
        assert_eq!(node.rotation, 45.0);
        assert_eq!(node.scale_x, 2.0);
        assert_eq!(node.scale_y, 3.0);
        assert_eq!(node.skew_x, 15.0);
        assert_eq!(node.skew_y, 30.0);
        assert_eq!(node.x, 100.0);
        assert_eq!(node.y, 200.0);
    }
}
