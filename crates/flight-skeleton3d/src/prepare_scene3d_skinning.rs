use crate::update_mesh_skin::{cached_bind_pose, mesh_inputs, mesh_mut};
use crate::{compute_skeleton3d_joint_matrices, get_mesh_skin_conservative_bounds};
use flight_geometry::create_aabb;
use flight_node::NodeRef;
// flight-lint: allow(conform-params) D16 preserve original Mesh NodeRef without holding a node lock across hierarchy resolution
pub fn prepare_mesh_skinning(mesh: &NodeRef) {
    let Some(input) = mesh_inputs(mesh) else {
        return;
    };
    let Some(skin) = input.skin else {
        return;
    };
    let skeleton = skin.read().unwrap().skeleton.clone();
    compute_skeleton3d_joint_matrices(&mut skeleton.write().unwrap());
    let pose = cached_bind_pose(&mut input.geometry.write().unwrap());
    if let Some(mesh) = mesh_mut(&mut *mesh.write().unwrap()) {
        let cached = mesh
            .mesh_runtime_mut()
            .deformed_local_bounds
            .get_or_insert_with(|| create_aabb(0.0, 0.0, 0.0, 0.0, 0.0, 0.0));
        get_mesh_skin_conservative_bounds(cached, &pose.read().unwrap(), &skeleton.read().unwrap());
    }
}
pub fn prepare_scene3d_skinning(scene: &NodeRef) {
    let children = {
        let node = scene.read().unwrap();
        if !node.node_fields().enabled {
            return;
        }
        node.node_runtime().children.clone().unwrap_or_default()
    };
    prepare_mesh_skinning(scene);
    for child in children {
        prepare_scene3d_skinning(&child);
    }
}
