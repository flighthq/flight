use flight_scene3d_formats::contract::*;
use std::sync::{Arc, RwLock};

mod register_gltf_camera_handlers {
    use super::*;

    #[test]
    fn registers_the_builtin_camera_handler_and_replaces_an_existing_camera_kind() {
        let mut handlers = vec![Arc::new(RwLock::new(GltfCoreFeatureHandler {
            apply: Arc::new(|_| {}),
            kind: "cameras".to_string(),
        }))];
        register_gltf_camera_handlers(&mut handlers);
        assert_eq!(handlers.len(), 1);
        assert!(Arc::ptr_eq(
            &handlers[0],
            &GLTF_CAMERAS_CORE_FEATURE_HANDLER
        ));
    }
}
