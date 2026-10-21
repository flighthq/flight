use std::panic::{AssertUnwindSafe, resume_unwind};
use std::sync::{Arc, RwLock};

use flight_entity::{
    FlightError, Ref, Uint8Array, Unknown, allocate_entity, get_flight_error_kind_string,
    unknown_from_panic, unknown_to_js_string,
};
use flight_resource::ResourceResolutionState;
use flight_stream::{AbortSignal, is_abort_signal_aborted};
use futures::FutureExt;

use crate::audio_resource::create_audio_resource;
use crate::decode_audio_resource_bytes::decode_audio_resource_bytes;
use crate::types::{
    AudioDecoderRegistry, AudioResource, AudioResourceFailure, AudioResourceFailureKind,
    AudioResourceFetch, AudioResourceReference, AudioResourceReferenceKind,
    AudioResourceReferenceResolutionExplanation, EmbeddedAudioResourceReference,
    ExternalAudioResourceReference, HostAudioDecodeCapabilities,
};

pub fn create_audio_resource_failure(cause: &Unknown) -> Ref<AudioResourceFailure> {
    let mut out: AudioResourceFailure = allocate_entity();
    out.kind = AudioResourceFailureKind::Error;
    if let Some(error) = cause
        .as_ref()
        .and_then(|cause| cause.downcast_ref::<FlightError>())
    {
        out.message = error.message.clone();
        out.name = Some(get_flight_error_kind_string(error.kind).to_string());
    } else {
        out.message = unknown_to_js_string(cause);
        out.name = None;
    }
    return Arc::new(RwLock::new(out));
}

pub fn create_embedded_audio_resource_reference(
    bytes: Ref<Box<Uint8Array>>,
    mime_type: Option<String>,
    name: Option<String>,
) -> Ref<EmbeddedAudioResourceReference> {
    let mut out: EmbeddedAudioResourceReference = allocate_entity();
    initialize_embedded_audio_resource_reference(&mut out, bytes, mime_type, name);
    return Arc::new(RwLock::new(out));
}

pub fn create_external_audio_resource_reference(
    uri: String,
    base_path: Option<String>,
    mime_type: Option<String>,
    name: Option<String>,
) -> Ref<ExternalAudioResourceReference> {
    let mut out: ExternalAudioResourceReference = allocate_entity();
    initialize_external_audio_resource_reference(&mut out, uri, base_path, mime_type, name);
    return Arc::new(RwLock::new(out));
}

pub fn initialize_embedded_audio_resource_reference(
    out: &mut EmbeddedAudioResourceReference,
    bytes: Ref<Box<Uint8Array>>,
    mime_type: Option<String>,
    name: Option<String>,
) {
    out.bytes = bytes;
    out.failure = None;
    out.mime_type = mime_type;
    out.name = name;
    out.resource = create_audio_resource(None);
    out.state = ResourceResolutionState::Unresolved;
}

pub fn initialize_external_audio_resource_reference(
    out: &mut ExternalAudioResourceReference,
    uri: String,
    base_path: Option<String>,
    mime_type: Option<String>,
    name: Option<String>,
) {
    out.base_path = base_path;
    out.failure = None;
    out.mime_type = mime_type;
    out.name = name;
    out.resource = create_audio_resource(None);
    out.state = ResourceResolutionState::Unresolved;
    out.uri = uri;
}

pub fn explain_audio_resource_reference_resolution(
    reference: &AudioResourceReference,
) -> AudioResourceReferenceResolutionExplanation {
    let (failure, kind, state) = match reference {
        AudioResourceReference::Embedded(value) => {
            let reference = value.reference.read().unwrap();
            (
                reference.failure.clone(),
                AudioResourceReferenceKind::Embedded,
                reference.state,
            )
        }
        AudioResourceReference::External(value) => {
            let reference = value.reference.read().unwrap();
            (
                reference.failure.clone(),
                AudioResourceReferenceKind::External,
                reference.state,
            )
        }
    };
    let failure = failure.map(|failure| {
        let failure = failure.read().unwrap();
        let mut out: AudioResourceFailure = allocate_entity();
        out.kind = failure.kind;
        out.message = failure.message.clone();
        out.name = failure.name.clone();
        Arc::new(RwLock::new(out))
    });
    return AudioResourceReferenceResolutionExplanation {
        failure,
        kind,
        retryable: state == ResourceResolutionState::Failed,
        state,
    };
}

pub fn find_audio_resource_reference_by_name(
    references: &[AudioResourceReference],
    name: &str,
) -> Option<AudioResourceReference> {
    for reference in references {
        let matches = match reference {
            AudioResourceReference::Embedded(value) => {
                value.reference.read().unwrap().name.as_deref() == Some(name)
            }
            AudioResourceReference::External(value) => {
                value.reference.read().unwrap().name.as_deref() == Some(name)
            }
        };
        if matches {
            return Some(reference.clone());
        }
    }
    return None;
}

pub fn reset_failed_audio_resource_reference(reference: &AudioResourceReference) -> bool {
    match reference {
        AudioResourceReference::Embedded(value) => {
            let mut reference = value.reference.write().unwrap();
            if reference.state != ResourceResolutionState::Failed {
                return false;
            }
            reference.failure = None;
            reference.state = ResourceResolutionState::Unresolved;
        }
        AudioResourceReference::External(value) => {
            let mut reference = value.reference.write().unwrap();
            if reference.state != ResourceResolutionState::Failed {
                return false;
            }
            reference.failure = None;
            reference.state = ResourceResolutionState::Unresolved;
        }
    }
    return true;
}

pub async fn resolve_audio_resource_reference(
    reference: &AudioResourceReference,
    audio_decode: &HostAudioDecodeCapabilities,
    fetch: &AudioResourceFetch,
    signal: &AbortSignal,
    decoders: Option<&AudioDecoderRegistry>,
) -> Option<Ref<AudioResource>> {
    match reference {
        AudioResourceReference::Embedded(value) => {
            let mut reference = value.reference.write().unwrap();
            reference.failure = None;
            reference.state = ResourceResolutionState::Loading;
        }
        AudioResourceReference::External(value) => {
            let mut reference = value.reference.write().unwrap();
            reference.failure = None;
            reference.state = ResourceResolutionState::Loading;
        }
    }
    let decoded = AssertUnwindSafe(async {
        return match reference {
            AudioResourceReference::Embedded(value) => {
                let (bytes, mime_type) = {
                    let reference = value.reference.read().unwrap();
                    (reference.bytes.clone(), reference.mime_type.clone())
                };
                decode_audio_resource_bytes(
                    audio_decode,
                    &bytes,
                    mime_type.as_deref(),
                    signal,
                    decoders,
                )
                .await
            }
            AudioResourceReference::External(value) => {
                fetch(value.reference.clone(), signal.clone()).await
            }
        };
    })
    .catch_unwind()
    .await;
    let decoded = match decoded {
        Ok(decoded) => decoded,
        Err(payload) => {
            if is_abort_signal_aborted(signal) {
                match reference {
                    AudioResourceReference::Embedded(value) => {
                        value.reference.write().unwrap().state =
                            ResourceResolutionState::Unresolved;
                    }
                    AudioResourceReference::External(value) => {
                        value.reference.write().unwrap().state =
                            ResourceResolutionState::Unresolved;
                    }
                }
                resume_unwind(payload);
            }
            let cause = match payload.downcast::<Unknown>() {
                Ok(cause) => *cause,
                Err(payload) => unknown_from_panic(payload),
            };
            let failure = create_audio_resource_failure(&cause);
            match reference {
                AudioResourceReference::Embedded(value) => {
                    let mut reference = value.reference.write().unwrap();
                    reference.failure = Some(failure);
                    reference.state = ResourceResolutionState::Failed;
                }
                AudioResourceReference::External(value) => {
                    let mut reference = value.reference.write().unwrap();
                    reference.failure = Some(failure);
                    reference.state = ResourceResolutionState::Failed;
                }
            }
            return None;
        }
    };
    let buffer = decoded.and_then(|resource| resource.read().unwrap().buffer.clone());
    let Some(buffer) = buffer else {
        let mut unavailable: AudioResourceFailure = allocate_entity();
        unavailable.kind = AudioResourceFailureKind::Unavailable;
        unavailable.message = "Audio resource unavailable".to_string();
        unavailable.name = None;
        let failure = Arc::new(RwLock::new(unavailable));
        match reference {
            AudioResourceReference::Embedded(value) => {
                let mut reference = value.reference.write().unwrap();
                reference.failure = Some(failure);
                reference.state = ResourceResolutionState::Failed;
            }
            AudioResourceReference::External(value) => {
                let mut reference = value.reference.write().unwrap();
                reference.failure = Some(failure);
                reference.state = ResourceResolutionState::Failed;
            }
        }
        return None;
    };
    let resource = match reference {
        AudioResourceReference::Embedded(value) => {
            let mut reference = value.reference.write().unwrap();
            reference.resource.write().unwrap().buffer = Some(buffer);
            reference.state = ResourceResolutionState::Resolved;
            reference.resource.clone()
        }
        AudioResourceReference::External(value) => {
            let mut reference = value.reference.write().unwrap();
            reference.resource.write().unwrap().buffer = Some(buffer);
            reference.state = ResourceResolutionState::Resolved;
            reference.resource.clone()
        }
    };
    return Some(resource);
}
