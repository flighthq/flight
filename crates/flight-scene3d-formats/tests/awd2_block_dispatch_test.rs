use super::awd2_test_helper::{empty_document, handler};
use flight_entity::{allocate_entity, get_entity_uid, has_entity_runtime};
use flight_scene3d_formats::contract::*;
use std::sync::{Arc, RwLock};

mod create_awd2_parse_state {
    use super::*;

    #[test]
    fn initializes_all_final_typed_maps_and_unset_slots_while_retaining_the_original_objects() {
        let document = empty_document();
        let source = Arc::new(RwLock::new(vec![0; 8].into_boxed_slice()));
        let diagnostics = Arc::new(RwLock::new(Vec::new()));
        let mut state = create_awd2_parse_state();
        assert!(state.diagnostics.is_none());
        assert!(state.source.read().unwrap().is_empty());
        assert!(Arc::ptr_eq(&state.source, &state.view));
        state.document = document.clone();
        state.source = source.clone();
        state.view = source.clone();
        state.diagnostics = Some(diagnostics.clone());
        assert!(Arc::ptr_eq(&state.document, &document));
        assert!(Arc::ptr_eq(&state.source, &source));
        assert!(Arc::ptr_eq(&state.view, &source));
        assert!(Arc::ptr_eq(
            state.diagnostics.as_ref().unwrap(),
            &diagnostics
        ));
        assert!(state.cameras.is_empty());
        assert!(state.containers.is_empty());
        assert!(state.geometries.is_empty());
        assert!(state.light_pickers.is_empty());
        assert!(state.lights.is_empty());
        assert!(state.materials.read().unwrap().is_empty());
        assert!(state.mesh_instances.is_empty());
        assert!(state.node_index_for_block.is_empty());
        assert!(state.skeleton_animations.is_empty());
        assert!(state.skeleton_joint_node_indices.is_empty());
        assert!(state.skeleton_poses.is_empty());
        assert!(state.skeletons.is_empty());
        assert!(state.textures.read().unwrap().is_empty());
        assert!(state.resolve_material.is_none());
        assert!(state.skin_index.is_none());
        assert!(!has_entity_runtime(&state));
    }
}

mod expand_awd2_block_dispatch {
    use super::*;

    #[test]
    fn expands_the_actual_full_preset_with_no_duplicate_claims_and_preserves_every_handler() {
        let mut claimed = AWD2_ALL_BLOCK_HANDLERS
            .iter()
            .flat_map(|handler| handler.read().unwrap().block_types.clone())
            .collect::<Vec<_>>();
        let count = claimed.len();
        claimed.sort();
        claimed.dedup();
        assert_eq!(claimed.len(), count);
        let mut dispatch = Vec::new();
        expand_awd2_block_dispatch(&mut dispatch, &AWD2_ALL_BLOCK_HANDLERS);
        assert_eq!(dispatch.len(), count);
        for handler in AWD2_ALL_BLOCK_HANDLERS.iter() {
            for block_type in &handler.read().unwrap().block_types {
                assert!(Arc::ptr_eq(
                    &dispatch
                        .iter()
                        .find(|entry| entry.block_type == *block_type)
                        .unwrap()
                        .handler,
                    handler
                ));
            }
        }
    }

    #[test]
    fn retains_original_handlers_and_replaces_contested_keys_at_their_original_map_position() {
        let stock = handler(vec![1, 2]);
        let camera = handler(vec![3]);
        let custom = handler(vec![2, 4]);
        let dispatch = {
            let mut output = Vec::new();
            expand_awd2_block_dispatch(
                &mut output,
                &[stock.clone(), camera.clone(), custom.clone()],
            );
            output
        };
        assert_eq!(
            dispatch
                .iter()
                .map(|entry| entry.block_type)
                .collect::<Vec<_>>(),
            [1, 2, 3, 4]
        );
        assert!(Arc::ptr_eq(&dispatch[0].handler, &stock));
        assert!(Arc::ptr_eq(&dispatch[1].handler, &custom));
        assert!(Arc::ptr_eq(&dispatch[2].handler, &camera));
        assert!(Arc::ptr_eq(&dispatch[3].handler, &custom));
        let reverse = {
            let mut output = Vec::new();
            expand_awd2_block_dispatch(&mut output, &[custom, stock.clone()]);
            output
        };
        assert!(Arc::ptr_eq(&reverse[0].handler, &stock));
        assert!(!dispatch.iter().any(|entry| entry.block_type == 99));
        assert!(
            {
                let mut output = Vec::new();
                expand_awd2_block_dispatch(&mut output, &[]);
                output
            }
            .is_empty()
        );
    }
    #[test]
    fn removes_old_claims_preserves_original_handles_and_reuses_the_dispatch_buffer() {
        let original = handler(vec![1]);
        let mut out = Vec::with_capacity(16);
        let pointer = out.as_ptr();
        let capacity = out.capacity();
        expand_awd2_block_dispatch(&mut out, &[original.clone()]);
        assert_eq!(out.len(), 1);
        assert!(Arc::ptr_eq(&out[0].handler, &original));
        expand_awd2_block_dispatch(&mut out, &[handler(vec![42])]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].block_type, 42);
        assert!(!Arc::ptr_eq(&out[0].handler, &original));
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
        expand_awd2_block_dispatch(&mut out, &[]);
        assert!(out.is_empty());
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
    }
}

mod initialize_awd2_parse_state {
    use super::*;

    #[test]
    fn rebuilds_maps_and_resets_build_slots_while_preserving_existing_entity_runtime_and_new_object_identity()
     {
        let mut state: Awd2ParseState = allocate_entity();
        let uid = get_entity_uid(&mut state);
        state.skin_index = Some(7);
        state.skeleton_joint_node_indices = vec![8];
        state.resolve_material = Some(Arc::new(|_| 7));
        state
            .node_index_for_block
            .push(Awd2NodeIndexEntry { key: 1, value: 2 });
        let previous_materials = state.materials.clone();
        let previous_textures = state.textures.clone();
        let document = empty_document();
        let source = Arc::new(RwLock::new(vec![4; 8].into_boxed_slice()));
        let view = Arc::new(RwLock::new(vec![5; 8].into_boxed_slice()));
        state.diagnostics = Some(Arc::new(RwLock::new(Vec::new())));
        initialize_awd2_parse_state(&mut state);
        assert!(state.source.read().unwrap().is_empty());
        assert!(Arc::ptr_eq(&state.source, &state.view));
        assert!(state.document.read().unwrap().nodes.is_empty());
        state.document = document.clone();
        state.source = source.clone();
        state.view = view.clone();
        assert_eq!(get_entity_uid(&mut state), uid);
        assert!(state.skin_index.is_none());
        assert!(state.skeleton_joint_node_indices.is_empty());
        assert!(state.node_index_for_block.is_empty());
        assert!(state.resolve_material.is_none());
        assert!(Arc::ptr_eq(&state.document, &document));
        assert!(Arc::ptr_eq(&state.source, &source));
        assert!(Arc::ptr_eq(&state.view, &view));
        assert!(state.diagnostics.is_none());
        assert!(!Arc::ptr_eq(&state.materials, &previous_materials));
        assert!(!Arc::ptr_eq(&state.textures, &previous_textures));
    }
}
