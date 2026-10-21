use crate::scene_node::as_node3d;
use flight_entity::Ref;
use flight_materials::Material3D;
use flight_node::NodeRef;
use std::sync::Arc;

// flight-lint: allow(contract-vocabulary) D16 returns the original open Material3D EntityRef, preserving kind-specific fields
pub fn find_scene3d_material_by_name(root: &NodeRef, name: &str) -> Option<Ref<dyn Material3D>> {
    let (materials, children) = {
        let n = root.read().unwrap();
        (
            as_node3d(&*n)
                .and_then(|n| n.as_mesh())
                .map(|m| m.materials.read().unwrap().clone())
                .unwrap_or_default(),
            n.node_runtime().children.clone().unwrap_or_default(),
        )
    };
    for material in materials.into_iter().flatten() {
        if material.read().unwrap().material3d_fields().name.as_deref() == Some(name) {
            return Some(material);
        }
    }
    for child in children {
        if let Some(material) = find_scene3d_material_by_name(&child, name) {
            return Some(material);
        }
    }
    return None;
}
// flight-lint: allow(conform-params) D9 mutating outputs are out-first; preserves each original open Material3D EntityRef
// flight-lint: allow(contract-vocabulary) D16 retains original heterogeneous Material3D EntityRefs in source visitation order
pub fn get_scene3d_materials(out: &mut Vec<Ref<dyn Material3D>>, root: &NodeRef) {
    let (materials, children) = {
        let n = root.read().unwrap();
        (
            as_node3d(&*n)
                .and_then(|n| n.as_mesh())
                .map(|m| m.materials.read().unwrap().clone())
                .unwrap_or_default(),
            n.node_runtime().children.clone().unwrap_or_default(),
        )
    };
    for material in materials.into_iter().flatten() {
        if !out.iter().any(|m| Arc::ptr_eq(m, &material)) {
            out.push(material);
        }
    }
    for child in children {
        get_scene3d_materials(out, &child);
    }
}
