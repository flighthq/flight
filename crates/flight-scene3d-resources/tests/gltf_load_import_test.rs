use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_importdiagnostics::ImportDiagnostic;
use flight_scene3d_formats::GltfExtensionHandler;
use flight_scene3d_resources::contract::*;
use futures::executor::block_on;

use crate::loader_support::*;

fn recording_extension_handler(calls: &Arc<AtomicUsize>) -> Ref<GltfExtensionHandler> {
    let calls = calls.clone();
    return Arc::new(RwLock::new(GltfExtensionHandler {
        apply: Arc::new(move |_| {
            calls.fetch_add(1, Ordering::SeqCst);
        }),
        kind: "KHR_lights_punctual".to_string(),
    }));
}

mod load_scene3d_document_from_glb_url {
    use super::*;

    #[test]
    fn fetches_bytes_carries_the_source_base_path_and_returns_a_cpu_document() {
        let glb = glb_bytes(&gltf_fixture(None));
        let (host, requests) = net_host(Arc::new(move |_| Some(bytes_body(&glb))));
        let diagnostics: Ref<Vec<ImportDiagnostic>> = Arc::new(RwLock::new(Vec::new()));
        let extension_calls = Arc::new(AtomicUsize::new(0));
        let options = GltfScene3DDocumentLoadOptions {
            diagnostics: Some(diagnostics.clone()),
            extension_handlers: Some(vec![recording_extension_handler(&extension_calls)]),
            core_feature_handlers: None,
            progress: None,
            signal: None,
        };

        let loaded = block_on(load_scene3d_document_from_glb_url(
            &host,
            "models/ship.glb",
            Some(&options),
            &net_state(),
        ))
        .unwrap();

        assert_eq!(*requests.lock().unwrap(), vec!["models/ship.glb".to_string()]);
        // The full animation/camera/skin handler set is the default: the camera is parsed.
        assert_eq!(loaded.read().unwrap().cameras.len(), 1);
        assert!(!diagnostics.read().unwrap().is_empty());
        assert_eq!(extension_calls.load(Ordering::SeqCst), 1);
        assert_eq!(external_base_paths(&loaded.read().unwrap()), vec![Some("models".to_string())]);
    }

    #[test]
    fn returns_none_rather_than_an_empty_document_on_transport_failure() {
        let (host, _) = net_host(Arc::new(|_| None));
        let loaded =
            block_on(load_scene3d_document_from_glb_url(&host, "missing.glb", None, &net_state()));
        assert!(loaded.is_none());
    }
}

mod load_scene3d_document_from_gltf_url {
    use super::*;

    #[test]
    fn fetches_external_geometry_buffers_and_supplies_the_image_base_path_to_parsing() {
        let gltf = gltf_fixture(Some("mesh.bin"));
        let buffer = float_bytes(&[8.0, 9.0, 10.0]);
        let (host, requests) = net_host(Arc::new(move |url| {
            if url.ends_with(".gltf") {
                Some(text_body(&gltf))
            } else {
                Some(bytes_body(&buffer))
            }
        }));
        let diagnostics: Ref<Vec<ImportDiagnostic>> = Arc::new(RwLock::new(Vec::new()));
        let extension_calls = Arc::new(AtomicUsize::new(0));
        let options = GltfScene3DDocumentLoadOptions {
            diagnostics: Some(diagnostics.clone()),
            extension_handlers: Some(vec![recording_extension_handler(&extension_calls)]),
            core_feature_handlers: None,
            progress: None,
            signal: None,
        };

        let loaded = block_on(load_scene3d_document_from_gltf_url(
            &host,
            "models/ship.gltf",
            Some(&options),
            &net_state(),
        ))
        .unwrap();

        assert_eq!(
            *requests.lock().unwrap(),
            vec!["models/ship.gltf".to_string(), "models/mesh.bin".to_string()]
        );
        let loaded = loaded.read().unwrap();
        assert_eq!(loaded.cameras.len(), 1);
        assert!(!diagnostics.read().unwrap().is_empty());
        assert_eq!(extension_calls.load(Ordering::SeqCst), 1);
        assert_eq!(external_base_paths(&loaded), vec![Some("models".to_string())]);
        let geometry = loaded.meshes[0].geometry.read().unwrap();
        assert_eq!(geometry.vertices[..3].to_vec(), vec![8.0, 9.0, 10.0]);
    }

    #[test]
    fn returns_none_when_json_or_a_required_external_buffer_cannot_load() {
        let (host, _) = net_host(Arc::new(|_| Some(text_body("{"))));
        let loaded =
            block_on(load_scene3d_document_from_gltf_url(&host, "broken.gltf", None, &net_state()));
        assert!(loaded.is_none());

        let gltf = gltf_fixture(Some("missing.bin"));
        let (host, requests) = net_host(Arc::new(move |url| {
            url.ends_with(".gltf").then(|| text_body(&gltf))
        }));
        let loaded = block_on(load_scene3d_document_from_gltf_url(
            &host,
            "models/ship.gltf",
            None,
            &net_state(),
        ));
        assert!(loaded.is_none());
        assert_eq!(
            *requests.lock().unwrap(),
            vec!["models/ship.gltf".to_string(), "models/missing.bin".to_string()]
        );
    }
}
