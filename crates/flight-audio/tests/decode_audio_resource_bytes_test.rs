use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};

use flight_audio::contract::*;
use flight_entity::{Ref, Uint8Array};
use flight_hostcapability::ProviderRef;
use flight_stream::{abort_controller, create_abort_controller};

fn bytes(values: &[u8]) -> Ref<Box<Uint8Array>> {
    return Arc::new(RwLock::new(values.to_vec().into_boxed_slice()));
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

fn slot(
    decode: impl Fn(Ref<Box<Uint8Array>>, flight_stream::AbortSignal) -> AudioBufferFuture
    + Send
    + Sync
    + 'static,
) -> HostAudioDecodeFormatCapability {
    return HostAudioDecodeFormatCapability {
        decode: Arc::new(decode),
        provider: Arc::new(()) as ProviderRef,
    };
}

mod decode_audio_resource_bytes {
    use super::*;

    #[test]
    fn decodes_a_standard_container_through_the_host_slot() {
        let expected = create_audio_buffer(1, 1, 44_100.0);
        let seen = Arc::new(Mutex::new(None));
        let capabilities = HostAudioDecodeCapabilities {
            mp3: Some(slot({
                let expected = expected.clone();
                let seen = seen.clone();
                move |bytes, _| {
                    *seen.lock().unwrap() = Some(bytes);
                    let expected = expected.clone();
                    Box::pin(async move { Some(expected) })
                }
            })),
            ..empty_slots()
        };
        let encoded = bytes(&[1]);
        let signal = create_abort_controller().signal;

        let resource = crate::block_on(decode_audio_resource_bytes(
            &capabilities,
            &encoded,
            Some("audio/mpeg"),
            &signal,
            None,
        ))
        .unwrap();

        assert!(Arc::ptr_eq(
            resource.read().unwrap().buffer.as_ref().unwrap(),
            &expected
        ));
        assert!(Arc::ptr_eq(
            seen.lock().unwrap().as_ref().unwrap(),
            &encoded
        ));
    }

    #[test]
    fn dispatches_the_full_parameterized_type_to_the_caller_decoder_first() {
        let expected = create_audio_buffer(2, 1, 48_000.0);
        let seen_type = Arc::new(Mutex::new(String::new()));
        let seen_bytes = Arc::new(Mutex::new(None));
        let host_calls = Arc::new(Mutex::new(0));
        let capabilities = HostAudioDecodeCapabilities {
            mp3: Some(slot({
                let host_calls = host_calls.clone();
                move |_, _| {
                    *host_calls.lock().unwrap() += 1;
                    Box::pin(async { None })
                }
            })),
            ..empty_slots()
        };
        let decoder: AudioDecoder = Arc::new({
            let expected = expected.clone();
            let seen_type = seen_type.clone();
            let seen_bytes = seen_bytes.clone();
            move |bytes, mime_type, _| {
                *seen_type.lock().unwrap() = mime_type;
                *seen_bytes.lock().unwrap() = Some(bytes);
                let resource = create_audio_resource(Some(expected.clone()));
                Box::pin(async move { Some(resource) })
            }
        });
        let decoders = HashMap::from([("audio/mpeg".to_string(), decoder)]);
        let encoded = bytes(&[1, 2]);
        let signal = create_abort_controller().signal;

        let resource = crate::block_on(decode_audio_resource_bytes(
            &capabilities,
            &encoded,
            Some("audio/mpeg; rate=22050"),
            &signal,
            Some(&decoders),
        ))
        .unwrap();

        assert!(Arc::ptr_eq(
            resource.read().unwrap().buffer.as_ref().unwrap(),
            &expected
        ));
        assert_eq!(*seen_type.lock().unwrap(), "audio/mpeg; rate=22050");
        assert!(Arc::ptr_eq(
            seen_bytes.lock().unwrap().as_ref().unwrap(),
            &encoded
        ));
        assert_eq!(*host_calls.lock().unwrap(), 0);
    }

    #[test]
    fn returns_expected_misses_without_falling_through() {
        let decoder: AudioDecoder = Arc::new(|_, _, _| Box::pin(async { None }));
        let decoders = HashMap::from([("audio/custom".to_string(), decoder)]);
        let signal = create_abort_controller().signal;
        assert!(
            crate::block_on(decode_audio_resource_bytes(
                &empty_slots(),
                &bytes(&[1]),
                Some("audio/custom"),
                &signal,
                Some(&decoders),
            ))
            .is_none()
        );
        assert!(
            crate::block_on(decode_audio_resource_bytes(
                &empty_slots(),
                &bytes(&[1]),
                Some("audio/mpeg"),
                &signal,
                None,
            ))
            .is_none()
        );
    }

    #[test]
    fn sniffs_an_absent_or_unclaimed_declared_type() {
        let expected = create_audio_buffer(1, 1, 44_100.0);
        let capabilities = HostAudioDecodeCapabilities {
            wav: Some(slot({
                let expected = expected.clone();
                move |_, _| {
                    let expected = expected.clone();
                    Box::pin(async move { Some(expected) })
                }
            })),
            ..empty_slots()
        };
        let encoded = bytes(&[0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
        let signal = create_abort_controller().signal;
        for mime_type in [None, Some("application/octet-stream")] {
            let resource = crate::block_on(decode_audio_resource_bytes(
                &capabilities,
                &encoded,
                mime_type,
                &signal,
                None,
            ))
            .unwrap();
            assert!(Arc::ptr_eq(
                resource.read().unwrap().buffer.as_ref().unwrap(),
                &expected
            ));
        }
    }

    #[test]
    fn throws_before_or_after_an_abort_without_landing_the_result() {
        let controller = create_abort_controller();
        abort_controller(&controller, None);
        let calls = Arc::new(Mutex::new(0));
        let capabilities = HostAudioDecodeCapabilities {
            mp3: Some(slot({
                let calls = calls.clone();
                move |_, _| {
                    *calls.lock().unwrap() += 1;
                    Box::pin(async { None })
                }
            })),
            ..empty_slots()
        };
        let already_aborted = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            crate::block_on(decode_audio_resource_bytes(
                &capabilities,
                &bytes(&[1]),
                Some("audio/mpeg"),
                &controller.signal,
                None,
            ))
        }));
        assert!(already_aborted.is_err());
        assert_eq!(*calls.lock().unwrap(), 0);

        let controller = Arc::new(create_abort_controller());
        let capabilities = HostAudioDecodeCapabilities {
            mp3: Some(slot({
                let controller = controller.clone();
                move |_, _| {
                    abort_controller(&controller, None);
                    let buffer = create_audio_buffer(1, 1, 44_100.0);
                    Box::pin(async move { Some(buffer) })
                }
            })),
            ..empty_slots()
        };
        let mid_decode = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            crate::block_on(decode_audio_resource_bytes(
                &capabilities,
                &bytes(&[1]),
                Some("audio/mpeg"),
                &controller.signal,
                None,
            ))
        }));
        assert!(mid_decode.is_err());
    }
}
