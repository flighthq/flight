use flight_scene3d::Node3DRef;

use crate::RigidBody3D;

pub fn sync_physics_3d_body_to_node_3d(body: &RigidBody3D, node: &Node3DRef) {
    let mut node = node.write().unwrap();
    let fields = node.node3d_fields_mut();
    fields.position.x = body.x;
    fields.position.y = body.y;
    fields.position.z = body.z;
    fields.rotation.x = body.orientation_x;
    fields.rotation.y = body.orientation_y;
    fields.rotation.z = body.orientation_z;
    fields.rotation.w = body.orientation_w;
    node.node_runtime_mut().local_transform_id =
        node.node_runtime().local_transform_id.wrapping_add(1);
}
