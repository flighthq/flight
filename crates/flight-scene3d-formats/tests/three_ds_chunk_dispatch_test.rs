use flight_scene3d_formats::*;
use std::sync::{Arc, RwLock};

mod build_three_ds_chunk_dispatch {
    use super::*;

    #[test]
    fn preserves_claim_order_original_identity_and_last_replacement_without_fallbacks() {
        let first = Arc::new(RwLock::new(ThreeDsChunkHandler {
            chunk_ids: vec![THREE_DS_TRIMESH, THREE_DS_CAMERA],
            build: None,
            collect: Arc::new(|_, _, _, _, _| {}),
        }));
        let last = Arc::new(RwLock::new(ThreeDsChunkHandler {
            chunk_ids: vec![THREE_DS_TRIMESH, THREE_DS_LIGHT],
            build: None,
            collect: Arc::new(|_, _, _, _, _| {}),
        }));
        let dispatch = {
            let mut output = Vec::new();
            build_three_ds_chunk_dispatch(&mut output, &[first.clone(), last.clone()]);
            output
        };
        assert_eq!(
            dispatch
                .iter()
                .map(|entry| entry.chunk_id)
                .collect::<Vec<_>>(),
            [THREE_DS_TRIMESH, THREE_DS_CAMERA, THREE_DS_LIGHT]
        );
        assert!(Arc::ptr_eq(&dispatch[0].handler, &last));
        assert!(Arc::ptr_eq(&dispatch[1].handler, &first));
        assert!(Arc::ptr_eq(&dispatch[2].handler, &last));
        assert!(
            {
                let mut output = Vec::new();
                build_three_ds_chunk_dispatch(&mut output, &[]);
                output
            }
            .is_empty()
        );
        let materials = {
            let mut output = Vec::new();
            build_three_ds_chunk_dispatch(&mut output, &THREE_DS_MATERIAL_FAMILY);
            output
        };
        assert_eq!(materials.len(), 1);
        assert_eq!(materials[0].chunk_id, THREE_DS_MATERIAL);
        assert!(Arc::ptr_eq(
            &materials[0].handler,
            &THREE_DS_MATERIAL_HANDLER
        ));
        assert!(
            !materials
                .iter()
                .any(|entry| entry.chunk_id == THREE_DS_CAMERA)
        );
    }
    #[test]
    fn removes_old_claims_preserves_original_handles_and_reuses_the_dispatch_buffer() {
        let original = THREE_DS_MATERIAL_HANDLER.clone();
        let mut out = Vec::with_capacity(16);
        let pointer = out.as_ptr();
        let capacity = out.capacity();
        build_three_ds_chunk_dispatch(&mut out, &[original.clone()]);
        assert_eq!(out.len(), 1);
        assert!(Arc::ptr_eq(&out[0].handler, &original));
        build_three_ds_chunk_dispatch(&mut out, &THREE_DS_CAMERA_FAMILY);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].chunk_id, THREE_DS_CAMERA);
        assert!(!Arc::ptr_eq(&out[0].handler, &original));
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
        build_three_ds_chunk_dispatch(&mut out, &[]);
        assert!(out.is_empty());
        assert_eq!(out.as_ptr(), pointer);
        assert_eq!(out.capacity(), capacity);
    }
}
