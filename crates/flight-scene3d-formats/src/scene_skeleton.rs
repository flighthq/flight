use flight_entity::Ref;
use flight_node::{NodeRef, get_node_children};
use flight_scene3d::{Node3DRef, as_node3d_ref};

pub fn find_scene3d_skeleton_joints(root: &Node3DRef) -> Option<Ref<Vec<Node3DRef>>> {
    let root: NodeRef = root.clone();
    let mut stack = Vec::new();
    let mut children = Vec::new();
    get_node_children(&mut stack, &root);
    while let Some(node) = stack.pop() {
        if let Some(node3d) = as_node3d_ref(&node) {
            let skin = node3d
                .read()
                .unwrap()
                .as_mesh()
                .and_then(|mesh| mesh.skin.clone());
            if let Some(skin) = skin {
                let skeleton = skin.read().unwrap().skeleton.clone();
                return Some(skeleton.read().unwrap().joints.clone());
            }
        }
        get_node_children(&mut children, &node);
        stack.extend(children.iter().cloned());
    }
    return None;
}
