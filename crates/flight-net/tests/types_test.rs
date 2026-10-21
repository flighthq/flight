use crate::common::*;
use flight_buffer::{
    ArrayBufferViewKind, create_array_buffer, create_array_buffer_from_bytes,
    create_array_buffer_view, create_blob, equals_array_buffer, get_array_buffer_storage,
};
use flight_entity::Unknown;
use flight_net::contract::*;
use std::sync::{Arc, Mutex, RwLock};

mod host_net_capabilities {
    use super::*;
    #[test]
    fn preserves_optional_presence_and_canonical_provider_identity() {
        assert!(HostNetCapabilities { http: None }.http.is_none());
        let host = host_net(Arc::new(RwLock::new(response(200, "OK", None))));
        let cloned = host.clone();
        assert!(Arc::ptr_eq(&host.provider, &cloned.provider));
        let group = HostNetCapabilities { http: Some(host) };
        assert!(Arc::ptr_eq(
            &group.http.as_ref().unwrap().provider,
            &cloned.provider
        ));
        assert!(!Arc::ptr_eq(
            &host_net(Arc::new(RwLock::new(response(200, "OK", None)))).provider,
            &cloned.provider
        ));
    }
}

mod net_body {
    use super::*;
    #[test]
    fn retains_shared_buffer_view_offset_kind_and_caller_edits_without_flattening() {
        let buffer = create_array_buffer_from_bytes(vec![10, 20, 30, 40].into_boxed_slice());
        let view = create_array_buffer_view(&buffer, 1, 2, ArrayBufferViewKind::DataView).unwrap();
        let request = net_request("POST", "u");
        request.write().unwrap().body = Some(Some(NetBody::View(view)));
        let retained = Arc::new(Mutex::new(None));
        let captured = retained.clone();
        let expected_request = request.clone();
        let expected_buffer = buffer.clone();
        let host = HostNetCapability {
            provider: Arc::new(()),
            send_net_request: Arc::new(move |request, _| {
                assert!(Arc::ptr_eq(&request, &expected_request));
                let fields = request.read().unwrap();
                let Some(Some(NetBody::View(view))) = &fields.body else {
                    panic!("expected view arm");
                };
                assert!(equals_array_buffer(&view.buffer, &expected_buffer));
                assert_eq!(
                    (view.byte_offset, view.byte_length, view.kind),
                    (1, 2, ArrayBufferViewKind::DataView)
                );
                drop(fields);
                *captured.lock().unwrap() = Some(request);
                Box::pin(async { Ok(Arc::new(RwLock::new(response(200, "OK", None)))) })
            }),
        };
        block_on(send_net_request(&host, &request, None, &net_state())).unwrap();
        get_array_buffer_storage(&buffer).write().unwrap()[1] = 99;
        let retained = retained.lock().unwrap().clone().unwrap();
        let retained = retained.read().unwrap();
        let Some(Some(NetBody::View(view))) = &retained.body else {
            panic!("expected view arm");
        };
        assert_eq!(
            get_array_buffer_storage(&view.buffer).read().unwrap()[view.byte_offset],
            99
        );
    }

    #[test]
    fn keeps_text_buffer_and_view_arms_and_absent_versus_null_distinct() {
        let request = net_request("POST", "u");
        assert!(request.read().unwrap().body.is_none());
        request.write().unwrap().body = Some(None);
        assert!(matches!(request.read().unwrap().body, Some(None)));
        let buffer = create_array_buffer(0);
        for body in [
            NetBody::Text(String::new()),
            NetBody::Buffer(buffer.clone()),
            NetBody::View(
                create_array_buffer_view(&buffer, 0, 0, ArrayBufferViewKind::Uint8Array).unwrap(),
            ),
        ] {
            request.write().unwrap().body = Some(Some(body));
            assert!(request.read().unwrap().body.as_ref().unwrap().is_some());
        }
    }
}

mod net_request {
    use super::*;
    #[test]
    fn preserves_all_optional_fields_and_forwards_the_same_headers_record() {
        let request = net_request("PROPFIND", "not a normalized URL");
        {
            let fields = request.read().unwrap();
            assert!(
                fields.headers.is_none() && fields.body.is_none() && fields.response_type.is_none()
            );
            assert!(
                fields.timeout_ms.is_none()
                    && fields.credentials.is_none()
                    && fields.redirect.is_none()
            );
        }
        let headers = Arc::new(RwLock::new(fields(&[
            ("10", "ten"),
            ("2", "two"),
            ("X-Custom", "value"),
        ])));
        request.write().unwrap().headers = Some(headers.clone());
        request.write().unwrap().response_type = Some(NetResponseType::Json);
        request.write().unwrap().timeout_ms = Some(0.0);
        request.write().unwrap().credentials = Some(NetCredentials::Omit);
        request.write().unwrap().redirect = Some(NetRedirect::Manual);
        let expected_headers = headers.clone();
        let host = HostNetCapability {
            provider: Arc::new(()),
            send_net_request: Arc::new(move |request, _| {
                let request = request.read().unwrap();
                assert_eq!(request.method, "PROPFIND");
                assert_eq!(request.url, "not a normalized URL");
                assert!(Arc::ptr_eq(
                    request.headers.as_ref().unwrap(),
                    &expected_headers
                ));
                assert_eq!(request.response_type, Some(NetResponseType::Json));
                assert_eq!(request.timeout_ms, Some(0.0));
                assert_eq!(request.credentials, Some(NetCredentials::Omit));
                assert_eq!(request.redirect, Some(NetRedirect::Manual));
                let keys = {
                    let mut collected = Vec::new();
                    flight_entity::get_record_keys(
                        &mut collected,
                        &request.headers.as_ref().unwrap().read().unwrap(),
                    );
                    collected
                };
                assert_eq!(keys, ["2", "10", "X-Custom"]);
                Box::pin(async { Ok(Arc::new(RwLock::new(response(200, "OK", None)))) })
            }),
        };
        block_on(send_net_request(&host, &request, None, &net_state())).unwrap();
    }
}

mod net_response_body {
    use super::*;
    #[test]
    fn forwards_text_unknown_buffer_and_blob_identity_and_only_null_is_a_decode_sentinel() {
        struct Opaque(u32);
        let unknown: Unknown = Some(Arc::new(Opaque(73)));
        let blob_payload: Unknown = Some(Arc::new("provider-owned blob".to_string()));
        let blob = create_blob(
            "application/custom".to_string(),
            9,
            blob_payload.clone(),
            None,
        );
        let buffer = create_array_buffer(0);
        for body in [
            NetResponseBody::Text(String::new()),
            NetResponseBody::Unknown(unknown.clone()),
            NetResponseBody::Buffer(buffer.clone()),
            NetResponseBody::Blob(blob.clone()),
        ] {
            let expected = Arc::new(RwLock::new(response(200, "OK", None)));
            expected.write().unwrap().body = Some(body);
            let actual = block_on(send_net_request(
                &host_net(expected.clone()),
                &net_request("GET", "u"),
                None,
                &net_state(),
            ))
            .unwrap();
            assert!(Arc::ptr_eq(&actual, &expected));
            assert!(explain_net_response(&actual.read().unwrap()).is_none());
            match actual.read().unwrap().body.as_ref().unwrap() {
                NetResponseBody::Text(value) => assert_eq!(value, ""),
                NetResponseBody::Unknown(Some(value)) => {
                    assert!(Arc::ptr_eq(value, unknown.as_ref().unwrap()));
                    assert_eq!(value.downcast_ref::<Opaque>().unwrap().0, 73);
                }
                NetResponseBody::Buffer(value) => assert!(equals_array_buffer(value, &buffer)),
                NetResponseBody::Blob(value) => {
                    assert!(Arc::ptr_eq(value, &blob));
                    assert_eq!(value.mime_type, "application/custom");
                    assert_eq!(value.size, 9);
                    assert!(Arc::ptr_eq(
                        value.payload.as_ref().unwrap(),
                        blob_payload.as_ref().unwrap()
                    ));
                }
                NetResponseBody::Unknown(None) => panic!("this test uses a non-null unknown value"),
            }
        }
        let mut null = response(200, "OK", None);
        assert_eq!(
            explain_net_response(&null).unwrap().reason,
            NetResponseExplanationReason::DecodeFailure
        );
        null.body = Some(NetResponseBody::Unknown(None));
        assert_eq!(
            explain_net_response(&null).unwrap().reason,
            NetResponseExplanationReason::DecodeFailure
        );
    }
}
