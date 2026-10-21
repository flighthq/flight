//! D18 Rust conveniences for the audio public lane. Every method delegates directly to one
//! public free-function contract; this module contains no independent audio behavior.

use flight_buffer::Blob;
use flight_entity::{Float32Array, Ref, Uint8Array, Unknown};
use flight_net::{HostNetCapability, NetState};
use flight_stream::AbortSignal;

use crate::audio_format::detect_audio_mime_type;
use crate::audio_resource::{
    clone_audio_resource, dispose_audio_resource, get_audio_resource_byte_size,
    get_audio_resource_channel_count, get_audio_resource_channel_data, get_audio_resource_duration,
    get_audio_resource_sample_rate, has_audio_resource_buffer, is_audio_resource_empty,
};
use crate::audio_resource_from::{
    load_audio_resource_from_base64, load_audio_resource_from_blob, load_audio_resource_from_bytes,
    load_audio_resource_from_url, load_audio_resource_from_urls, select_audio_resource_url,
};
use crate::audio_resource_reference::{
    create_audio_resource_failure, create_embedded_audio_resource_reference,
    create_external_audio_resource_reference, explain_audio_resource_reference_resolution,
    find_audio_resource_reference_by_name, reset_failed_audio_resource_reference,
    resolve_audio_resource_reference,
};
use crate::types::{
    AudioDecoderRegistry, AudioMimeTypeData, AudioResource, AudioResourceFailure,
    AudioResourceFetch, AudioResourceReference, AudioResourceReferenceResolutionExplanation,
    AudioResourceUrl, EmbeddedAudioResourceReference, ExternalAudioResourceReference,
    HostAudioCodecCapability, HostAudioDecodeCapabilities,
};

#[cfg(test)]
mod sugar_tests {
    use std::collections::HashMap;
    use std::future::Future;
    use std::sync::{Arc, RwLock};
    use std::task::{Context, Poll, Waker};

    use flight_buffer::{create_array_buffer_from_bytes, create_blob};
    use flight_entity::{FlightError, FlightErrorKind, Record};
    use flight_hostcapability::ProviderRef;
    use flight_net::{NetResponse, NetResponseBody};
    use flight_stream::create_abort_controller;

    use crate::audio_buffer::create_audio_buffer;
    use crate::audio_resource::create_audio_resource;
    use crate::types::{
        AudioDecoder, AudioResourceFuture, EmbeddedAudioResourceReferenceValue,
        ExternalAudioResourceReferenceValue,
    };

    use super::*;

    fn block_on<F: Future>(future: F) -> F::Output {
        let mut future = Box::pin(future);
        let mut context = Context::from_waker(Waker::noop());
        loop {
            match future.as_mut().poll(&mut context) {
                Poll::Ready(value) => return value,
                Poll::Pending => std::thread::yield_now(),
            }
        }
    }

    fn bytes(values: &[u8]) -> Ref<Box<Uint8Array>> {
        return Arc::new(RwLock::new(values.to_vec().into_boxed_slice()));
    }

    fn decoder(buffer: &Ref<crate::types::AudioBuffer>) -> AudioDecoderRegistry {
        let decoder: AudioDecoder = Arc::new({
            let buffer = buffer.clone();
            move |_, _, _| {
                let resource = create_audio_resource(Some(buffer.clone()));
                Box::pin(async move { Some(resource) })
            }
        });
        return HashMap::from([("audio/mpeg".to_string(), decoder)]);
    }

    fn empty_slots() -> HostAudioDecodeCapabilities {
        return HostAudioDecodeCapabilities::default();
    }

    fn resource() -> Ref<AudioResource> {
        return create_audio_resource(Some(create_audio_buffer(2, 1, 48_000.0)));
    }

    fn unused_fetch() -> AudioResourceFetch {
        return Arc::new(|_, _| Box::pin(async { None }) as AudioResourceFuture);
    }

    #[test]
    fn audio_buffer_new_delegates() {
        let method = crate::types::AudioBuffer::new(1, 1, 44_100.0);
        let function = create_audio_buffer(1, 1, 44_100.0);
        assert_eq!(
            method.read().unwrap().length,
            function.read().unwrap().length
        );
    }

    #[test]
    fn audio_mime_type_data_detect_mime_type_delegates() {
        let bytes = [b'I', b'D', b'3', 4];
        let method =
            AudioMimeTypeData::Uint8Array(crate::types::AudioMimeTypeUint8Array { data: &bytes })
                .detect_mime_type();
        let function = detect_audio_mime_type(AudioMimeTypeData::Uint8Array(
            crate::types::AudioMimeTypeUint8Array { data: &bytes },
        ));
        assert_eq!(method, function);
    }

    #[test]
    fn audio_net_load_audio_resource_from_url_delegates() {
        let buffer = create_audio_buffer(1, 1, 44_100.0);
        let decoders = decoder(&buffer);
        let make_headers: fn() -> Record<String> = Default::default;
        let host = HostNetCapability {
            provider: Arc::new(()) as ProviderRef,
            send_net_request: Arc::new(move |_, _| {
                let response = Arc::new(RwLock::new(NetResponse {
                    status: 200,
                    status_text: "OK".to_string(),
                    ok: true,
                    headers: Arc::new(RwLock::new(make_headers())),
                    body: Some(NetResponseBody::Buffer(create_array_buffer_from_bytes(
                        Box::new([1]),
                    ))),
                    url: "u.mp3".to_string(),
                }));
                Box::pin(async move { Ok(response) })
            }),
        };
        let state = NetState::default();
        let method = block_on(host.load_audio_resource_from_url(
            &empty_slots(),
            "u.mp3",
            None,
            Some(&decoders),
            &state,
        ));
        let function = block_on(load_audio_resource_from_url(
            &host,
            &empty_slots(),
            "u.mp3",
            None,
            Some(&decoders),
            &state,
        ));
        assert!(Arc::ptr_eq(
            method.read().unwrap().buffer.as_ref().unwrap(),
            function.read().unwrap().buffer.as_ref().unwrap()
        ));
    }

    #[test]
    fn audio_net_load_audio_resource_from_urls_delegates() {
        let host = HostNetCapability {
            provider: Arc::new(()) as ProviderRef,
            send_net_request: Arc::new(|_, _| Box::pin(async { unreachable!() })),
        };
        let codec = HostAudioCodecCapability {
            can_play_type: Arc::new(|_| false),
            provider: Arc::new(()) as ProviderRef,
        };
        let sources = [AudioResourceUrl {
            url: "sound.unknown".to_string(),
            type_: None,
        }];
        let state = NetState::default();
        let method = block_on(host.load_audio_resource_from_urls(
            &codec,
            &empty_slots(),
            &sources,
            None,
            None,
            &state,
        ));
        let function = block_on(load_audio_resource_from_urls(
            &host,
            &codec,
            &empty_slots(),
            &sources,
            None,
            None,
            &state,
        ));
        assert_eq!(method.has_buffer(), has_audio_resource_buffer(&function));
    }

    #[test]
    fn audio_resource_byte_size_delegates() {
        let resource = resource();
        assert_eq!(
            resource.byte_size(),
            get_audio_resource_byte_size(&resource)
        );
    }

    #[test]
    fn audio_resource_channel_count_delegates() {
        let resource = resource();
        assert_eq!(
            resource.channel_count(),
            get_audio_resource_channel_count(&resource)
        );
    }

    #[test]
    fn audio_resource_channel_data_delegates() {
        let resource = resource();
        assert!(Arc::ptr_eq(
            &resource.channel_data(0).unwrap(),
            &get_audio_resource_channel_data(&resource, 0).unwrap()
        ));
    }

    #[test]
    fn audio_resource_clone_resource_delegates() {
        let resource = resource();
        let method = resource.clone_resource();
        let function = clone_audio_resource(&resource);
        assert!(Arc::ptr_eq(
            method.read().unwrap().buffer.as_ref().unwrap(),
            function.read().unwrap().buffer.as_ref().unwrap()
        ));
    }

    #[test]
    fn audio_resource_dispose_delegates() {
        let method = resource();
        let function = resource();
        method.dispose();
        dispose_audio_resource(&function);
        assert_eq!(method.has_buffer(), has_audio_resource_buffer(&function));
    }

    #[test]
    fn audio_resource_duration_delegates() {
        let resource = resource();
        assert_eq!(resource.duration(), get_audio_resource_duration(&resource));
    }

    #[test]
    fn audio_resource_failure_new_delegates() {
        let cause: Unknown = Some(Arc::new(FlightError {
            kind: FlightErrorKind::Error,
            message: "bad".to_string(),
        }));
        let method = AudioResourceFailure::new(&cause);
        let function = create_audio_resource_failure(&cause);
        assert_eq!(
            method.read().unwrap().message,
            function.read().unwrap().message
        );
    }

    #[test]
    fn audio_resource_has_buffer_delegates() {
        let resource = resource();
        assert_eq!(resource.has_buffer(), has_audio_resource_buffer(&resource));
    }

    #[test]
    fn audio_resource_is_empty_delegates() {
        let resource = resource();
        assert_eq!(resource.is_empty(), is_audio_resource_empty(&resource));
    }

    #[test]
    fn audio_resource_new_delegates() {
        let buffer = create_audio_buffer(1, 1, 44_100.0);
        let method = AudioResource::new(Some(buffer.clone()));
        let function = create_audio_resource(Some(buffer));
        assert_eq!(method.has_buffer(), has_audio_resource_buffer(&function));
    }

    #[test]
    fn audio_resource_reference_explain_resolution_delegates() {
        let reference = EmbeddedAudioResourceReference::new(bytes(&[1]), None, None);
        let reference =
            AudioResourceReference::Embedded(EmbeddedAudioResourceReferenceValue { reference });
        assert_eq!(
            reference.explain_resolution().state,
            explain_audio_resource_reference_resolution(&reference).state
        );
    }

    #[test]
    fn audio_resource_reference_find_by_name_delegates() {
        let reference = ExternalAudioResourceReference::new(
            "u".to_string(),
            None,
            None,
            Some("named".to_string()),
        );
        let references = [AudioResourceReference::External(
            ExternalAudioResourceReferenceValue {
                reference: reference.clone(),
            },
        )];
        let method = AudioResourceReference::find_by_name(&references, "named").unwrap();
        let function = find_audio_resource_reference_by_name(&references, "named").unwrap();
        let (AudioResourceReference::External(method), AudioResourceReference::External(function)) =
            (method, function)
        else {
            panic!("expected external references");
        };
        assert!(Arc::ptr_eq(&method.reference, &function.reference));
    }

    #[test]
    fn audio_resource_reference_reset_failed_delegates() {
        let method = EmbeddedAudioResourceReference::new(bytes(&[1]), None, None);
        let function = EmbeddedAudioResourceReference::new(bytes(&[1]), None, None);
        method.write().unwrap().state = flight_resource::ResourceResolutionState::Failed;
        function.write().unwrap().state = flight_resource::ResourceResolutionState::Failed;
        let method = AudioResourceReference::Embedded(EmbeddedAudioResourceReferenceValue {
            reference: method,
        });
        let function = AudioResourceReference::Embedded(EmbeddedAudioResourceReferenceValue {
            reference: function,
        });
        assert_eq!(
            method.reset_failed(),
            reset_failed_audio_resource_reference(&function)
        );
    }

    #[test]
    fn audio_resource_reference_resolve_delegates() {
        let buffer = create_audio_buffer(1, 1, 44_100.0);
        let decoders = decoder(&buffer);
        let method = AudioResourceReference::Embedded(EmbeddedAudioResourceReferenceValue {
            reference: EmbeddedAudioResourceReference::new(
                bytes(&[1]),
                Some("audio/mpeg".to_string()),
                None,
            ),
        });
        let function = AudioResourceReference::Embedded(EmbeddedAudioResourceReferenceValue {
            reference: EmbeddedAudioResourceReference::new(
                bytes(&[1]),
                Some("audio/mpeg".to_string()),
                None,
            ),
        });
        let signal = create_abort_controller().signal;
        let method =
            block_on(method.resolve(&empty_slots(), &unused_fetch(), &signal, Some(&decoders)))
                .unwrap();
        let function = block_on(resolve_audio_resource_reference(
            &function,
            &empty_slots(),
            &unused_fetch(),
            &signal,
            Some(&decoders),
        ))
        .unwrap();
        assert!(Arc::ptr_eq(
            method.read().unwrap().buffer.as_ref().unwrap(),
            function.read().unwrap().buffer.as_ref().unwrap()
        ));
    }

    #[test]
    fn audio_resource_sample_rate_delegates() {
        let resource = resource();
        assert_eq!(
            resource.sample_rate(),
            get_audio_resource_sample_rate(&resource)
        );
    }

    #[test]
    fn embedded_audio_resource_reference_new_delegates() {
        let method = EmbeddedAudioResourceReference::new(bytes(&[1]), None, None);
        let function = create_embedded_audio_resource_reference(bytes(&[1]), None, None);
        assert_eq!(method.read().unwrap().state, function.read().unwrap().state);
    }

    #[test]
    fn external_audio_resource_reference_new_delegates() {
        let method = ExternalAudioResourceReference::new("u".to_string(), None, None, None);
        let function = create_external_audio_resource_reference("u".to_string(), None, None, None);
        assert_eq!(method.read().unwrap().uri, function.read().unwrap().uri);
    }

    #[test]
    fn host_audio_codec_select_audio_resource_url_delegates() {
        let capability = HostAudioCodecCapability {
            can_play_type: Arc::new(|mime_type| mime_type == "audio/mpeg"),
            provider: Arc::new(()) as ProviderRef,
        };
        let sources = [AudioResourceUrl {
            url: "u.mp3".to_string(),
            type_: None,
        }];
        assert_eq!(
            capability.select_audio_resource_url(&sources, None),
            select_audio_resource_url(&capability, &sources, None)
        );
    }

    #[test]
    fn host_audio_decode_load_resource_from_base64_delegates() {
        let buffer = create_audio_buffer(1, 1, 44_100.0);
        let decoders = decoder(&buffer);
        let capabilities = empty_slots();
        let method = block_on(capabilities.load_resource_from_base64(
            "AQ==",
            "audio/mpeg",
            None,
            Some(&decoders),
        ));
        let function = block_on(load_audio_resource_from_base64(
            &capabilities,
            "AQ==",
            "audio/mpeg",
            None,
            Some(&decoders),
        ));
        assert!(Arc::ptr_eq(
            method.read().unwrap().buffer.as_ref().unwrap(),
            function.read().unwrap().buffer.as_ref().unwrap()
        ));
    }

    #[test]
    fn host_audio_decode_load_resource_from_blob_delegates() {
        let buffer = create_audio_buffer(1, 1, 44_100.0);
        let decoders = decoder(&buffer);
        let blob = create_blob(
            "audio/mpeg".to_string(),
            1,
            None,
            Some(Arc::new(|| {
                Box::pin(async { Ok(create_array_buffer_from_bytes(Box::new([1]))) })
            })),
        );
        let capabilities = empty_slots();
        let method = block_on(capabilities.load_resource_from_blob(&blob, None, Some(&decoders)));
        let function = block_on(load_audio_resource_from_blob(
            &capabilities,
            &blob,
            None,
            Some(&decoders),
        ));
        assert!(Arc::ptr_eq(
            method.read().unwrap().buffer.as_ref().unwrap(),
            function.read().unwrap().buffer.as_ref().unwrap()
        ));
    }

    #[test]
    fn host_audio_decode_load_resource_from_bytes_delegates() {
        let buffer = create_audio_buffer(1, 1, 44_100.0);
        let decoders = decoder(&buffer);
        let capabilities = empty_slots();
        let bytes = bytes(&[1]);
        let method = block_on(capabilities.load_resource_from_bytes(
            &bytes,
            Some("audio/mpeg"),
            None,
            Some(&decoders),
        ));
        let function = block_on(load_audio_resource_from_bytes(
            &capabilities,
            &bytes,
            Some("audio/mpeg"),
            None,
            Some(&decoders),
        ));
        assert!(Arc::ptr_eq(
            method.read().unwrap().buffer.as_ref().unwrap(),
            function.read().unwrap().buffer.as_ref().unwrap()
        ));
    }
}

#[allow(async_fn_in_trait)]
pub trait AudioNetMethods {
    async fn load_audio_resource_from_url(
        &self,
        audio_decode: &HostAudioDecodeCapabilities,
        url: &str,
        signal: Option<&AbortSignal>,
        decoders: Option<&AudioDecoderRegistry>,
        net_state: &NetState,
    ) -> Ref<AudioResource>;

    async fn load_audio_resource_from_urls(
        &self,
        host_audio_codec: &HostAudioCodecCapability,
        audio_decode: &HostAudioDecodeCapabilities,
        sources: &[AudioResourceUrl],
        signal: Option<&AbortSignal>,
        decoders: Option<&AudioDecoderRegistry>,
        net_state: &NetState,
    ) -> Ref<AudioResource>;
}

pub trait AudioResourceMethods {
    fn byte_size(&self) -> usize;
    fn channel_count(&self) -> usize;
    fn channel_data(&self, channel: i32) -> Option<Ref<Box<Float32Array>>>;
    fn clone_resource(&self) -> Ref<AudioResource>;
    fn dispose(&self);
    fn duration(&self) -> f64;
    fn has_buffer(&self) -> bool;
    fn is_empty(&self) -> bool;
    fn sample_rate(&self) -> f32;
}

impl AudioNetMethods for HostNetCapability {
    async fn load_audio_resource_from_url(
        &self,
        audio_decode: &HostAudioDecodeCapabilities,
        url: &str,
        signal: Option<&AbortSignal>,
        decoders: Option<&AudioDecoderRegistry>,
        net_state: &NetState,
    ) -> Ref<AudioResource> {
        return load_audio_resource_from_url(self, audio_decode, url, signal, decoders, net_state)
            .await;
    }

    async fn load_audio_resource_from_urls(
        &self,
        host_audio_codec: &HostAudioCodecCapability,
        audio_decode: &HostAudioDecodeCapabilities,
        sources: &[AudioResourceUrl],
        signal: Option<&AbortSignal>,
        decoders: Option<&AudioDecoderRegistry>,
        net_state: &NetState,
    ) -> Ref<AudioResource> {
        return load_audio_resource_from_urls(
            self,
            host_audio_codec,
            audio_decode,
            sources,
            signal,
            decoders,
            net_state,
        )
        .await;
    }
}

impl AudioResourceMethods for Ref<AudioResource> {
    fn byte_size(&self) -> usize {
        return get_audio_resource_byte_size(self);
    }

    fn channel_count(&self) -> usize {
        return get_audio_resource_channel_count(self);
    }

    fn channel_data(&self, channel: i32) -> Option<Ref<Box<Float32Array>>> {
        return get_audio_resource_channel_data(self, channel);
    }

    fn clone_resource(&self) -> Ref<AudioResource> {
        return clone_audio_resource(self);
    }

    fn dispose(&self) {
        dispose_audio_resource(self);
    }

    // flight-lint: allow(f64) AudioBuffer duration is a Web Audio double-precision seconds value
    fn duration(&self) -> f64 {
        return get_audio_resource_duration(self);
    }

    fn has_buffer(&self) -> bool {
        return has_audio_resource_buffer(self);
    }

    fn is_empty(&self) -> bool {
        return is_audio_resource_empty(self);
    }

    fn sample_rate(&self) -> f32 {
        return get_audio_resource_sample_rate(self);
    }
}

impl<'a> AudioMimeTypeData<'a> {
    pub fn detect_mime_type(self) -> Option<String> {
        return detect_audio_mime_type(self);
    }
}

impl AudioResourceFailure {
    pub fn new(cause: &Unknown) -> Ref<Self> {
        return create_audio_resource_failure(cause);
    }
}

impl AudioResourceReference {
    pub fn explain_resolution(&self) -> AudioResourceReferenceResolutionExplanation {
        return explain_audio_resource_reference_resolution(self);
    }

    pub fn find_by_name(
        references: &[AudioResourceReference],
        name: &str,
    ) -> Option<AudioResourceReference> {
        return find_audio_resource_reference_by_name(references, name);
    }

    pub fn reset_failed(&self) -> bool {
        return reset_failed_audio_resource_reference(self);
    }

    pub async fn resolve(
        &self,
        audio_decode: &HostAudioDecodeCapabilities,
        fetch: &AudioResourceFetch,
        signal: &AbortSignal,
        decoders: Option<&AudioDecoderRegistry>,
    ) -> Option<Ref<AudioResource>> {
        return resolve_audio_resource_reference(self, audio_decode, fetch, signal, decoders).await;
    }
}

impl EmbeddedAudioResourceReference {
    pub fn new(
        bytes: Ref<Box<Uint8Array>>,
        mime_type: Option<String>,
        name: Option<String>,
    ) -> Ref<Self> {
        return create_embedded_audio_resource_reference(bytes, mime_type, name);
    }
}

impl ExternalAudioResourceReference {
    pub fn new(
        uri: String,
        base_path: Option<String>,
        mime_type: Option<String>,
        name: Option<String>,
    ) -> Ref<Self> {
        return create_external_audio_resource_reference(uri, base_path, mime_type, name);
    }
}

impl HostAudioCodecCapability {
    pub fn select_audio_resource_url(
        &self,
        sources: &[AudioResourceUrl],
        decoders: Option<&AudioDecoderRegistry>,
    ) -> Option<String> {
        return select_audio_resource_url(self, sources, decoders);
    }
}

impl HostAudioDecodeCapabilities {
    pub async fn load_resource_from_base64(
        &self,
        base64: &str,
        mime_type: &str,
        signal: Option<&AbortSignal>,
        decoders: Option<&AudioDecoderRegistry>,
    ) -> Ref<AudioResource> {
        return load_audio_resource_from_base64(self, base64, mime_type, signal, decoders).await;
    }

    pub async fn load_resource_from_blob(
        &self,
        blob: &Blob,
        signal: Option<&AbortSignal>,
        decoders: Option<&AudioDecoderRegistry>,
    ) -> Ref<AudioResource> {
        return load_audio_resource_from_blob(self, blob, signal, decoders).await;
    }

    pub async fn load_resource_from_bytes(
        &self,
        bytes: &Ref<Box<Uint8Array>>,
        mime_type: Option<&str>,
        signal: Option<&AbortSignal>,
        decoders: Option<&AudioDecoderRegistry>,
    ) -> Ref<AudioResource> {
        return load_audio_resource_from_bytes(self, bytes, mime_type, signal, decoders).await;
    }
}
