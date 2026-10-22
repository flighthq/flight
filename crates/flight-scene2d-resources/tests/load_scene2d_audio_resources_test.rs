use std::sync::{Arc, Mutex};

use flight_audio::{
    AudioResourceFetch, AudioResourceReference, EmbeddedAudioResourceReferenceValue,
    ExternalAudioResourceReferenceValue, HostAudioDecodeCapabilities,
    HostAudioDecodeFormatCapability, create_audio_buffer, create_audio_resource,
    create_embedded_audio_resource_reference, create_external_audio_resource_reference,
};
use flight_resource::ResourceResolutionState;
use flight_scene2d_resources::contract::*;
use flight_signals::{connect_signal, create_signal};

use crate::guard_state;

fn audio_decode() -> HostAudioDecodeCapabilities {
    let buffer = create_audio_buffer(1, 1, 44_100.0);
    return HostAudioDecodeCapabilities {
        aac: None,
        flac: None,
        mp3: Some(HostAudioDecodeFormatCapability {
            provider: Arc::new(()),
            decode: Arc::new(move |_, _| {
                let buffer = buffer.clone();
                Box::pin(async move { Some(buffer) })
            }),
        }),
        mp4: None,
        ogg: None,
        wav: None,
        webm: None,
    };
}

fn embedded(value: u8, mime_type: &str) -> AudioResourceReference {
    let reference = create_embedded_audio_resource_reference(Arc::new(std::sync::RwLock::new(
        vec![value].into_boxed_slice(),
    )));
    reference.write().unwrap().mime_type = Some(mime_type.to_string());
    return AudioResourceReference::Embedded(EmbeddedAudioResourceReferenceValue { reference });
}

fn empty_options() -> LoadScene2DAudioResourcesOptions {
    return LoadScene2DAudioResourcesOptions {
        audio_decode: None,
        decoders: None,
        fetch: None,
        progress: None,
        select: None,
        signal: None,
    };
}

fn external(uri: &str) -> AudioResourceReference {
    let reference = create_external_audio_resource_reference(uri.to_string());
    return AudioResourceReference::External(ExternalAudioResourceReferenceValue { reference });
}

fn reference_state(reference: &AudioResourceReference) -> ResourceResolutionState {
    return match reference {
        AudioResourceReference::Embedded(value) => value.reference.read().unwrap().state,
        AudioResourceReference::External(value) => value.reference.read().unwrap().state,
    };
}

mod load_scene2d_audio_resources {
    use super::*;

    #[test]
    fn decodes_every_embedded_reference_and_reports_them_resolved() {
        let references = vec![embedded(1, "audio/mpeg"), embedded(2, "audio/mpeg")];
        let document = create_scene2d_document();
        document.write().unwrap().audio_resources = references.clone();
        let mut options = empty_options();
        options.audio_decode = Some(audio_decode());
        let result = futures::executor::block_on(load_scene2d_audio_resources(
            &document,
            Some(&options),
            &guard_state(),
        ));
        assert_eq!(result.resolved.len(), 2);
        assert!(result.unresolved.is_empty());
        assert!(Arc::ptr_eq(&result.document, &document));
        for reference in &references {
            assert_eq!(
                reference_state(reference),
                ResourceResolutionState::Resolved
            );
        }
    }

    #[test]
    fn emits_progress_once_per_selected_reference() {
        let document = create_scene2d_document();
        document.write().unwrap().audio_resources =
            vec![embedded(1, "audio/mpeg"), embedded(2, "audio/mpeg")];
        let events = Arc::new(Mutex::new(Vec::new()));
        let progress = create_signal();
        let captured = events.clone();
        connect_signal(
            &progress,
            Arc::new(move |event: &Scene2DAudioResourceLoadProgress| {
                captured.lock().unwrap().push((event.loaded, event.total));
            }),
            None,
        );
        let mut options = empty_options();
        options.audio_decode = Some(audio_decode());
        options.progress = Some(progress);
        futures::executor::block_on(load_scene2d_audio_resources(
            &document,
            Some(&options),
            &guard_state(),
        ));
        assert_eq!(*events.lock().unwrap(), vec![(1, 2), (2, 2)]);
    }

    #[test]
    fn loads_only_what_select_admits() {
        let wanted = embedded(1, "audio/mpeg");
        let skipped = embedded(2, "audio/wav");
        let document = create_scene2d_document();
        document.write().unwrap().audio_resources = vec![wanted, skipped.clone()];
        let mut options = empty_options();
        options.audio_decode = Some(audio_decode());
        options.select = Some(Arc::new(|reference| match reference {
            AudioResourceReference::Embedded(value) => {
                value.reference.read().unwrap().mime_type.as_deref() == Some("audio/mpeg")
            }
            AudioResourceReference::External(_) => false,
        }));
        let result = futures::executor::block_on(load_scene2d_audio_resources(
            &document,
            Some(&options),
            &guard_state(),
        ));
        assert_eq!(result.resolved.len(), 1);
        assert!(result.unresolved.is_empty());
        assert_eq!(
            reference_state(&skipped),
            ResourceResolutionState::Unresolved
        );
    }

    #[test]
    fn releases_the_document_guard_before_select_and_preserves_identity_order_and_outcomes() {
        let first = embedded(1, "audio/mpeg");
        let second = embedded(2, "audio/mpeg");
        let first_handle = match &first {
            AudioResourceReference::Embedded(value) => value.reference.clone(),
            AudioResourceReference::External(_) => unreachable!(),
        };
        let second_handle = match &second {
            AudioResourceReference::Embedded(value) => value.reference.clone(),
            AudioResourceReference::External(_) => unreachable!(),
        };
        let document = create_scene2d_document();
        document.write().unwrap().audio_resources = vec![first, second];
        let seen = Arc::new(Mutex::new(Vec::new()));
        let captured_seen = seen.clone();
        let captured_document = document.clone();
        let captured_first = first_handle.clone();
        let captured_second = second_handle.clone();
        let mut options = empty_options();
        options.audio_decode = Some(audio_decode());
        options.select = Some(Arc::new(move |reference| {
            let mut document = captured_document
                .try_write()
                .expect("select must not run under the document read guard");
            document.source_kind = Some("audio-select-reentered".to_string());
            let ordinal = match reference {
                AudioResourceReference::Embedded(value)
                    if Arc::ptr_eq(&value.reference, &captured_first) =>
                {
                    1
                }
                AudioResourceReference::Embedded(value)
                    if Arc::ptr_eq(&value.reference, &captured_second) =>
                {
                    2
                }
                _ => 0,
            };
            captured_seen.lock().unwrap().push(ordinal);
            return true;
        }));
        let result = futures::executor::block_on(load_scene2d_audio_resources(
            &document,
            Some(&options),
            &guard_state(),
        ));
        assert_eq!(*seen.lock().unwrap(), vec![1, 2]);
        assert_eq!(result.resolved.len(), 2);
        match (&result.resolved[0], &result.resolved[1]) {
            (AudioResourceReference::Embedded(first), AudioResourceReference::Embedded(second)) => {
                assert!(Arc::ptr_eq(&first.reference, &first_handle));
                assert!(Arc::ptr_eq(&second.reference, &second_handle));
            }
            _ => panic!("selected references changed variants"),
        }
        assert!(result.unresolved.is_empty());
        assert_eq!(
            document.read().unwrap().source_kind.as_deref(),
            Some("audio-select-reentered")
        );
    }

    #[test]
    fn reports_an_external_reference_unresolved_without_a_fetch_seam() {
        let reference = external("hit.mp3");
        let document = create_scene2d_document();
        document.write().unwrap().audio_resources = vec![reference];
        let result = futures::executor::block_on(load_scene2d_audio_resources(
            &document,
            Some(&empty_options()),
            &guard_state(),
        ));
        assert_eq!(result.unresolved.len(), 1);
    }

    #[test]
    fn resolves_to_empty_contracts_for_a_document_that_carries_no_audio() {
        let document = create_scene2d_document();
        let result = futures::executor::block_on(load_scene2d_audio_resources(
            &document,
            None,
            &guard_state(),
        ));
        assert!(result.resolved.is_empty());
        assert!(result.unresolved.is_empty());
    }

    #[test]
    fn routes_external_references_through_the_callers_fetch_seam() {
        let reference = external("hit.mp3");
        let document = create_scene2d_document();
        document.write().unwrap().audio_resources = vec![reference];
        let calls = Arc::new(Mutex::new(0));
        let captured = calls.clone();
        let buffer = create_audio_buffer(1, 1, 48_000.0);
        let fetch: AudioResourceFetch = Arc::new(move |_, _| {
            *captured.lock().unwrap() += 1;
            let resource = create_audio_resource(Some(buffer.clone()));
            Box::pin(async move { Some(resource) })
        });
        let mut options = empty_options();
        options.fetch = Some(fetch);
        let result = futures::executor::block_on(load_scene2d_audio_resources(
            &document,
            Some(&options),
            &guard_state(),
        ));
        assert_eq!(*calls.lock().unwrap(), 1);
        assert_eq!(result.resolved.len(), 1);
    }

    #[test]
    fn separates_references_it_could_not_resolve() {
        let undecodable = embedded(1, "audio/vnd.acme.thing");
        let document = create_scene2d_document();
        document.write().unwrap().audio_resources = vec![undecodable.clone()];
        let result = futures::executor::block_on(load_scene2d_audio_resources(
            &document,
            Some(&empty_options()),
            &guard_state(),
        ));
        assert!(result.resolved.is_empty());
        assert_eq!(result.unresolved.len(), 1);
        assert_eq!(
            reference_state(&undecodable),
            ResourceResolutionState::Failed
        );
    }
}
