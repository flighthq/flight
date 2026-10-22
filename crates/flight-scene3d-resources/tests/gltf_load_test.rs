use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};

use flight_entity::Ref;
use flight_importdiagnostics::ImportDiagnostic;
use flight_scene3d_formats::{GltfCoreFeatureHandler, GltfExtensionHandler};
use flight_scene3d_resources::contract::*;
use futures::executor::block_on;

use crate::loader_support::*;

fn recording_core_handler(kind: &str, calls: &Arc<AtomicUsize>) -> Ref<GltfCoreFeatureHandler> {
    let calls = calls.clone();
    return Arc::new(RwLock::new(GltfCoreFeatureHandler {
        apply: Arc::new(move |_| {
            calls.fetch_add(1, Ordering::SeqCst);
        }),
        kind: kind.to_string(),
    }));
}

fn recording_extension_handler(calls: &Arc<AtomicUsize>) -> Ref<GltfExtensionHandler> {
    let calls = calls.clone();
    return Arc::new(RwLock::new(GltfExtensionHandler {
        apply: Arc::new(move |_| {
            calls.fetch_add(1, Ordering::SeqCst);
        }),
        kind: "KHR_lights_punctual".to_string(),
    }));
}

mod load_scene3d_document_from_glb_url_with_core_feature_handlers {
    use super::*;

    #[test]
    fn passes_the_caller_owned_core_feature_handlers_to_the_selective_parser() {
        let glb = glb_bytes(&gltf_fixture(None));
        let (host, requests) = net_host(Arc::new(move |_| Some(bytes_body(&glb))));
        let diagnostics: Ref<Vec<ImportDiagnostic>> = Arc::new(RwLock::new(Vec::new()));
        let core_calls = Arc::new(AtomicUsize::new(0));
        let extension_calls = Arc::new(AtomicUsize::new(0));
        let handlers = vec![recording_core_handler("animations", &core_calls)];
        let options = GltfScene3DDocumentLoadOptions {
            diagnostics: Some(diagnostics.clone()),
            extension_handlers: Some(vec![recording_extension_handler(&extension_calls)]),
            core_feature_handlers: None,
            progress: None,
            signal: None,
        };

        let loaded = block_on(
            load_scene3d_document_from_glb_url_with_core_feature_handlers(
                &host,
                "models/ship.glb",
                &handlers,
                Some(&options),
                &net_state(),
            ),
        )
        .unwrap();

        assert_eq!(
            *requests.lock().unwrap(),
            vec!["models/ship.glb".to_string()]
        );
        // The caller's handlers, diagnostics sink and extension handlers reach the real parser.
        assert_eq!(core_calls.load(Ordering::SeqCst), 1);
        assert_eq!(extension_calls.load(Ordering::SeqCst), 1);
        assert!(!diagnostics.read().unwrap().is_empty());
        assert_eq!(
            external_base_paths(&loaded.read().unwrap()),
            vec![Some("models".to_string())]
        );
    }

    #[test]
    fn accepts_an_empty_handler_list_for_a_minimal_parse() {
        let glb = glb_bytes(&gltf_fixture(None));
        let (host, _) = net_host(Arc::new(move |_| Some(bytes_body(&glb))));

        let loaded = block_on(
            load_scene3d_document_from_glb_url_with_core_feature_handlers(
                &host,
                "a.glb",
                &[],
                None,
                &net_state(),
            ),
        )
        .unwrap();

        // With no camera handler opted in, the document's camera stays unparsed.
        assert!(loaded.read().unwrap().cameras.is_empty());
    }

    #[test]
    fn returns_none_on_transport_failure_without_calling_the_parser() {
        let (host, requests) = net_host(Arc::new(|_| None));
        let core_calls = Arc::new(AtomicUsize::new(0));
        let handlers = vec![recording_core_handler("animations", &core_calls)];

        let loaded = block_on(
            load_scene3d_document_from_glb_url_with_core_feature_handlers(
                &host,
                "missing.glb",
                &handlers,
                None,
                &net_state(),
            ),
        );

        assert!(loaded.is_none());
        assert_eq!(requests.lock().unwrap().len(), 1);
        assert_eq!(core_calls.load(Ordering::SeqCst), 0);
    }
}

mod load_scene3d_document_from_gltf_url_with_core_feature_handlers {
    use super::*;

    #[test]
    fn passes_caller_owned_core_feature_handlers_through_the_gltf_text_path() {
        let gltf = gltf_fixture(Some("data.bin"));
        let buffer = float_bytes(&[1.0, 2.0, 3.0]);
        let (host, requests) = net_host(Arc::new(move |url| {
            if url.ends_with(".gltf") {
                Some(text_body(&gltf))
            } else {
                Some(bytes_body(&buffer))
            }
        }));
        let diagnostics: Ref<Vec<ImportDiagnostic>> = Arc::new(RwLock::new(Vec::new()));
        let core_calls = Arc::new(AtomicUsize::new(0));
        let handlers = vec![recording_core_handler("cameras", &core_calls)];
        let options = GltfScene3DDocumentLoadOptions {
            diagnostics: Some(diagnostics.clone()),
            core_feature_handlers: None,
            extension_handlers: None,
            progress: None,
            signal: None,
        };

        let loaded = block_on(
            load_scene3d_document_from_gltf_url_with_core_feature_handlers(
                &host,
                "models/ship.gltf",
                &handlers,
                Some(&options),
                &net_state(),
            ),
        )
        .unwrap();

        assert_eq!(
            *requests.lock().unwrap(),
            vec![
                "models/ship.gltf".to_string(),
                "models/data.bin".to_string()
            ]
        );
        assert_eq!(core_calls.load(Ordering::SeqCst), 1);
        assert!(!diagnostics.read().unwrap().is_empty());
        let loaded = loaded.read().unwrap();
        assert_eq!(
            external_base_paths(&loaded),
            vec![Some("models".to_string())]
        );
        // The external buffer's bytes are the mesh's vertex position.
        let geometry = loaded.meshes[0].geometry.read().unwrap();
        assert_eq!(geometry.vertices[..3].to_vec(), vec![1.0, 2.0, 3.0]);
    }

    #[test]
    fn returns_none_on_invalid_json_without_calling_the_parser() {
        let (host, requests) = net_host(Arc::new(|_| Some(text_body("{"))));
        let core_calls = Arc::new(AtomicUsize::new(0));
        let handlers = vec![recording_core_handler("cameras", &core_calls)];

        let loaded = block_on(
            load_scene3d_document_from_gltf_url_with_core_feature_handlers(
                &host,
                "broken.gltf",
                &handlers,
                None,
                &net_state(),
            ),
        );

        assert!(loaded.is_none());
        assert_eq!(requests.lock().unwrap().len(), 1);
        assert_eq!(core_calls.load(Ordering::SeqCst), 0);
    }
}
