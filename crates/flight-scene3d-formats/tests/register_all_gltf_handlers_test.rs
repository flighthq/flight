use flight_scene3d_formats::contract::*;
use std::sync::{Arc, RwLock};

mod register_all_gltf_handlers {
    use super::*;

    #[test]
    fn registers_every_builtin_optional_family_across_both_handler_lists() {
        let camera_stub = Arc::new(RwLock::new(GltfCoreFeatureHandler {
            kind: "cameras".to_string(),
            apply: Arc::new(|_| {}),
        }));
        let mut core_feature_handlers = vec![camera_stub.clone()];
        let mut extension_handlers = Vec::new();
        register_all_gltf_handlers(&mut core_feature_handlers, &mut extension_handlers);
        let mut expected_core = vec![camera_stub.clone()];
        register_gltf_animation_handlers(&mut expected_core);
        register_gltf_camera_handlers(&mut expected_core);
        register_gltf_skin_handlers(&mut expected_core);
        let mut expected_extensions = Vec::new();
        register_gltf_material_extension_handlers(&mut expected_extensions);
        register_gltf_lighting_extension_handlers(&mut expected_extensions);
        assert_eq!(core_feature_handlers.len(), expected_core.len());
        for (actual, expected) in core_feature_handlers.iter().zip(&expected_core) {
            assert!(Arc::ptr_eq(actual, expected));
        }
        assert_eq!(extension_handlers.len(), expected_extensions.len());
        for (actual, expected) in extension_handlers.iter().zip(&expected_extensions) {
            assert!(Arc::ptr_eq(actual, expected));
        }
        assert!(Arc::ptr_eq(
            &core_feature_handlers[0],
            &GLTF_CAMERAS_CORE_FEATURE_HANDLER
        ));
        assert!(
            !core_feature_handlers
                .iter()
                .any(|handler| Arc::ptr_eq(handler, &camera_stub))
        );
    }
}
