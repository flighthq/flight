use crate::{
    Node3DFields, PartialNode3D, clone_mesh, create_node3d, publish_node3d,
    scene_node::{as_node3d, as_node3d_mut},
};
use flight_entity::Ref;
use flight_materials::Material3D;
use flight_node::contract::set_node_local_matrix4;
use flight_node::{NodeRef, add_node_child, invalidate_node_local_transform};
use std::sync::{Arc, RwLock};

// flight-lint: allow(contract-vocabulary) D16 open Material3D family retains original heterogeneous EntityRefs through native structural dispatch
pub type Scene3DMaterialOverride =
    Arc<dyn Fn(Option<Ref<dyn Material3D>>) -> Option<Ref<dyn Material3D>> + Send + Sync>;
pub fn clone_node3d_subtree(
    source: &NodeRef,
    material_override: Option<Scene3DMaterialOverride>,
) -> NodeRef {
    let (cloned, children) = {
        let guard = source.read().unwrap();
        let source = as_node3d(&*guard).expect("Node3D source");
        let children = source.node_runtime().children.clone().unwrap_or_default();
        let cloned: NodeRef = if let Some(mesh) = source.as_mesh() {
            clone_mesh(mesh)
        } else {
            let f = source.node3d_fields();
            let mut cloned: Node3DFields = create_node3d(
                Some(f.kind.clone()),
                Some(&PartialNode3D {
                    alpha: Some(f.alpha),
                    enabled: Some(f.enabled),
                    name: f.name.clone(),
                    visible: Some(f.visible),
                }),
            );
            cloned.position = flight_geometry::clone_vector3(&f.position);
            cloned.rotation = flight_geometry::clone_quaternion(&f.rotation);
            cloned.scale = flight_geometry::clone_vector3(&f.scale);
            let runtime = &f.node3d_runtime().transform3d;
            let cloned: NodeRef = publish_node3d(cloned);
            invalidate_node_local_transform(&cloned);
            if runtime.local_matrix4_detached {
                if let Some(m) = &runtime.local_matrix4 {
                    set_node_local_matrix4(&cloned, m);
                }
            }
            cloned
        };
        (cloned, children)
    };
    if let Some(material_override) = &material_override {
        let materials = {
            let guard = cloned.read().unwrap();
            as_node3d(&*guard)
                .and_then(|n| n.as_mesh())
                .map(|m| m.materials.read().unwrap().clone())
        };
        if let Some(materials) = materials {
            let materials = materials
                .into_iter()
                .map(|m| material_override(m))
                .collect();
            as_node3d_mut(&mut *cloned.write().unwrap())
                .unwrap()
                .as_mesh_mut()
                .unwrap()
                .materials = Arc::new(RwLock::new(materials));
        }
    }
    for child in children {
        add_node_child(
            &cloned,
            &clone_node3d_subtree(&child, material_override.clone()),
        );
    }
    return cloned;
}
