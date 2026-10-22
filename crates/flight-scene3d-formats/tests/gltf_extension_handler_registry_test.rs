use flight_scene3d_formats::contract::*;
use std::sync::{Arc, RwLock};

mod register_gltf_extension_handler {
    use super::*;

    #[test]
    fn adds_distinct_source_kinds_and_replaces_duplicate_kinds_in_place() {
        let first = Arc::new(RwLock::new(GltfExtensionHandler {
            apply: Arc::new(|_| {}),
            kind: "KHR_materials_clearcoat".to_string(),
        }));
        let replacement = Arc::new(RwLock::new(GltfExtensionHandler {
            apply: Arc::new(|_| {}),
            kind: "KHR_materials_clearcoat".to_string(),
        }));
        let other = Arc::new(RwLock::new(GltfExtensionHandler {
            apply: Arc::new(|_| {}),
            kind: "KHR_lights_punctual".to_string(),
        }));
        let mut handlers = Vec::new();
        register_gltf_extension_handler(&mut handlers, first.clone());
        register_gltf_extension_handler(&mut handlers, other.clone());
        register_gltf_extension_handler(&mut handlers, replacement.clone());
        assert_eq!(handlers.len(), 2);
        assert!(Arc::ptr_eq(&handlers[0], &replacement));
        assert!(Arc::ptr_eq(&handlers[1], &other));
        assert!(!Arc::ptr_eq(&handlers[0], &first));
        register_gltf_extension_handler(&mut handlers, replacement.clone());
        assert_eq!(handlers.len(), 2);
        assert!(Arc::ptr_eq(&handlers[0], &replacement));
    }

    #[test]
    fn mutates_only_the_caller_owned_registry_it_receives() {
        let mut first = Vec::new();
        let second: Vec<flight_entity::Ref<GltfExtensionHandler>> = Vec::new();
        let handler = Arc::new(RwLock::new(GltfExtensionHandler {
            apply: Arc::new(|_| {}),
            kind: "KHR_materials_clearcoat".to_string(),
        }));
        register_gltf_extension_handler(&mut first, handler.clone());
        assert_eq!(first.len(), 1);
        assert!(Arc::ptr_eq(&first[0], &handler));
        assert!(second.is_empty());
    }

    #[test]
    fn retains_an_open_vendor_kind_and_its_original_callback() {
        let callback = Arc::new(|_: &flight_entity::Ref<GltfExtensionContext>| {});
        let handler = Arc::new(RwLock::new(GltfExtensionHandler {
            apply: callback.clone(),
            kind: "VENDOR_custom_section".to_string(),
        }));
        let mut handlers = Vec::new();
        register_gltf_extension_handler(&mut handlers, handler.clone());
        assert!(Arc::ptr_eq(&handlers[0], &handler));
        let typed_callback: std::sync::Arc<
            dyn Fn(&flight_entity::Ref<GltfExtensionContext>) + Send + Sync,
        > = callback;
        assert!(Arc::ptr_eq(
            &handlers[0].read().unwrap().apply,
            &typed_callback
        ));
    }
}
