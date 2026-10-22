use flight_scene3d_formats::contract::*;
use std::sync::{Arc, RwLock};

mod register_gltf_material_extension_handlers {
    use super::*;

    #[test]
    fn registers_every_builtin_material_extension_and_replaces_existing_kinds() {
        let stub = Arc::new(RwLock::new(GltfExtensionHandler {
            kind: "KHR_materials_anisotropy".to_string(),
            apply: Arc::new(|_| {}),
        }));
        let mut handlers = vec![stub.clone()];
        register_gltf_material_extension_handlers(&mut handlers);
        for handler in [
            GLTF_ANISOTROPY_EXTENSION_HANDLER.clone(),
            GLTF_CLEARCOAT_EXTENSION_HANDLER.clone(),
            GLTF_EMISSIVE_STRENGTH_EXTENSION_HANDLER.clone(),
            GLTF_IOR_EXTENSION_HANDLER.clone(),
            GLTF_IRIDESCENCE_EXTENSION_HANDLER.clone(),
            GLTF_SHEEN_EXTENSION_HANDLER.clone(),
            GLTF_SPECULAR_EXTENSION_HANDLER.clone(),
            GLTF_SPECULAR_GLOSSINESS_EXTENSION_HANDLER.clone(),
            GLTF_TRANSMISSION_EXTENSION_HANDLER.clone(),
            GLTF_UNLIT_EXTENSION_HANDLER.clone(),
            GLTF_VOLUME_EXTENSION_HANDLER.clone(),
        ] {
            assert!(handlers.iter().any(|entry| Arc::ptr_eq(entry, &handler)));
        }
        let kinds: Vec<_> = handlers
            .iter()
            .map(|handler| handler.read().unwrap().kind.clone())
            .collect();
        let unique: std::collections::HashSet<_> = kinds.iter().collect();
        assert_eq!(unique.len(), kinds.len());
        assert!(!handlers.iter().any(|handler| Arc::ptr_eq(handler, &stub)));
        assert!(Arc::ptr_eq(
            &handlers[0],
            &GLTF_ANISOTROPY_EXTENSION_HANDLER
        ));
    }
}
