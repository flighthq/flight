use crate::{scene_node::as_node3d, update_mesh_morph};
use flight_node::NodeRef;

pub fn prepare_scene3d_morph(scene: &NodeRef) {
    let children = {
        let n = scene.read().unwrap();
        if !n.node_fields().enabled {
            return;
        }
        if let Some(m) = as_node3d(&*n).and_then(|n| n.as_mesh()) {
            update_mesh_morph(m);
        }
        n.node_runtime().children.clone().unwrap_or_default()
    };
    for child in children {
        prepare_scene3d_morph(&child);
    }
}
