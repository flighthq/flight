use std::sync::{Arc, Mutex, RwLock};

use flight_buffer::{create_array_buffer_from_bytes, get_array_buffer_storage};
use flight_entity::Ref;
use flight_net::{
    HostNetCapability, NetProgress, NetProgressPhase, NetResponse, NetResponseBody, NetResponseType,
};
use flight_scene3d::Scene3DDocument;
use flight_scene3d_resources::contract::*;
use flight_signals::{connect_signal, create_signal, emit_signal};
use flight_stream::{
    AbortSignal, abort_controller, create_abort_controller, is_abort_signal_aborted,
};
use futures::executor::block_on;

use crate::loader_support::{empty_headers, net_state};
use crate::support::external_reference;

fn response(ok: bool, body: Option<NetResponseBody>) -> Ref<NetResponse> {
    return Arc::new(RwLock::new(NetResponse {
        body,
        headers: empty_headers(),
        ok,
        status: if ok { 200 } else { 404 },
        status_text: if ok { "OK" } else { "Not Found" }.to_string(),
        url: "u".to_string(),
    }));
}

fn failing_host() -> HostNetCapability {
    return HostNetCapability {
        provider: Arc::new(()),
        send_net_request: Arc::new(|_, _| Box::pin(async { Ok(response(false, None)) })),
    };
}

mod get_scene3d_document_base_path_from_url {
    use super::*;

    #[test]
    fn returns_the_containing_path_without_query_or_fragment_data() {
        assert_eq!(
            get_scene3d_document_base_path_from_url("models/ship.gltf?cache=1"),
            Some("models".to_string())
        );
        assert_eq!(get_scene3d_document_base_path_from_url("ship.gltf"), None);
    }
}

mod load_scene3d_document_bytes_from_url {
    use super::*;

    #[test]
    fn forwards_cancellation_and_identifies_byte_progress_events_by_url() {
        let controller = create_abort_controller();
        let events: Arc<Mutex<Vec<Scene3DDocumentLoadProgress>>> = Arc::new(Mutex::new(Vec::new()));
        let progress = Arc::new(RwLock::new(
            create_signal::<Ref<Scene3DDocumentLoadProgress>>(),
        ));
        let captured = events.clone();
        connect_signal(
            &progress.read().unwrap(),
            Arc::new(move |event: &Ref<Scene3DDocumentLoadProgress>| {
                captured.lock().unwrap().push(event.read().unwrap().clone());
            }),
            None,
        );
        let forwarded: Arc<Mutex<Option<AbortSignal>>> = Arc::new(Mutex::new(None));
        let captured_signal = forwarded.clone();
        let host = HostNetCapability {
            provider: Arc::new(()),
            send_net_request: Arc::new(move |_, options| {
                let options = options.unwrap();
                let options = options.read().unwrap();
                *captured_signal.lock().unwrap() = options.signal.clone();
                let progress = options.progress.clone().unwrap();
                emit_signal(
                    &progress.read().unwrap(),
                    &Arc::new(RwLock::new(NetProgress {
                        loaded: 2,
                        phase: NetProgressPhase::Download,
                        total: 3,
                    })),
                );
                let buffer = create_array_buffer_from_bytes(vec![1, 2, 3].into_boxed_slice());
                Box::pin(async move { Ok(response(true, Some(NetResponseBody::Buffer(buffer)))) })
            }),
        };
        let options = Scene3DDocumentLoadOptions {
            progress: Some(progress),
            signal: Some(controller.signal.clone()),
        };

        let bytes = block_on(load_scene3d_document_bytes_from_url(
            &host,
            "model.bin",
            Some(&options),
            &net_state(),
        ))
        .unwrap();

        // The forwarded signal is the caller's own: aborting the controller now reaches it.
        abort_controller(&controller, None);
        assert!(is_abort_signal_aborted(
            forwarded.lock().unwrap().as_ref().unwrap()
        ));
        assert_eq!(
            get_array_buffer_storage(&bytes.buffer)
                .read()
                .unwrap()
                .to_vec(),
            vec![1, 2, 3]
        );
        assert_eq!(
            *events.lock().unwrap(),
            vec![Scene3DDocumentLoadProgress {
                loaded: 2,
                phase: NetProgressPhase::Download,
                total: 3,
                url: "model.bin".to_string(),
            }]
        );
    }

    #[test]
    fn returns_none_on_an_expected_transport_failure() {
        let bytes = block_on(load_scene3d_document_bytes_from_url(
            &failing_host(),
            "missing.bin",
            None,
            &net_state(),
        ));
        assert!(bytes.is_none());
    }
}

mod load_scene3d_document_text_from_url {
    use super::*;

    #[test]
    fn fetches_the_url_as_text_and_returns_the_string() {
        let requested: Arc<Mutex<Option<NetResponseType>>> = Arc::new(Mutex::new(None));
        let captured = requested.clone();
        let host = HostNetCapability {
            provider: Arc::new(()),
            send_net_request: Arc::new(move |request, _| {
                *captured.lock().unwrap() = request.read().unwrap().response_type;
                Box::pin(async {
                    Ok(response(
                        true,
                        Some(NetResponseBody::Text("v 0 0 0".to_string())),
                    ))
                })
            }),
        };
        let text = block_on(load_scene3d_document_text_from_url(
            &host,
            "model.obj",
            None,
            &net_state(),
        ));
        assert_eq!(text, Some("v 0 0 0".to_string()));
        assert_eq!(*requested.lock().unwrap(), Some(NetResponseType::Text));
    }

    #[test]
    fn returns_none_on_an_expected_transport_failure() {
        let text = block_on(load_scene3d_document_text_from_url(
            &failing_host(),
            "missing.obj",
            None,
            &net_state(),
        ));
        assert!(text.is_none());
    }
}

mod set_scene3d_document_resource_base_path_from_url {
    use super::*;
    use flight_image::ImageResourceReference;

    fn base_path(reference: &ImageResourceReference) -> Option<String> {
        let ImageResourceReference::External(value) = reference else {
            return None;
        };
        return value.reference.read().unwrap().base_path.clone();
    }

    #[test]
    fn sets_only_unresolved_relative_resources_whose_parser_did_not_already_supply_a_base_path() {
        let relative = external_reference("skin.png");
        let authored = external_reference("fixed.png");
        if let ImageResourceReference::External(value) = &authored {
            value.reference.write().unwrap().base_path = Some("authored".to_string());
        }
        let document = Scene3DDocument {
            animations: Vec::new(),
            cameras: Vec::new(),
            lights: Vec::new(),
            materials: Vec::new(),
            meshes: Vec::new(),
            metadata: None,
            nodes: Vec::new(),
            resources: vec![relative.clone(), authored.clone()],
            scenes: Vec::new(),
            skins: Vec::new(),
        };

        set_scene3d_document_resource_base_path_from_url(&document, "models/ship.obj");

        assert_eq!(base_path(&relative), Some("models".to_string()));
        assert_eq!(base_path(&authored), Some("authored".to_string()));
    }
}
