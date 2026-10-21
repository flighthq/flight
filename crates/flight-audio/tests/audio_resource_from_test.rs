use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};

use flight_audio::contract::*;
use flight_buffer::{
    ArrayBuffer, BlobArrayBufferReader, create_array_buffer_from_bytes, create_blob,
    get_array_buffer_storage,
};
use flight_entity::{FlightError, Float32Array, Record, Ref, Uint8Array, set_record_value};
use flight_hostcapability::ProviderRef;
use flight_net::{HostNetCapability, NetRequestOptions, NetResponse, NetResponseBody, NetState};
use flight_stream::{AbortSignal, abort_controller, create_abort_controller};

fn bytes(values: &[u8]) -> Ref<Box<Uint8Array>> {
    return Arc::new(RwLock::new(values.to_vec().into_boxed_slice()));
}

fn channel(values: &[f32]) -> Ref<Box<Float32Array>> {
    return Arc::new(RwLock::new(values.to_vec().into_boxed_slice()));
}

fn decoder(
    decode: impl Fn(Ref<Box<Uint8Array>>, String, AbortSignal) -> AudioResourceFuture
    + Send
    + Sync
    + 'static,
) -> AudioDecoderRegistry {
    return HashMap::from([("audio/mpeg".to_string(), Arc::new(decode) as AudioDecoder)]);
}

fn empty_slots() -> HostAudioDecodeCapabilities {
    return HostAudioDecodeCapabilities {
        aac: None,
        flac: None,
        mp3: None,
        mp4: None,
        ogg: None,
        wav: None,
        webm: None,
    };
}

fn host_codec(can_play: impl Fn(&str) -> bool + Send + Sync + 'static) -> HostAudioCodecCapability {
    return HostAudioCodecCapability {
        can_play_type: Arc::new(can_play),
        provider: Arc::new(()) as ProviderRef,
    };
}

fn net_state() -> NetState {
    let create: fn() -> NetState = Default::default;
    return create();
}

fn response(
    status: u32,
    status_text: &str,
    body: Option<NetResponseBody>,
    content_type: Option<&str>,
) -> Ref<NetResponse> {
    let create_headers: fn() -> Record<String> = Default::default;
    let mut headers = create_headers();
    if let Some(content_type) = content_type {
        set_record_value(
            &mut headers,
            "content-type".to_string(),
            content_type.to_string(),
        );
    }
    return Arc::new(RwLock::new(NetResponse {
        status,
        status_text: status_text.to_string(),
        ok: (200..300).contains(&status),
        headers: Arc::new(RwLock::new(headers)),
        body,
        url: "https://example.test/audio".to_string(),
    }));
}

fn successful_net_host(
    body: ArrayBuffer,
    content_type: Option<&str>,
    inspect: impl Fn(&flight_net::NetRequest, Option<NetRequestOptions>) + Send + Sync + 'static,
) -> HostNetCapability {
    let content_type = content_type.map(str::to_string);
    return HostNetCapability {
        provider: Arc::new(()) as ProviderRef,
        send_net_request: Arc::new(move |request, options| {
            inspect(
                &request.read().unwrap(),
                options.map(|options| options.read().unwrap().clone()),
            );
            let result = response(
                200,
                "OK",
                Some(NetResponseBody::Buffer(body.clone())),
                content_type.as_deref(),
            );
            Box::pin(async move { Ok(result) })
        }),
    };
}

mod create_audio_resource_from_samples {
    use super::*;

    #[test]
    fn copies_channels_and_uses_the_first_channel_length() {
        let first = channel(&[0.25, -0.5, 0.75]);
        let second = channel(&[1.0, 0.5]);
        let resource = create_audio_resource_from_samples(&[first, second], 48_000.0);
        let buffer = resource.read().unwrap().buffer.clone().unwrap();
        let buffer = buffer.read().unwrap();
        assert_eq!(buffer.length, 3);
        assert_eq!(buffer.sample_rate, 48_000.0);
        assert_eq!(&**buffer.channels[0].read().unwrap(), &[0.25, -0.5, 0.75]);
        assert_eq!(&**buffer.channels[1].read().unwrap(), &[1.0, 0.5, 0.0]);
    }

    #[test]
    fn returns_an_empty_resource_for_empty_or_zero_length_input() {
        assert!(
            create_audio_resource_from_samples(&[], 44_100.0)
                .read()
                .unwrap()
                .buffer
                .is_none()
        );
        assert!(
            create_audio_resource_from_samples(&[channel(&[])], 44_100.0)
                .read()
                .unwrap()
                .buffer
                .is_none()
        );
    }
}

mod load_audio_resource_from_base64 {
    use super::*;

    #[test]
    fn decodes_atob_bytes_and_preserves_the_declared_type() {
        let seen = Arc::new(Mutex::new(None));
        let decoders = decoder({
            let seen = seen.clone();
            move |bytes, mime_type, _| {
                *seen.lock().unwrap() = Some((bytes, mime_type));
                Box::pin(async { Some(create_audio_resource(None)) })
            }
        });
        crate::block_on(load_audio_resource_from_base64(
            &empty_slots(),
            "AAEC/w==",
            "audio/mpeg",
            None,
            Some(&decoders),
        ));
        let seen = seen.lock().unwrap();
        let (bytes, mime_type) = seen.as_ref().unwrap();
        assert_eq!(&**bytes.read().unwrap(), &[0, 1, 2, 255]);
        assert_eq!(mime_type, "audio/mpeg");
    }
}

mod load_audio_resource_from_blob {
    use super::*;

    #[test]
    fn checks_abort_around_the_nonabortable_read_and_keeps_array_buffer_storage() {
        let array_buffer = create_array_buffer_from_bytes(vec![7, 8, 9].into_boxed_slice());
        let expected_storage = get_array_buffer_storage(&array_buffer);
        let reader: BlobArrayBufferReader = Arc::new({
            let array_buffer = array_buffer.clone();
            move || {
                let array_buffer = array_buffer.clone();
                Box::pin(async move { Ok(array_buffer) })
            }
        });
        let blob = create_blob("audio/mpeg".to_string(), 3, None, Some(reader));
        let seen = Arc::new(Mutex::new(None));
        let decoders = decoder({
            let seen = seen.clone();
            move |bytes, _, _| {
                *seen.lock().unwrap() = Some(bytes);
                Box::pin(async { Some(create_audio_resource(None)) })
            }
        });
        crate::block_on(load_audio_resource_from_blob(
            &empty_slots(),
            &blob,
            None,
            Some(&decoders),
        ));
        assert!(Arc::ptr_eq(
            seen.lock().unwrap().as_ref().unwrap(),
            &expected_storage
        ));

        let controller = create_abort_controller();
        abort_controller(&controller, None);
        let reads = Arc::new(Mutex::new(0));
        let reader: BlobArrayBufferReader = Arc::new({
            let reads = reads.clone();
            move || {
                *reads.lock().unwrap() += 1;
                Box::pin(async { unreachable!() })
            }
        });
        let blob = create_blob(String::new(), 0, None, Some(reader));
        let aborted = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            crate::block_on(load_audio_resource_from_blob(
                &empty_slots(),
                &blob,
                Some(&controller.signal),
                None,
            ))
        }));
        assert!(aborted.is_err());
        assert_eq!(*reads.lock().unwrap(), 0);
    }

    #[test]
    fn suppresses_a_result_when_abort_happens_during_the_read() {
        let controller = Arc::new(create_abort_controller());
        let reader: BlobArrayBufferReader = Arc::new({
            let controller = controller.clone();
            move || {
                abort_controller(&controller, None);
                Box::pin(async { Ok(create_array_buffer_from_bytes(Box::new([1]))) })
            }
        });
        let blob = create_blob("audio/mpeg".to_string(), 1, None, Some(reader));
        let decoder_calls = Arc::new(Mutex::new(0));
        let decoders = decoder({
            let decoder_calls = decoder_calls.clone();
            move |_, _, _| {
                *decoder_calls.lock().unwrap() += 1;
                Box::pin(async { None })
            }
        });
        let aborted = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            crate::block_on(load_audio_resource_from_blob(
                &empty_slots(),
                &blob,
                Some(&controller.signal),
                Some(&decoders),
            ))
        }));
        assert!(aborted.is_err());
        assert_eq!(*decoder_calls.lock().unwrap(), 0);
    }

    #[test]
    fn rethrows_the_exact_blob_reader_rejection_value() {
        let reason: flight_entity::Unknown = Some(Arc::new("reader failed".to_string()));
        let reader: BlobArrayBufferReader = Arc::new({
            let reason = reason.clone();
            move || {
                let reason = reason.clone();
                Box::pin(async move { Err(reason) })
            }
        });
        let blob = create_blob("audio/mpeg".to_string(), 1, None, Some(reader));
        let thrown = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            crate::block_on(load_audio_resource_from_blob(
                &empty_slots(),
                &blob,
                None,
                None,
            ))
        }))
        .err()
        .unwrap()
        .downcast::<flight_entity::Unknown>()
        .unwrap();
        assert!(Arc::ptr_eq(
            thrown.as_ref().as_ref().unwrap(),
            reason.as_ref().unwrap()
        ));
    }
}

mod load_audio_resource_from_bytes {
    use super::*;

    #[test]
    fn returns_the_decoder_resource_by_identity_or_throws_the_exact_failure() {
        let expected = create_audio_resource(None);
        let decoders = decoder({
            let expected = expected.clone();
            move |_, _, _| {
                let expected = expected.clone();
                Box::pin(async move { Some(expected) })
            }
        });
        let actual = crate::block_on(load_audio_resource_from_bytes(
            &empty_slots(),
            &bytes(&[1]),
            Some("audio/mpeg"),
            None,
            Some(&decoders),
        ));
        assert!(Arc::ptr_eq(&actual, &expected));

        let failure = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            crate::block_on(load_audio_resource_from_bytes(
                &empty_slots(),
                &bytes(&[1]),
                Some("audio/unknown"),
                None,
                None,
            ))
        }))
        .err()
        .unwrap();
        let error = failure.downcast_ref::<FlightError>().unwrap();
        assert_eq!(error.message, "Failed to decode audio: audio/unknown");

        let failure = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            crate::block_on(load_audio_resource_from_bytes(
                &empty_slots(),
                &bytes(&[1]),
                None,
                None,
                None,
            ))
        }))
        .err()
        .unwrap();
        let error = failure.downcast_ref::<FlightError>().unwrap();
        assert_eq!(error.message, "Failed to decode audio");
    }
}

mod load_audio_resource_from_url {
    use super::*;

    #[test]
    fn sends_the_exact_array_buffer_request_and_prefers_the_response_content_type() {
        let signal = create_abort_controller().signal;
        let net = successful_net_host(
            create_array_buffer_from_bytes(Box::new([4, 5])),
            Some("audio/mpeg; source=header"),
            move |request, options| {
                assert_eq!(request.method, "GET");
                assert_eq!(request.url, "https://example.test/sound.wav");
                assert_eq!(
                    request.response_type,
                    Some(flight_net::NetResponseType::ArrayBuffer)
                );
                assert!(request.body.is_none());
                assert!(!options.unwrap().signal.unwrap().is_aborted());
            },
        );
        let seen = Arc::new(Mutex::new(None));
        let decoders = decoder({
            let seen = seen.clone();
            move |bytes, mime_type, _| {
                *seen.lock().unwrap() = Some((bytes, mime_type));
                Box::pin(async { Some(create_audio_resource(None)) })
            }
        });
        crate::block_on(load_audio_resource_from_url(
            &net,
            &empty_slots(),
            "https://example.test/sound.wav",
            Some(&signal),
            Some(&decoders),
            &net_state(),
        ));
        let seen = seen.lock().unwrap();
        let (bytes, mime_type) = seen.as_ref().unwrap();
        assert_eq!(&**bytes.read().unwrap(), &[4, 5]);
        assert_eq!(mime_type, "audio/mpeg; source=header");
    }

    #[test]
    fn rejects_http_failures_and_invalid_bodies_with_exact_messages() {
        for (response, expected) in [
            (
                response(404, "Not Found", None, None),
                "Failed to load audio: u (404 Not Found)",
            ),
            (
                response(
                    200,
                    "OK",
                    Some(NetResponseBody::Text("no".to_string())),
                    None,
                ),
                "Failed to load audio: u (invalid body)",
            ),
        ] {
            let host = HostNetCapability {
                provider: Arc::new(()) as ProviderRef,
                send_net_request: Arc::new(move |_, _| {
                    let response = response.clone();
                    Box::pin(async move { Ok(response) })
                }),
            };
            let failure = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                crate::block_on(load_audio_resource_from_url(
                    &host,
                    &empty_slots(),
                    "u",
                    None,
                    None,
                    &net_state(),
                ))
            }))
            .err()
            .unwrap();
            let error = failure.downcast_ref::<FlightError>().unwrap();
            assert_eq!(error.message, expected);
        }
    }
}

mod load_audio_resource_from_urls {
    use super::*;

    #[test]
    fn returns_an_empty_resource_without_fetching_when_no_source_is_supported() {
        let calls = Arc::new(Mutex::new(0));
        let host = HostNetCapability {
            provider: Arc::new(()) as ProviderRef,
            send_net_request: Arc::new({
                let calls = calls.clone();
                move |_, _| {
                    *calls.lock().unwrap() += 1;
                    Box::pin(async { unreachable!() })
                }
            }),
        };
        let resource = crate::block_on(load_audio_resource_from_urls(
            &host,
            &host_codec(|_| false),
            &empty_slots(),
            &[AudioResourceUrl {
                url: "sound.mp3".to_string(),
                type_: None,
            }],
            None,
            None,
            &net_state(),
        ));
        assert!(resource.read().unwrap().buffer.is_none());
        assert_eq!(*calls.lock().unwrap(), 0);
    }
}

mod select_audio_resource_url {
    use super::*;

    #[test]
    fn returns_the_first_platform_or_caller_supported_url() {
        let sources = [
            AudioResourceUrl {
                url: "first.custom".to_string(),
                type_: Some("audio/custom; rate=22050".to_string()),
            },
            AudioResourceUrl {
                url: "second.ogg".to_string(),
                type_: None,
            },
        ];
        let custom: AudioDecoder = Arc::new(|_, _, _| Box::pin(async { None }));
        let decoders = HashMap::from([("audio/custom".to_string(), custom)]);
        assert_eq!(
            select_audio_resource_url(&host_codec(|_| false), &sources, Some(&decoders)),
            Some("first.custom".to_string())
        );
        assert_eq!(
            select_audio_resource_url(
                &host_codec(|mime_type| mime_type == "audio/ogg"),
                &sources[1..],
                None,
            ),
            Some("second.ogg".to_string())
        );
    }
}
