use flight_scene3d_formats::contract::*;
use std::sync::{Arc, RwLock};

mod register_gltf_animation_handlers {
    use super::*;

    #[test]
    fn registers_the_builtin_animation_handler_and_replaces_an_existing_animation_kind() {
        let mut handlers = vec![Arc::new(RwLock::new(GltfCoreFeatureHandler {
            apply: Arc::new(|_| {}),
            kind: "animations".to_string(),
        }))];
        register_gltf_animation_handlers(&mut handlers);
        assert_eq!(handlers.len(), 1);
        assert!(Arc::ptr_eq(
            &handlers[0],
            &GLTF_ANIMATIONS_CORE_FEATURE_HANDLER
        ));
    }
}
