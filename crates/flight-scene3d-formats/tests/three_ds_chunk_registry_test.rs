use flight_scene3d_formats::*;
use std::sync::Arc;

mod three_ds_all_chunk_handlers {
    use super::*;
    #[test]
    fn contains_every_original_family_once_in_camera_keyframe_light_material_mesh_order() {
        assert_eq!(THREE_DS_ALL_CHUNK_HANDLERS.len(), 5);
        let expected = [
            THREE_DS_CAMERA_HANDLER.clone(),
            THREE_DS_KEYFRAME_HANDLER.clone(),
            THREE_DS_LIGHT_HANDLER.clone(),
            THREE_DS_MATERIAL_HANDLER.clone(),
            THREE_DS_MESH_HANDLER.clone(),
        ];
        let mut ids = Vec::new();
        for (handler, original) in THREE_DS_ALL_CHUNK_HANDLERS.iter().zip(expected) {
            assert!(Arc::ptr_eq(handler, &original));
            for id in &handler.read().unwrap().chunk_ids {
                assert!(!ids.contains(id));
                ids.push(*id);
            }
        }
        let dispatch = {
            let mut output = Vec::new();
            build_three_ds_chunk_dispatch(&mut output, &THREE_DS_ALL_CHUNK_HANDLERS);
            output
        };
        for handler in THREE_DS_ALL_CHUNK_HANDLERS.iter() {
            for id in &handler.read().unwrap().chunk_ids {
                assert!(Arc::ptr_eq(
                    &dispatch
                        .iter()
                        .find(|entry| entry.chunk_id == *id)
                        .unwrap()
                        .handler,
                    handler
                ));
            }
        }
    }
}
