use flight_scene3d_formats::contract::*;
use std::sync::{Arc, RwLock};

mod register_gltf_skin_handlers {
    use super::*;

    #[test]
    fn registers_the_builtin_skin_handler_and_replaces_an_existing_skin_kind() {
        let mut handlers = vec![Arc::new(RwLock::new(GltfCoreFeatureHandler {
            apply: Arc::new(|_| {}),
            kind: "skins".to_string(),
        }))];
        register_gltf_skin_handlers(&mut handlers);
        assert_eq!(handlers.len(), 1);
        assert!(Arc::ptr_eq(&handlers[0], &GLTF_SKINS_CORE_FEATURE_HANDLER));
    }
}
