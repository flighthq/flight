use crate::{Scene3D, scene_node::as_node3d};
use flight_entity::{EntityRuntimeSlot, Kind, allocate_entity};
use flight_node::NodeRef;

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use flight_entity::{get_entity_uid, set_entity_uid};

    #[test]
    fn scene3dkindusage_new_matches_all_free_collections_and_reset_preserves_runtime() {
        let mut free = create_scene3d_kind_usage();
        let mut method = Scene3DKindUsage::new();
        free.material_kinds.push("old".to_string());
        method.material_kinds.push("old".to_string());
        free.modifier_kinds.push("modifier".to_string());
        method.modifier_kinds.push("modifier".to_string());
        free.node_kinds.push("Mesh".to_string());
        method.node_kinds.push("Mesh".to_string());
        free.resource_mime_types.push("image/png".to_string());
        method.resource_mime_types.push("image/png".to_string());
        free.texture_source_kinds.push("image".to_string());
        method.texture_source_kinds.push("image".to_string());
        set_entity_uid(&mut free, "kept".to_string());
        set_entity_uid(&mut method, "kept".to_string());
        initialize_scene3d_kind_usage(&mut free);
        initialize_scene3d_kind_usage(&mut method);
        assert_eq!(method.material_kinds, free.material_kinds);
        assert_eq!(method.modifier_kinds, free.modifier_kinds);
        assert_eq!(method.node_kinds, free.node_kinds);
        assert_eq!(method.resource_mime_types, free.resource_mime_types);
        assert_eq!(method.texture_source_kinds, free.texture_source_kinds);
        assert_eq!(get_entity_uid(&mut method), "kept");
        assert_eq!(get_entity_uid(&mut free), "kept");
    }
}

#[derive(Default)]
pub struct Scene3DKindUsage {
    runtime: EntityRuntimeSlot,
    pub material_kinds: Vec<Kind>,
    pub modifier_kinds: Vec<Kind>,
    pub node_kinds: Vec<Kind>,
    pub resource_mime_types: Vec<String>,
    pub texture_source_kinds: Vec<String>,
}

pub fn create_scene3d_kind_usage() -> Scene3DKindUsage {
    let mut out: Scene3DKindUsage = allocate_entity();
    initialize_scene3d_kind_usage(&mut out);
    return out;
}

pub fn initialize_scene3d_kind_usage(out: &mut Scene3DKindUsage) {
    out.material_kinds = Vec::new();
    out.modifier_kinds = Vec::new();
    out.node_kinds = Vec::new();
    out.resource_mime_types = Vec::new();
    out.texture_source_kinds = Vec::new();
}

fn add_used_kind(kinds: &mut Vec<String>, kind: String) {
    if !kinds.iter().any(|k| k == &kind) {
        kinds.push(kind);
    }
}
pub fn get_scene3d_kind_usage(out: &mut Scene3DKindUsage, scene: &Scene3D) {
    out.material_kinds.clear();
    out.modifier_kinds.clear();
    out.node_kinds.clear();
    out.resource_mime_types.clear();
    out.texture_source_kinds.clear();
    let root: NodeRef = scene.root.clone();
    visit_kinds(out, &root);
    for resource in &scene.resources {
        let (used, mime) = match resource {
            flight_image::ImageResourceReference::Embedded(r) => {
                let r = r.reference.read().unwrap();
                (!r.textures.is_empty(), r.mime_type.clone())
            }
            flight_image::ImageResourceReference::External(r) => {
                let r = r.reference.read().unwrap();
                (!r.textures.is_empty(), r.mime_type.clone())
            }
        };
        if !used {
            continue;
        }
        add_used_kind(&mut out.texture_source_kinds, "image".to_string());
        if let Some(mime) = mime {
            add_used_kind(&mut out.resource_mime_types, mime);
        }
    }
    for list in [
        &mut out.material_kinds,
        &mut out.modifier_kinds,
        &mut out.node_kinds,
        &mut out.resource_mime_types,
        &mut out.texture_source_kinds,
    ] {
        list.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
    }
}
fn visit_kinds(out: &mut Scene3DKindUsage, node: &NodeRef) {
    let (materials, children) = {
        let node = node.read().unwrap();
        add_used_kind(&mut out.node_kinds, node.node_fields().kind.clone());
        (
            as_node3d(&*node)
                .and_then(|n| n.as_mesh())
                .map(|m| m.materials.read().unwrap().clone())
                .unwrap_or_default(),
            node.node_runtime().children.clone().unwrap_or_default(),
        )
    };
    for material in materials.into_iter().flatten() {
        let m = material.read().unwrap();
        add_used_kind(&mut out.material_kinds, m.material3d_fields().kind.clone());
        if let Some(stream) = m.modifier_stream() {
            for i in 0..stream.len() {
                if let Some(kind) = stream.kind_at(i) {
                    add_used_kind(&mut out.modifier_kinds, kind);
                }
            }
        }
    }
    for child in children {
        visit_kinds(out, &child);
    }
}

impl Scene3DKindUsage {
    pub fn new() -> Self {
        return create_scene3d_kind_usage();
    }
}

flight_entity::impl_entity!(Scene3DKindUsage);
