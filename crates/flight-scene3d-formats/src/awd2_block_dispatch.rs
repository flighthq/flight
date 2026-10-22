use crate::awd2_types::{
    Awd2BlockDispatch, Awd2BlockDispatchEntry, Awd2BlockHandler, Awd2ParseState,
};
use flight_entity::{Ref, allocate_entity};
use std::sync::{Arc, RwLock};

#[cfg(test)]
mod sugar_tests {
    use super::*;
    use flight_entity::get_entity_uid;

    #[test]
    fn constructor_and_initializer_receivers_match_free_functions_and_preserve_original_handles_and_runtime()
     {
        let document = Arc::new(RwLock::new(crate::awd2_parse::empty_awd_document()));
        let bytes = Arc::new(RwLock::new(vec![0; 8].into_boxed_slice()));
        let mut receiver = Awd2ParseState::new();
        let mut free = create_awd2_parse_state();
        receiver.document = document.clone();
        free.document = document;
        receiver.source = bytes.clone();
        free.source = bytes.clone();
        receiver.view = bytes.clone();
        free.view = bytes;
        assert!(Arc::ptr_eq(&receiver.document, &free.document));
        assert!(Arc::ptr_eq(&receiver.source, &free.source));
        receiver.skin_index = Some(3);
        free.skin_index = Some(3);
        let receiver_uid = get_entity_uid(&mut receiver);
        let free_uid = get_entity_uid(&mut free);
        receiver.initialize();
        initialize_awd2_parse_state(&mut free);
        assert_eq!(receiver.skin_index, free.skin_index);
        assert!(receiver.skin_index.is_none());
        assert!(receiver.geometries.is_empty());
        assert!(free.geometries.is_empty());
        assert!(receiver.source.read().unwrap().is_empty());
        assert!(free.source.read().unwrap().is_empty());
        assert!(Arc::ptr_eq(&receiver.source, &receiver.view));
        assert!(Arc::ptr_eq(&free.source, &free.view));
        assert!(!Arc::ptr_eq(&receiver.source, &free.source));
        assert_eq!(get_entity_uid(&mut receiver), receiver_uid);
        assert_eq!(get_entity_uid(&mut free), free_uid);
    }
}

// flight-lint: allow(conform-params) Principal21f7557f approved D23 B construction: create without field arguments, then assign
pub fn create_awd2_parse_state() -> Awd2ParseState {
    let mut out: Awd2ParseState = allocate_entity();
    initialize_awd2_parse_state(&mut out);
    return out;
}

// flight-lint: allow(conform-params) Principal21f7557f approved D23 B initialize mirrors zero-argument create and preserves private runtime
pub fn initialize_awd2_parse_state(out: &mut Awd2ParseState) {
    let bytes = Arc::new(RwLock::new(Vec::new().into_boxed_slice()));
    out.cameras = Vec::new();
    out.containers = Vec::new();
    out.diagnostics = None;
    out.document = Arc::new(RwLock::new(crate::awd2_parse::empty_awd_document()));
    out.geometries = Vec::new();
    out.light_pickers = Vec::new();
    out.lights = Vec::new();
    out.materials = Arc::new(RwLock::new(Vec::new()));
    out.mesh_instances = Vec::new();
    out.node_index_for_block = Vec::new();
    out.resolve_material = None;
    out.skeleton_animations = Vec::new();
    out.skeleton_joint_node_indices = Vec::new();
    out.skeleton_poses = Vec::new();
    out.skeletons = Vec::new();
    out.skin_index = None;
    out.source = bytes.clone();
    out.textures = Arc::new(RwLock::new(Vec::new()));
    out.view = bytes;
}

// flight-lint: allow(conform-params) Principal21f7557f approved D24: required first caller-owned collection out, cleared then filled
pub fn expand_awd2_block_dispatch(out: &mut Awd2BlockDispatch, blocks: &[Ref<Awd2BlockHandler>]) {
    out.clear();
    for handler in blocks {
        let types = handler.read().unwrap().block_types.clone();
        for block_type in types {
            if let Some(entry) = out.iter_mut().find(|entry| entry.block_type == block_type) {
                entry.handler = handler.clone();
            } else {
                out.push(Awd2BlockDispatchEntry {
                    block_type,
                    handler: handler.clone(),
                });
            }
        }
    }
    return;
}

impl Awd2ParseState {
    pub fn new() -> Self {
        return create_awd2_parse_state();
    }

    pub fn initialize(&mut self) {
        initialize_awd2_parse_state(self);
    }
}
