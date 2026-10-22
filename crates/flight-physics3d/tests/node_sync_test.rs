use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_node::contract::{NodeRef, get_node_local_matrix4};
use flight_scene3d::{Node3DFields, Node3DRef, create_node3d};

use super::*;

mod sync_physics_3d_body_to_node_3d {
    use super::*;

    #[test]
    fn copies_orientation_quaternion_from_body_to_node() {
        let body = create_rigid_body_3d();
        {
            let mut body = body.write().unwrap();
            body.orientation_x = 0.5;
            body.orientation_y = 0.5;
            body.orientation_z = 0.5;
            body.orientation_w = 0.5;
        }
        let node: Node3DFields = create_node3d(None);
        let node: Node3DRef = Arc::new(RwLock::new(node));

        sync_physics_3d_body_to_node_3d(&body.read().unwrap(), &node);

        let node = node.read().unwrap();
        assert_eq!(node.node3d_fields().rotation.x, 0.5);
        assert_eq!(node.node3d_fields().rotation.y, 0.5);
        assert_eq!(node.node3d_fields().rotation.z, 0.5);
        assert_eq!(node.node3d_fields().rotation.w, 0.5);
    }

    #[test]
    fn copies_position_from_body_to_node() {
        let body = create_rigid_body_3d();
        {
            let mut body = body.write().unwrap();
            body.x = 3.0;
            body.y = 7.0;
            body.z = -2.0;
        }
        let node: Node3DFields = create_node3d(None);
        let node: Node3DRef = Arc::new(RwLock::new(node));

        sync_physics_3d_body_to_node_3d(&body.read().unwrap(), &node);

        let node = node.read().unwrap();
        assert_eq!(node.node3d_fields().position.x, 3.0);
        assert_eq!(node.node3d_fields().position.y, 7.0);
        assert_eq!(node.node3d_fields().position.z, -2.0);
    }

    #[test]
    fn invalidates_the_local_matrix_for_the_next_transform_read() {
        let body = create_rigid_body_3d();
        body.write().unwrap().x = 10.0;
        let fields: Node3DFields = create_node3d(None);
        let concrete: Ref<Node3DFields> = Arc::new(RwLock::new(fields));
        let node: Node3DRef = concrete.clone();
        let erased: NodeRef = concrete;
        let before = get_node_local_matrix4(&erased).m[12];

        sync_physics_3d_body_to_node_3d(&body.read().unwrap(), &node);

        let after = get_node_local_matrix4(&erased).m[12];
        assert_eq!(after, 10.0);
        assert_ne!(after, before);
    }
}
