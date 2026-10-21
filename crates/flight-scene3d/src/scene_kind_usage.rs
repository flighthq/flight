use flight_entity::{EntityRuntimeSlot, Kind, allocate_entity};

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use flight_entity::{get_entity_uid, set_entity_uid};

    #[test]
    fn scene3dkindusage_new_and_initialize_match_free_functions_and_preserve_runtime() {
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
        method.initialize();
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

impl Scene3DKindUsage {
    pub fn new() -> Self {
        return create_scene3d_kind_usage();
    }

    pub fn initialize(&mut self) {
        initialize_scene3d_kind_usage(self);
    }
}

flight_entity::impl_entity!(Scene3DKindUsage);
