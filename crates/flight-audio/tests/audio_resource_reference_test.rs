use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_audio::contract::*;
use flight_entity::{FlightError, FlightErrorKind, Ref, Uint8Array, Unknown};
use flight_resource::ResourceResolutionState;
use flight_stream::{abort_controller, create_abort_controller};

fn bytes(values: &[u8]) -> Ref<Box<Uint8Array>> {
    return Arc::new(RwLock::new(values.to_vec().into_boxed_slice()));
}

fn embedded(reference: Ref<EmbeddedAudioResourceReference>) -> AudioResourceReference {
    return AudioResourceReference::Embedded(EmbeddedAudioResourceReferenceValue { reference });
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

fn external(reference: Ref<ExternalAudioResourceReference>) -> AudioResourceReference {
    return AudioResourceReference::External(ExternalAudioResourceReferenceValue { reference });
}

fn unused_fetch() -> AudioResourceFetch {
    return Arc::new(|_, _| Box::pin(async { None }));
}

mod create_audio_resource_failure {
    use super::*;

    #[test]
    fn preserves_error_name_and_message_and_stringifies_other_values() {
        let cause: Unknown = Some(Arc::new(FlightError {
            kind: FlightErrorKind::TypeError,
            message: "bad samples".to_string(),
        }));
        let failure = create_audio_resource_failure(&cause);
        let failure = failure.read().unwrap();
        assert_eq!(failure.kind, AudioResourceFailureKind::Error);
        assert_eq!(failure.message, "bad samples");
        assert_eq!(failure.name.as_deref(), Some("TypeError"));

        let cause: Unknown = Some(Arc::new("opaque reason".to_string()));
        let failure = create_audio_resource_failure(&cause);
        let failure = failure.read().unwrap();
        assert_eq!(failure.message, "opaque reason");
        assert!(failure.name.is_none());

        let failure = create_audio_resource_failure(&None);
        assert_eq!(failure.read().unwrap().message, "null");
    }
}

mod create_embedded_audio_resource_reference {
    use super::*;

    #[test]
    fn retains_byte_identity_and_allocates_the_stable_empty_resource() {
        let bytes = bytes(&[1, 2, 3]);
        let reference = create_embedded_audio_resource_reference(
            bytes.clone(),
            Some("audio/mpeg".to_string()),
            Some("theme".to_string()),
        );
        let reference = reference.read().unwrap();
        assert!(Arc::ptr_eq(&reference.bytes, &bytes));
        assert_eq!(reference.mime_type.as_deref(), Some("audio/mpeg"));
        assert_eq!(reference.name.as_deref(), Some("theme"));
        assert!(reference.failure.is_none());
        assert_eq!(reference.state, ResourceResolutionState::Unresolved);
        assert!(reference.resource.read().unwrap().buffer.is_none());
    }
}

mod create_external_audio_resource_reference {
    use super::*;

    #[test]
    fn retains_uri_metadata_and_allocates_the_stable_empty_resource() {
        let reference = create_external_audio_resource_reference(
            "sound/theme.mp3".to_string(),
            Some("https://example.test/assets/".to_string()),
            Some("audio/mpeg".to_string()),
            Some("theme".to_string()),
        );
        let reference = reference.read().unwrap();
        assert_eq!(reference.uri, "sound/theme.mp3");
        assert_eq!(
            reference.base_path.as_deref(),
            Some("https://example.test/assets/")
        );
        assert_eq!(reference.mime_type.as_deref(), Some("audio/mpeg"));
        assert_eq!(reference.name.as_deref(), Some("theme"));
        assert_eq!(reference.state, ResourceResolutionState::Unresolved);
        assert!(reference.resource.read().unwrap().buffer.is_none());
    }
}

mod explain_audio_resource_reference_resolution {
    use super::*;

    #[test]
    fn returns_detached_plain_failure_data_and_retryability() {
        let reference = create_embedded_audio_resource_reference(bytes(&[1]), None, None);
        let failure = create_audio_resource_failure(&Some(Arc::new(FlightError {
            kind: FlightErrorKind::Error,
            message: "decode failed".to_string(),
        })));
        {
            let mut reference = reference.write().unwrap();
            reference.failure = Some(failure.clone());
            reference.state = ResourceResolutionState::Failed;
        }
        let explanation = explain_audio_resource_reference_resolution(&embedded(reference));
        assert_eq!(explanation.kind, AudioResourceReferenceKind::Embedded);
        assert_eq!(explanation.state, ResourceResolutionState::Failed);
        assert!(explanation.retryable);
        let detached = explanation.failure.unwrap();
        assert!(!Arc::ptr_eq(&detached, &failure));
        assert_eq!(detached.read().unwrap().message, "decode failed");
    }
}

mod find_audio_resource_reference_by_name {
    use super::*;

    #[test]
    fn returns_the_first_matching_reference_by_identity() {
        let unnamed = create_embedded_audio_resource_reference(bytes(&[1]), None, None);
        let named = create_external_audio_resource_reference(
            "theme.mp3".to_string(),
            None,
            None,
            Some("theme".to_string()),
        );
        let references = [embedded(unnamed), external(named.clone())];
        let found = find_audio_resource_reference_by_name(&references, "theme").unwrap();
        let AudioResourceReference::External(found) = found else {
            panic!("expected external reference");
        };
        assert!(Arc::ptr_eq(&found.reference, &named));
        assert!(find_audio_resource_reference_by_name(&references, "missing").is_none());
    }
}

mod initialize_embedded_audio_resource_reference {
    use super::*;

    #[test]
    fn replaces_every_construction_field_and_resource_identity() {
        let reference = create_embedded_audio_resource_reference(bytes(&[1]), None, None);
        let old_resource = reference.read().unwrap().resource.clone();
        let replacement = bytes(&[8, 9]);
        initialize_embedded_audio_resource_reference(
            &mut reference.write().unwrap(),
            replacement.clone(),
            Some("audio/wav".to_string()),
            Some("effect".to_string()),
        );
        let reference = reference.read().unwrap();
        assert!(Arc::ptr_eq(&reference.bytes, &replacement));
        assert!(!Arc::ptr_eq(&reference.resource, &old_resource));
        assert_eq!(reference.state, ResourceResolutionState::Unresolved);
    }
}

mod initialize_external_audio_resource_reference {
    use super::*;

    #[test]
    fn replaces_every_construction_field_and_resource_identity() {
        let reference = create_external_audio_resource_reference("a".to_string(), None, None, None);
        let old_resource = reference.read().unwrap().resource.clone();
        initialize_external_audio_resource_reference(
            &mut reference.write().unwrap(),
            "b".to_string(),
            Some("base".to_string()),
            Some("audio/ogg".to_string()),
            Some("effect".to_string()),
        );
        let reference = reference.read().unwrap();
        assert_eq!(reference.uri, "b");
        assert_eq!(reference.base_path.as_deref(), Some("base"));
        assert!(!Arc::ptr_eq(&reference.resource, &old_resource));
        assert_eq!(reference.state, ResourceResolutionState::Unresolved);
    }
}

mod reset_failed_audio_resource_reference {
    use super::*;

    #[test]
    fn resets_only_failed_references() {
        let reference = create_embedded_audio_resource_reference(bytes(&[1]), None, None);
        let union = embedded(reference.clone());
        assert!(!reset_failed_audio_resource_reference(&union));
        {
            let mut reference = reference.write().unwrap();
            reference.state = ResourceResolutionState::Failed;
            reference.failure = Some(create_audio_resource_failure(&None));
        }
        assert!(reset_failed_audio_resource_reference(&union));
        let reference = reference.read().unwrap();
        assert_eq!(reference.state, ResourceResolutionState::Unresolved);
        assert!(reference.failure.is_none());
    }
}

mod resolve_audio_resource_reference {
    use super::*;

    #[test]
    fn binds_embedded_samples_into_the_preallocated_resource() {
        let reference = create_embedded_audio_resource_reference(
            bytes(&[1]),
            Some("audio/mpeg".to_string()),
            None,
        );
        let stable_resource = reference.read().unwrap().resource.clone();
        let buffer = create_audio_buffer(2, 1, 44_100.0);
        let decoder: AudioDecoder = Arc::new({
            let buffer = buffer.clone();
            move |_, _, _| {
                let decoded = create_audio_resource(Some(buffer.clone()));
                Box::pin(async move { Some(decoded) })
            }
        });
        let decoders = HashMap::from([("audio/mpeg".to_string(), decoder)]);
        let union = embedded(reference.clone());
        let resolved = crate::block_on(resolve_audio_resource_reference(
            &union,
            &empty_slots(),
            &unused_fetch(),
            &create_abort_controller().signal,
            Some(&decoders),
        ))
        .unwrap();
        assert!(Arc::ptr_eq(&resolved, &stable_resource));
        assert!(Arc::ptr_eq(
            resolved.read().unwrap().buffer.as_ref().unwrap(),
            &buffer
        ));
        let reference = reference.read().unwrap();
        assert_eq!(reference.state, ResourceResolutionState::Resolved);
        assert!(reference.failure.is_none());
    }

    #[test]
    fn fetches_an_external_reference_by_identity() {
        let reference =
            create_external_audio_resource_reference("theme.mp3".to_string(), None, None, None);
        let stable_resource = reference.read().unwrap().resource.clone();
        let buffer = create_audio_buffer(1, 1, 48_000.0);
        let fetch: AudioResourceFetch = Arc::new({
            let reference = reference.clone();
            let buffer = buffer.clone();
            move |actual, _| {
                assert!(Arc::ptr_eq(&actual, &reference));
                let decoded = create_audio_resource(Some(buffer.clone()));
                Box::pin(async move { Some(decoded) })
            }
        });
        let union = external(reference.clone());
        let resolved = crate::block_on(resolve_audio_resource_reference(
            &union,
            &empty_slots(),
            &fetch,
            &create_abort_controller().signal,
            None,
        ))
        .unwrap();
        assert!(Arc::ptr_eq(&resolved, &stable_resource));
        assert_eq!(
            reference.read().unwrap().state,
            ResourceResolutionState::Resolved
        );
    }

    #[test]
    fn records_expected_misses_as_retryable_unavailable_failures() {
        let reference = create_embedded_audio_resource_reference(
            bytes(&[1]),
            Some("audio/mpeg".to_string()),
            None,
        );
        let decoder: AudioDecoder = Arc::new(|_, _, _| Box::pin(async { None }));
        let decoders = HashMap::from([("audio/mpeg".to_string(), decoder)]);
        let union = embedded(reference.clone());
        assert!(
            crate::block_on(resolve_audio_resource_reference(
                &union,
                &empty_slots(),
                &unused_fetch(),
                &create_abort_controller().signal,
                Some(&decoders),
            ))
            .is_none()
        );
        let reference = reference.read().unwrap();
        assert_eq!(reference.state, ResourceResolutionState::Failed);
        let failure = reference.failure.as_ref().unwrap().read().unwrap();
        assert_eq!(failure.kind, AudioResourceFailureKind::Unavailable);
        assert_eq!(failure.message, "Audio resource unavailable");
        assert!(failure.name.is_none());
    }

    #[test]
    fn reduces_thrown_values_to_serialization_safe_failure_data() {
        let reference = create_embedded_audio_resource_reference(
            bytes(&[1]),
            Some("audio/mpeg".to_string()),
            None,
        );
        let decoder: AudioDecoder = Arc::new(|_, _, _| {
            Box::pin(async {
                std::panic::panic_any(FlightError {
                    kind: FlightErrorKind::TypeError,
                    message: "bad payload".to_string(),
                });
                #[allow(unreachable_code)]
                None
            })
        });
        let decoders = HashMap::from([("audio/mpeg".to_string(), decoder)]);
        assert!(
            crate::block_on(resolve_audio_resource_reference(
                &embedded(reference.clone()),
                &empty_slots(),
                &unused_fetch(),
                &create_abort_controller().signal,
                Some(&decoders),
            ))
            .is_none()
        );
        let reference = reference.read().unwrap();
        assert_eq!(reference.state, ResourceResolutionState::Failed);
        let failure = reference.failure.as_ref().unwrap().read().unwrap();
        assert_eq!(failure.message, "bad payload");
        assert_eq!(failure.name.as_deref(), Some("TypeError"));
    }

    #[test]
    fn restores_unresolved_and_rethrows_the_exact_abort_reason() {
        let reference = create_embedded_audio_resource_reference(
            bytes(&[1]),
            Some("audio/mpeg".to_string()),
            None,
        );
        let controller = Arc::new(create_abort_controller());
        let reason: Unknown = Some(Arc::new("stop".to_string()));
        let decoder: AudioDecoder = Arc::new({
            let controller = controller.clone();
            let reason = reason.clone();
            move |_, _, _| {
                abort_controller(&controller, Some(reason.clone()));
                Box::pin(async { Some(create_audio_resource(None)) })
            }
        });
        let decoders = HashMap::from([("audio/mpeg".to_string(), decoder)]);
        let thrown = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            crate::block_on(resolve_audio_resource_reference(
                &embedded(reference.clone()),
                &empty_slots(),
                &unused_fetch(),
                &controller.signal,
                Some(&decoders),
            ))
        }))
        .err()
        .unwrap()
        .downcast::<Unknown>()
        .unwrap();
        assert!(Arc::ptr_eq(
            thrown.as_ref().as_ref().unwrap(),
            reason.as_ref().unwrap()
        ));
        let reference = reference.read().unwrap();
        assert_eq!(reference.state, ResourceResolutionState::Unresolved);
        assert!(reference.failure.is_none());
    }
}
