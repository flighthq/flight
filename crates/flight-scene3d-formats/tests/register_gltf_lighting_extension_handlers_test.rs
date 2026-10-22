use flight_scene3d_formats::contract::*;
use std::sync::{Arc, RwLock};

mod register_gltf_lighting_extension_handlers {
    use super::*;

    #[test]
    fn registers_the_punctual_light_handler_and_replaces_its_existing_extension_kind() {
        let mut handlers = vec![Arc::new(RwLock::new(GltfExtensionHandler {
            kind: "KHR_lights_punctual".to_string(),
            apply: Arc::new(|_| {}),
        }))];
        register_gltf_lighting_extension_handlers(&mut handlers);
        assert_eq!(handlers.len(), 1);
        assert!(Arc::ptr_eq(
            &handlers[0],
            &GLTF_PUNCTUAL_LIGHTS_EXTENSION_HANDLER
        ));
    }
}
