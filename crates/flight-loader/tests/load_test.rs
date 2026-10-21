use crate::common::*;
use flight_buffer::{
    ArrayBufferViewKind, create_array_buffer, create_array_buffer_from_bytes,
    create_array_buffer_view, equals_array_buffer, get_array_buffer_storage,
};
use flight_entity::{FlightError, FlightErrorKind, Ref};
use flight_loader::*;
use flight_net::{
    HostNetCapability, NetProgress, NetProgressPhase, NetResponseBody, NetResponseType,
};
use flight_signals::{create_signal, emit_signal};
use flight_stream::{abort_controller, create_abort_controller, get_abort_signal_reason};
use std::sync::{Arc, Mutex, RwLock};

mod load_bytes {
    use super::*;

    #[test]
    fn returns_a_full_uint8_view_on_success_and_retains_the_original_storage() {
        let buffer = create_array_buffer_from_bytes(vec![4, 7, 9].into_boxed_slice());
        let actual = block_on(load_bytes(
            &host(Some(NetResponseBody::Buffer(buffer.clone()))),
            "u",
            None,
            &net_state(),
        ))
        .unwrap();
        assert_eq!(actual.kind, ArrayBufferViewKind::Uint8Array);
        assert_eq!((actual.byte_offset, actual.byte_length), (0, 3));
        assert!(equals_array_buffer(&actual.buffer, &buffer));
        get_array_buffer_storage(&buffer).write().unwrap()[1] = 99;
        assert_eq!(
            get_array_buffer_storage(&actual.buffer).read().unwrap()[1],
            99
        );
    }

    #[test]
    fn accepts_empty_buffers_and_opaque_values_that_really_are_array_buffers() {
        let buffer = create_array_buffer(0);
        let actual = block_on(load_bytes(
            &host(Some(NetResponseBody::Unknown(Some(Arc::new(
                buffer.clone(),
            ))))),
            "u",
            None,
            &net_state(),
        ))
        .unwrap();
        assert_eq!(actual.byte_length, 0);
        assert!(equals_array_buffer(&actual.buffer, &buffer));
    }

    #[test]
    fn sends_a_get_arraybuffer_descriptor_with_omitted_optional_fields_and_options() {
        let provider = HostNetCapability {
            provider: Arc::new(()),
            send_net_request: Arc::new(|request, options| {
                let request = request.read().unwrap();
                assert_eq!(request.method, "GET");
                assert_eq!(request.url, "original URL");
                assert_eq!(request.response_type, Some(NetResponseType::ArrayBuffer));
                assert!(request.body.is_none() && request.headers.is_none());
                assert!(request.timeout_ms.is_none() && request.credentials.is_none());
                assert!(request.redirect.is_none() && options.is_none());
                Box::pin(async {
                    Ok(response(
                        true,
                        Some(NetResponseBody::Buffer(create_array_buffer(1))),
                    ))
                })
            }),
        };
        assert!(block_on(load_bytes(&provider, "original URL", None, &net_state())).is_some());
    }

    #[test]
    fn rejects_views_text_null_and_non_ok_buffers_instead_of_copying_or_coercing() {
        let buffer = create_array_buffer(2);
        let view =
            create_array_buffer_view(&buffer, 0, 1, ArrayBufferViewKind::Uint8Array).unwrap();
        for body in [
            None,
            Some(NetResponseBody::Unknown(None)),
            Some(NetResponseBody::Text("text".to_string())),
            Some(NetResponseBody::Unknown(Some(Arc::new(view)))),
        ] {
            assert!(block_on(load_bytes(&host(body), "u", None, &net_state())).is_none());
        }
        let provider = HostNetCapability {
            provider: Arc::new(()),
            send_net_request: Arc::new(move |_, _| {
                let buffer = buffer.clone();
                Box::pin(async move { Ok(response(false, Some(NetResponseBody::Buffer(buffer)))) })
            }),
        };
        assert!(block_on(load_bytes(&provider, "u", None, &net_state())).is_none());
    }

    #[test]
    fn catches_sync_provider_panics_async_panics_and_programmer_rejections_as_null() {
        for provider in [
            HostNetCapability {
                provider: Arc::new(()),
                send_net_request: Arc::new(|_, _| panic!("sync factory failure")),
            },
            HostNetCapability {
                provider: Arc::new(()),
                send_net_request: Arc::new(|_, _| {
                    Box::pin(async { panic!("async provider failure") })
                }),
            },
            HostNetCapability {
                provider: Arc::new(()),
                send_net_request: Arc::new(|_, _| {
                    Box::pin(async {
                        Err(FlightError {
                            kind: FlightErrorKind::TypeError,
                            message: "provider failure".to_string(),
                        })
                    })
                }),
            },
        ] {
            assert!(block_on(load_bytes(&provider, "u", None, &net_state())).is_none());
            assert!(block_on(load_text(&provider, "u", None, &net_state())).is_none());
        }
    }
}

mod load_text {
    use super::*;

    #[test]
    fn returns_text_on_success_including_empty_and_opaque_string_values() {
        for body in [
            NetResponseBody::Text("ok".to_string()),
            NetResponseBody::Unknown(Some(Arc::new("ok".to_string()))),
        ] {
            assert_eq!(
                block_on(load_text(&host(Some(body)), "u", None, &net_state())),
                Some("ok".to_string())
            );
        }
        assert_eq!(
            block_on(load_text(
                &host(Some(NetResponseBody::Text(String::new()))),
                "u",
                None,
                &net_state()
            )),
            Some(String::new())
        );
    }

    #[test]
    fn rejects_non_text_and_null_bodies_and_non_ok_text() {
        for body in [
            None,
            Some(NetResponseBody::Buffer(create_array_buffer(1))),
            Some(NetResponseBody::Unknown(Some(Arc::new(false)))),
        ] {
            assert!(block_on(load_text(&host(body), "u", None, &net_state())).is_none());
        }
        let provider = HostNetCapability {
            provider: Arc::new(()),
            send_net_request: Arc::new(|_, _| {
                Box::pin(async {
                    Ok(response(
                        false,
                        Some(NetResponseBody::Text("bad".to_string())),
                    ))
                })
            }),
        };
        assert!(block_on(load_text(&provider, "u", None, &net_state())).is_none());
    }

    #[test]
    fn preserves_some_options_and_the_original_abort_state_even_when_already_aborted() {
        let controller = create_abort_controller();
        let reason =
            Some(Arc::new("original reason".to_string()) as Arc<dyn std::any::Any + Send + Sync>);
        abort_controller(&controller, Some(reason.clone()));
        let input = Arc::new(RwLock::new(LoadOptions {
            signal: Some(controller.signal.clone()),
            progress: None,
        }));
        let expected_reason = reason.clone();
        let provider = HostNetCapability {
            provider: Arc::new(()),
            send_net_request: Arc::new(move |request, options| {
                assert_eq!(
                    request.read().unwrap().response_type,
                    Some(NetResponseType::Text)
                );
                let options = options.unwrap();
                let options = options.read().unwrap();
                assert!(options.progress.is_none());
                let actual = get_abort_signal_reason(options.signal.as_ref().unwrap()).unwrap();
                assert!(Arc::ptr_eq(
                    actual.as_ref().unwrap(),
                    expected_reason.as_ref().unwrap()
                ));
                Box::pin(async {
                    Ok(response(
                        true,
                        Some(NetResponseBody::Text("ok".to_string())),
                    ))
                })
            }),
        };
        assert_eq!(
            block_on(load_text(&provider, "u", Some(&input), &net_state())),
            Some("ok".to_string())
        );
    }

    #[test]
    fn forwards_progress_through_current_input_custom_emit_without_holding_any_record_lock() {
        let first = Arc::new(RwLock::new(create_signal::<Ref<LoadProgress>>()));
        let second = Arc::new(RwLock::new(create_signal::<Ref<LoadProgress>>()));
        let events = Arc::new(Mutex::new(Vec::new()));
        let captured = events.clone();
        *second.read().unwrap().emit.write().unwrap() =
            Arc::new(move |value| captured.lock().unwrap().push(value.clone()));
        let input = Arc::new(RwLock::new(LoadOptions {
            signal: None,
            progress: Some(first),
        }));
        let retained_input = input.clone();
        let provider = HostNetCapability {
            provider: Arc::new(()),
            send_net_request: Arc::new(move |_, options| {
                // The source reads input.progress on EVERY forwarded tick, not at request creation.
                retained_input.write().unwrap().progress = Some(second.clone());
                let progress = options.unwrap().read().unwrap().progress.clone().unwrap();
                let progress = progress.read().unwrap().clone();
                for phase in [NetProgressPhase::Upload, NetProgressPhase::Download] {
                    emit_signal(
                        &progress,
                        &Arc::new(RwLock::new(NetProgress {
                            phase,
                            loaded: 5,
                            total: 9,
                        })),
                    );
                }
                Box::pin(async {
                    Ok(response(
                        true,
                        Some(NetResponseBody::Text("done".to_string())),
                    ))
                })
            }),
        };
        assert_eq!(
            block_on(load_text(
                &provider,
                "source URL",
                Some(&input),
                &net_state()
            )),
            Some("done".to_string())
        );
        let events = events.lock().unwrap();
        assert_eq!(events.len(), 2);
        assert!(!Arc::ptr_eq(&events[0], &events[1]));
        let event = events[0].read().unwrap();
        assert_eq!(event.url, "source URL");
        assert_eq!(
            (event.loaded, event.total, event.phase),
            (5, 9, NetProgressPhase::Upload)
        );
        assert_eq!(events[1].read().unwrap().phase, NetProgressPhase::Download);
    }
}
